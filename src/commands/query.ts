import { Command } from 'commander';
import path from 'path';
import { inferWorkspaceRoot, resolveGitRoot } from '../core/git';
import { defaultDbDir, openTablesByLang } from '../core/lancedb';
import { queryManifestWorkspace } from '../core/workspace';
import { buildCoarseWhere, filterAndRankSymbolRows, inferSymbolSearchMode, pickCoarseToken, SymbolSearchMode } from '../core/symbolSearch';
import { createLogger } from '../core/log';
import { checkIndex, resolveLangs } from '../core/indexCheck';

export const queryCommand = new Command('query')
  .description('Query refs table by symbol match (substring/prefix/wildcard/regex/fuzzy)')
  .argument('<keyword>', 'Symbol substring')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--limit <n>', 'Limit results', '50')
  .option('--mode <mode>', 'Mode: substring|prefix|wildcard|regex|fuzzy (default: auto)')
  .option('--case-insensitive', 'Case-insensitive matching', false)
  .option('--max-candidates <n>', 'Max candidates to fetch before filtering', '1000')
  .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
  .action(async (keyword, options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai query' });
    const startedAt = Date.now();
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const limit = Number(options.limit);
      const q = String(keyword);
      const mode = inferSymbolSearchMode(q, options.mode as SymbolSearchMode | undefined);
      const caseInsensitive = Boolean(options.caseInsensitive ?? false);
      const maxCandidates = Math.max(limit, Number(options.maxCandidates ?? Math.min(2000, limit * 20)));
      const langSel = String(options.lang ?? 'auto');

      if (inferWorkspaceRoot(repoRoot)) {
        const coarse = (mode === 'substring' || mode === 'prefix') ? q : pickCoarseToken(q);
        const res = await queryManifestWorkspace({ manifestRepoRoot: repoRoot, keyword: coarse, limit: maxCandidates });
        const filteredByLang = (langSel === 'java')
          ? res.rows.filter(r => String((r as any).file ?? '').endsWith('.java'))
          : (langSel === 'ts')
            ? res.rows.filter(r => !String((r as any).file ?? '').endsWith('.java'))
            : res.rows;
        const rows = filterAndRankSymbolRows(filteredByLang, { query: q, mode, caseInsensitive, limit });
        log.info('query_symbols', { ok: true, repoRoot, workspace: true, mode, case_insensitive: caseInsensitive, limit, max_candidates: maxCandidates, candidates: res.rows.length, rows: rows.length, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ ...res, rows }, null, 2));
        return;
      }

      const status = await checkIndex(repoRoot);
      if (!status.ok) {
        process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
        process.exit(2);
        return;
      }

      const langs = resolveLangs(status.found.meta ?? null, langSel as any);
      if (langs.length === 0) {
        process.stderr.write(JSON.stringify({ ok: false, reason: 'lang_not_available', lang: langSel, available: status.found.meta?.languages ?? [] }, null, 2) + '\n');
        process.exit(2);
        return;
      }

      const dbDir = defaultDbDir(repoRoot);
      const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
      const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs });
      const where = buildCoarseWhere({ query: q, mode, caseInsensitive });
      const candidates: any[] = [];
      for (const lang of langs) {
        const t = byLang[lang];
        if (!t) continue;
        const rows = where
          ? await t.refs.query().where(where).limit(maxCandidates).toArray()
          : await t.refs.query().limit(maxCandidates).toArray();
        for (const r of rows as any[]) candidates.push({ ...r, lang });
      }
      const rows = filterAndRankSymbolRows(candidates as any[], { query: q, mode, caseInsensitive, limit });
      log.info('query_symbols', { ok: true, repoRoot, workspace: false, lang: langSel, langs, mode, case_insensitive: caseInsensitive, limit, max_candidates: maxCandidates, candidates: candidates.length, rows: rows.length, duration_ms: Date.now() - startedAt });
      console.log(JSON.stringify({ repoRoot, count: rows.length, lang: langSel, rows }, null, 2));
    } catch (e) {
      log.error('query_symbols', { ok: false, duration_ms: Date.now() - startedAt, err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } });
      process.exit(1);
    }
  });
