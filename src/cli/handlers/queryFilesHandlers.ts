import path from 'path';
import fs from 'fs-extra';
import { inferWorkspaceRoot, resolveGitRoot } from '../../core/git';
import { defaultDbDir, openTablesByLang, type IndexLang } from '../../core/lancedb';
import { queryManifestWorkspace } from '../../core/workspace';
import { inferSymbolSearchMode, type SymbolSearchMode } from '../../core/symbolSearch';
import { createLogger } from '../../core/log';
import { resolveLangs } from '../../core/indexCheck';
import { generateRepoMap, type FileRank } from '../../core/repoMap';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';
import { resolveRepoContext, validateIndex, resolveLanguages, type RepoContext } from '../helpers';
import type { SearchFilesInput } from '../schemas/queryFilesSchemas';

function isCLIError(value: unknown): value is CLIError {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as any).ok === false;
}

async function buildRepoMapAttachment(
  repoRoot: string,
  options: { wiki: string; repoMapFiles: number; repoMapSymbols: number }
): Promise<{ enabled: boolean; wikiDir: string; files: FileRank[] } | { enabled: boolean; skippedReason: string }> {
  try {
    const wikiDir = resolveWikiDir(repoRoot, options.wiki);
    const files = await generateRepoMap({
      repoRoot,
      maxFiles: options.repoMapFiles,
      maxSymbolsPerFile: options.repoMapSymbols,
      wikiDir,
    });
    return { enabled: true, wikiDir, files };
  } catch (e: any) {
    return { enabled: false, skippedReason: String(e?.message ?? e) };
  }
}

function resolveWikiDir(repoRoot: string, wikiOpt: string): string {
  const w = String(wikiOpt ?? '').trim();
  if (w) return path.resolve(repoRoot, w);
  const candidates = [path.join(repoRoot, 'docs', 'wiki'), path.join(repoRoot, 'wiki')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

function inferLangFromFile(file: string): IndexLang {
  const f = String(file);
  if (f.endsWith('.md') || f.endsWith('.mdx')) return 'markdown';
  if (f.endsWith('.yml') || f.endsWith('.yaml')) return 'yaml';
  if (f.endsWith('.java')) return 'java';
  if (f.endsWith('.c') || f.endsWith('.h')) return 'c';
  if (f.endsWith('.go')) return 'go';
  if (f.endsWith('.py')) return 'python';
  if (f.endsWith('.rs')) return 'rust';
  return 'ts';
}

function filterWorkspaceRowsByLang(rows: any[], langSel: string): any[] {
  const sel = String(langSel ?? 'auto');
  if (sel === 'auto' || sel === 'all') return rows;
  const target = sel as IndexLang;
  return rows.filter(r => inferLangFromFile(String((r as any).file ?? '')) === target);
}

function escapeQuotes(s: string): string {
  return s.replace(/'/g, "''");
}

function buildFileWhere(pattern: string, mode: SymbolSearchMode, caseInsensitive: boolean): string | null {
  const safe = escapeQuotes(pattern);
  if (!safe) return null;
  const likeOp = caseInsensitive ? 'ILIKE' : 'LIKE';

  if (mode === 'prefix') {
    return `file ${likeOp} '${safe}%'`;
  }

  if (mode === 'substring' || mode === 'wildcard') {
    return `file ${likeOp} '%${safe}%'`;
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

  if (inferWorkspaceRoot(repoRoot)) {
    const res = await queryManifestWorkspace({
      manifestRepoRoot: repoRoot,
      keyword: input.pattern,
      limit: input.maxCandidates,
    });
    const filteredByLang = filterWorkspaceRowsByLang(res.rows, input.lang);
    const rows = filterAndRankFileRows(
      filteredByLang,
      input.pattern,
      mode,
      input.caseInsensitive,
      input.limit
    );
    log.info('query_files', {
      ok: true,
      repoRoot,
      workspace: true,
      mode,
      case_insensitive: input.caseInsensitive,
      limit: input.limit,
      max_candidates: input.maxCandidates,
      candidates: res.rows.length,
      rows: rows.length,
      duration_ms: Date.now() - startedAt,
    });
    const repoMap = input.withRepoMap
      ? { enabled: false, skippedReason: 'workspace_mode_not_supported' }
      : undefined;
    return success({ ...res, rows, ...(repoMap ? { repo_map: repoMap } : {}) });
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

      // Fetch candidates based on mode
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
