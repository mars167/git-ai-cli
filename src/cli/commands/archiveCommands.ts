import { Command } from 'commander';
import { executeHandler } from '../types';

export const packCommand = new Command('pack')
  .description('Pack .git-ai/lancedb into .git-ai/lancedb.tar.gz')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--lfs', 'Run git lfs track for .git-ai/lancedb.tar.gz', false)
  .action(async (options) => {
    await executeHandler('pack', options);
  });

export const unpackCommand = new Command('unpack')
  .description('Unpack .git-ai/lancedb.tar.gz into .git-ai/lancedb')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    await executeHandler('unpack', options);
  });
