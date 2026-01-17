import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { defaultDbDir, openTables } from '../core/lancedb';

export const queryCommand = new Command('query')
  .description('Query refs table by symbol substring')
  .argument('<keyword>', 'Symbol substring')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--limit <n>', 'Limit results', '50')
  .action(async (keyword, options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const dbDir = defaultDbDir(repoRoot);
    const { refs } = await openTables({ dbDir, dim: 256, mode: 'create_if_missing' });

    const limit = Number(options.limit);
    const q = String(keyword);
    const rows = await refs.query().where(`symbol LIKE '%${q.replace(/'/g, "''")}%'`).limit(limit).toArray();
    console.log(JSON.stringify({ repoRoot, count: (rows as any[]).length, rows }, null, 2));
  });

