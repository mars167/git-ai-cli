import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { getIndexStatus } from '../core/status';

export const statusCommand = new Command('status')
  .description('Show git-ai index status for the current repository')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const status = await getIndexStatus(repoRoot);
      console.log(JSON.stringify(status, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
      process.exit(1);
    }
  });

