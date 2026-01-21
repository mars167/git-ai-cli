import { Command } from 'commander';
import path from 'path';
import { inferWorkspaceRoot, resolveGitRoot } from '../core/git';
import { defaultDbDir, openTables } from '../core/lancedb';
import { getIndexStatus } from '../core/status';
import { queryManifestWorkspace } from '../core/workspace';

export const queryCommand = new Command('query')
  .description('Query refs table by symbol substring')
  .argument('<keyword>', 'Symbol substring')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--limit <n>', 'Limit results', '50')
  .action(async (keyword, options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const limit = Number(options.limit);
    const q = String(keyword);
    if (inferWorkspaceRoot(repoRoot)) {
      const res = await queryManifestWorkspace({ manifestRepoRoot: repoRoot, keyword: q, limit });
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    const status = await getIndexStatus(repoRoot);
    if (!status.ok) {
      console.log(JSON.stringify({ ok: false, error: 'Index not ready', status }, null, 2));
      process.exit(1);
    }

    const dbDir = defaultDbDir(repoRoot);
    const { refs } = await openTables({ dbDir, dim: 256, mode: 'create_if_missing' });
    const rows = await refs.query().where(`symbol LIKE '%${q.replace(/'/g, "''")}%'`).limit(limit).toArray();
    console.log(JSON.stringify({ repoRoot, count: (rows as any[]).length, rows }, null, 2));
  });
