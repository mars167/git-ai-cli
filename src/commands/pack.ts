import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { packLanceDb } from '../core/archive';
import { ensureLfsTracking } from '../core/lfs';

export const packCommand = new Command('pack')
  .description('Pack .git-ai/lancedb into .git-ai/lancedb.tar.gz')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--lfs', 'Run git lfs track for .git-ai/lancedb.tar.gz', false)
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const packed = await packLanceDb(repoRoot);
    const lfs = options.lfs ? ensureLfsTracking(repoRoot, '.git-ai/lancedb.tar.gz') : { tracked: false };
    console.log(JSON.stringify({ repoRoot, ...packed, lfs }, null, 2));
  });
