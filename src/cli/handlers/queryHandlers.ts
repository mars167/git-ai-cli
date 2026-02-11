import path from 'path';
import { inferWorkspaceRoot, resolveGitRoot } from '../../core/git';
import { defaultDbDir, openTablesByLang, type IndexLang } from '../../core/lancedb';
import { queryManifestWorkspace } from '../../core/workspace';
import { buildCoarseWhere, filterAndRankSymbolRows, inferSymbolSearchMode, pickCoarseToken, type SymbolSearchMode } from '../../core/symbolSearch';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';
import { resolveRepoContext, validateIndex, resolveLanguages, type RepoContext } from '../helpers';
import {
  isCLIError,
  buildRepoMapAttachment,
  filterWorkspaceRowsByLang,
} from './sharedHelpers';

export async function handleSearchSymbols(input: {
  keyword: string;
  path: string;
  limit: number;
  mode?: SymbolSearchMode;
  caseInsensitive: boolean;
  maxCandidates: number;
  lang: string;
  withRepoMap: boolean;
  repoMapFiles: number;
  repoMapSymbols: number;
  wiki: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'query' });
  const startedAt = Date.now();

  const repoRoot = await resolveGitRoot(path.resolve(input.path));
  const mode = inferSymbolSearchMode(input.keyword, input.mode);

  if (inferWorkspaceRoot(repoRoot)) {
    const coarse = (mode === 'substring' || mode === 'prefix') ? input.keyword : pickCoarseToken(input.keyword);
    const res = await queryManifestWorkspace({ manifestRepoRoot: repoRoot, keyword: coarse, limit: input.maxCandidates });
    const filteredByLang = filterWorkspaceRowsByLang(res.rows, input.lang);
    const rows = filterAndRankSymbolRows(filteredByLang, {
      query: input.keyword,
      mode,
      caseInsensitive: input.caseInsensitive,
      limit: input.limit,
    });
    log.info('query_symbols', {
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
    const where = buildCoarseWhere({ query: input.keyword, mode, caseInsensitive: input.caseInsensitive });
    const candidates: any[] = [];
    for (const lang of langs) {
      const t = byLang[lang as IndexLang];
      if (!t) continue;
      const rows = where
        ? await t.refs.query().where(where).limit(input.maxCandidates).toArray()
        : await t.refs.query().limit(input.maxCandidates).toArray();
      for (const r of rows as any[]) candidates.push({ ...r, lang });
    }
    const rows = filterAndRankSymbolRows(candidates, { query: input.keyword, mode, caseInsensitive: input.caseInsensitive, limit: input.limit });
    log.info('query_symbols', {
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
    log.error('query_symbols', { ok: false, duration_ms: Date.now() - startedAt, err: message });
    return error('query_symbols_failed', { message });
  }
}
