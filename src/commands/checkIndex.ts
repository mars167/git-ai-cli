import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { checkIndex } from '../core/indexCheck';

export const checkIndexCommand = new Command('check-index')
  .description('Deprecated: use `git-ai ai status --json`')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const res = await checkIndex(repoRoot);
    console.log(JSON.stringify({ repoRoot, ...res }, null, 2));
    process.exit(res.ok ? 0 : 2);
  });
