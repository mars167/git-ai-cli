import { Command } from 'commander';
import { executeHandler } from '../types';

export const repoMapCommand = new Command('repo-map')
  .description('Generate a lightweight repository map (ranked files + top symbols + wiki links)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--max-files <n>', 'Maximum files to include', '20')
  .option('--max-symbols <n>', 'Maximum symbols per file', '5')
  .option('--depth <n>', 'PageRank iterations (1-20)', '5')
  .option('--max-nodes <n>', 'Maximum symbols to process (performance)', '5000')
  .option('--wiki <dir>', 'Wiki directory relative to repo root', '')
  .action(async (options) => {
    await executeHandler('repo-map', options);
  });
