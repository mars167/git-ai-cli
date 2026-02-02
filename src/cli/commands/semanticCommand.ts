import { Command } from 'commander';
import { executeHandler } from '../types.js';

export const semanticCommand = new Command('semantic')
  .description('Semantic search using SQ8 vectors (brute-force over chunks)')
  .argument('<text>', 'Query text')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('-k, --topk <k>', 'Top K results', '10')
  .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
  .option('--with-repo-map', 'Attach a lightweight repo map (ranked files + top symbols + wiki links)', false)
  .option('--repo-map-files <n>', 'Max repo map files', '20')
  .option('--repo-map-symbols <n>', 'Max repo map symbols per file', '5')
  .option('--wiki <dir>', 'Wiki directory (default: docs/wiki or wiki)', '')
  .action(async (text, options) => {
    await executeHandler('semantic', { text, ...options });
  });
