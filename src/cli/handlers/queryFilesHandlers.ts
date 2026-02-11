import path from 'path';
import { inferWorkspaceRoot, resolveGitRoot } from '../../core/git';
import { defaultDbDir, openTablesByLang, type IndexLang } from '../../core/lancedb';
import { inferSymbolSearchMode, type SymbolSearchMode } from '../../core/symbolSearch';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';
import { resolveRepoContext, validateIndex, resolveLanguages, type RepoContext } from '../helpers';
import type { SearchFilesInput } from '../schemas/queryFilesSchemas';
import {
  isCLIError,
  buildRepoMapAttachment,
  filterWorkspaceRowsByLang,
} from './sharedHelpers';

function escapeQuotes(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Convert a glob pattern to a SQL LIKE pattern.
 * Escapes SQL LIKE wildcards (% and _), then converts glob * to % and ? to _.
 */
function globToSqlLike(pattern: string): string {
  let like = pattern.replace(/\\/g, '\\\\').replace(/([%_])/g, '\\$1');
  like = like.replace(/\*/g, '%').replace(/\?/g, '_');
  return like;
}

function buildFileWhere(pattern: string, mode: SymbolSearchMode, caseInsensitive: boolean): string | null {
  if (!pattern) return null;
  const likeOp = caseInsensitive ? 'ILIKE' : 'LIKE';

  if (mode === 'prefix') {
    const safe = escapeQuotes(pattern);
    if (!safe) return null;
    return `file ${likeOp} '${safe}%'`;
  }

  if (mode === 'substring') {
    const safe = escapeQuotes(pattern);
    if (!safe) return null;
    return `file ${likeOp} '%${safe}%'`;
  }

  if (mode === 'wildcard') {
    const likePattern = globToSqlLike(pattern);
    const safeLike = escapeQuotes(likePattern);
    if (!safeLike) return null;
    return `file ${likeOp} '${safeLike}'`;
  }

  // For regex and fuzzy, we'll handle them in memory after fetching
  return null;
}

function buildRegex(pattern: string, caseInsensitive: boolean): RegExp | null {
  try {
    const flags = caseInsensitive ? 'i' : '';
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function globToRegex(pattern: string, caseInsensitive: boolean): RegExp | null {
  try {
    const body = pattern
      .split('')
      .map(ch => {
        if (ch === '*') return '.*';
        if (ch === '?') return '.';
        return escapeRegex(ch);
      })
      .join('');
    const flags = caseInsensitive ? 'i' : '';
    return new RegExp(`^${body}$`, flags);
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function filterAndRankFileRows<T extends Record<string, any>>(
  rows: T[],
  pattern: string,
  mode: SymbolSearchMode,
  caseInsensitive: boolean,
  limit: number
): T[] {
  const getFile = (r: any) => String(r?.file ?? '');
  const finalLimit = Math.max(1, limit);

  if (mode === 'substring' || mode === 'prefix') {
    const p = caseInsensitive ? pattern.toLowerCase() : pattern;
    const filtered = rows.filter(r => {
      const f = getFile(r);
      const fs = caseInsensitive ? f.toLowerCase() : f;
      return mode === 'prefix' ? fs.startsWith(p) : fs.includes(p);
    });
    return filtered.slice(0, finalLimit);
  }

  if (mode === 'wildcard') {
    const re = globToRegex(pattern, caseInsensitive);
    if (!re) return [];
    const filtered = rows.filter(r => re!.test(getFile(r)));
    return filtered.slice(0, finalLimit);
  }

  if (mode === 'regex') {
    const re = buildRegex(pattern, caseInsensitive);
    if (!re) return [];
    const filtered = rows.filter(r => re!.test(getFile(r)));
    return filtered.slice(0, finalLimit);
  }

  // Fuzzy matching for files
  const scored = rows
    .map(r => {
      const f = getFile(r);
      const score = fuzzyFileScore(pattern, f, caseInsensitive);
      return { r, score };
    })
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, finalLimit);

  return scored.map(x => x.r);
}

function fuzzyFileScore(needle: string, haystack: string, caseInsensitive: boolean): number {
  if (!needle) return 0;
  const n = caseInsensitive ? needle.toLowerCase() : needle;
  const h = caseInsensitive ? haystack.toLowerCase() : haystack;

  let i = 0;
  let score = 0;
  let lastMatch = -2;

  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h[j] === n[i]) {
      score += j === lastMatch + 1 ? 2 : 1;
      lastMatch = j;
      i++;
    }
  }

  if (i < n.length) return -1;
  return score;
}

export async function handleSearchFiles(input: SearchFilesInput): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'query-files' });
  const startedAt = Date.now();

  const repoRoot = await resolveGitRoot(path.resolve(input.path));
  const mode = inferSymbolSearchMode(input.pattern, input.mode);

  // Workspace mode is not supported for query-files because
  // queryManifestWorkspace queries by symbol, not by file name.
  if (inferWorkspaceRoot(repoRoot)) {
    const durationMs = Date.now() - startedAt;
    log.info('query_files', {
      ok: false,
      repoRoot,
      workspace: true,
      mode,
      case_insensitive: input.caseInsensitive,
      limit: input.limit,
      max_candidates: input.maxCandidates,
      candidates: 0,
      rows: 0,
      duration_ms: durationMs,
      error: 'workspace_mode_not_supported_for_query_files',
    });
    return error('workspace_mode_not_supported_for_query_files', {
      message:
        'query-files does not currently support workspace manifests. ' +
        'Please run this command from a non-workspace repository root or disable workspace mode.',
    });
  }

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  const langs = resolveLanguages(ctx.meta, input.lang);
  if (langs.length === 0) {
    return error('lang_not_available', {
      lang: input.lang,
      available: ctx.meta?.languages ?? [],
    });
  }

  try {
    const dbDir = defaultDbDir(ctx.repoRoot);
    const dim = typeof ctx.meta?.dim === 'number' ? ctx.meta.dim : 256;
    const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs as IndexLang[] });

    // Build WHERE clause based on mode
    const where = buildFileWhere(input.pattern, mode, input.caseInsensitive);

    const candidates: any[] = [];
    for (const lang of langs) {
      const t = byLang[lang as IndexLang];
      if (!t) continue;

      // For regex/fuzzy, we fetch all and filter in memory
      const shouldFetchAll = mode === 'regex' || mode === 'fuzzy';
      const rows = shouldFetchAll
        ? await t.refs.query().limit(input.maxCandidates).toArray()
        : where
        ? await t.refs.query().where(where).limit(input.maxCandidates).toArray()
        : await t.refs.query().limit(input.maxCandidates).toArray();

      for (const r of rows as any[]) candidates.push({ ...r, lang });
    }

    // Filter and rank by file name
    const rows = filterAndRankFileRows(candidates, input.pattern, mode, input.caseInsensitive, input.limit);

    log.info('query_files', {
      ok: true,
      repoRoot: ctx.repoRoot,
      workspace: false,
      lang: input.lang,
      langs,
      mode,
      case_insensitive: input.caseInsensitive,
      limit: input.limit,
      max_candidates: input.maxCandidates,
      candidates: candidates.length,
      rows: rows.length,
      duration_ms: Date.now() - startedAt,
    });

    const repoMap = input.withRepoMap ? await buildRepoMapAttachment(ctx.repoRoot, input) : undefined;

    return success({
      repoRoot: ctx.repoRoot,
      count: rows.length,
      lang: input.lang,
      rows,
      ...(repoMap ? { repo_map: repoMap } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('query_files', { ok: false, duration_ms: Date.now() - startedAt, err: message });
    return error('query_files_failed', { message });
  }
}
