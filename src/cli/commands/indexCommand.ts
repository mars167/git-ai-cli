import { Command } from 'commander';
import { executeHandler } from '../types.js';

export const indexCommand = new Command('index')
  .description('Build LanceDB+SQ8 index for the current repository (HEAD working tree)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('-d, --dim <dim>', 'Embedding dimension', '256')
  .option('--overwrite', 'Overwrite existing tables', false)
  .option('--incremental', 'Incremental indexing (only changed files)', false)
  .option('--staged', 'Read changed file contents from Git index (staged)', false)
  .action(async (options) => {
    await executeHandler('index', options);
  });
