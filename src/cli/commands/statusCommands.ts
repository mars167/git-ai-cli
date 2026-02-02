import { Command } from 'commander';
import { executeHandler } from '../types';

export const checkIndexCommand = new Command('check-index')
  .description('Deprecated: use `git-ai ai status --json`')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    await executeHandler('checkIndex', options);
  });

export const statusCommand = new Command('status')
  .description('Show repository index status')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (options) => {
    await executeHandler('status', options);
  });
