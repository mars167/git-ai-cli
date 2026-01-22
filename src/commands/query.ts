import { Command } from 'commander';
import path from 'path';
import { inferWorkspaceRoot, resolveGitRoot } from '../core/git';
import { defaultDbDir, openTables } from '../core/lancedb';
import { queryManifestWorkspace } from '../core/workspace';
import { buildCoarseWhere, filterAndRankSymbolRows, inferSymbolSearchMode, pickCoarseToken, SymbolSearchMode } from '../core/symbolSearch';

export const queryCommand = new Command('query')
  .description('Query refs table by symbol match (substring/prefix/wildcard/regex/fuzzy)')
  .argument('<keyword>', 'Symbol substring')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--limit <n>', 'Limit results', '50')
  .option('--mode <mode>', 'Mode: substring|prefix|wildcard|regex|fuzzy (default: auto)')
  .option('--case-insensitive', 'Case-insensitive matching', false)
  .option('--max-candidates <n>', 'Max candidates to fetch before filtering', '1000')
  .action(async (keyword, options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const limit = Number(options.limit);
    const q = String(keyword);
    const mode = inferSymbolSearchMode(q, options.mode as SymbolSearchMode | undefined);
    const caseInsensitive = Boolean(options.caseInsensitive ?? false);
    const maxCandidates = Math.max(limit, Number(options.maxCandidates ?? Math.min(2000, limit * 20)));
    if (inferWorkspaceRoot(repoRoot)) {
      const coarse = (mode === 'substring' || mode === 'prefix') ? q : pickCoarseToken(q);
      const res = await queryManifestWorkspace({ manifestRepoRoot: repoRoot, keyword: coarse, limit: maxCandidates });
      const rows = filterAndRankSymbolRows(res.rows, { query: q, mode, caseInsensitive, limit });
      console.log(JSON.stringify({ ...res, rows }, null, 2));
      return;
    }

    const dbDir = defaultDbDir(repoRoot);
    const { refs } = await openTables({ dbDir, dim: 256, mode: 'create_if_missing' });
    const where = buildCoarseWhere({ query: q, mode, caseInsensitive });
    const candidates = where
      ? await refs.query().where(where).limit(maxCandidates).toArray()
      : await refs.query().limit(maxCandidates).toArray();
    const rows = filterAndRankSymbolRows(candidates as any[], { query: q, mode, caseInsensitive, limit });
    console.log(JSON.stringify({ repoRoot, count: rows.length, rows }, null, 2));
  });
