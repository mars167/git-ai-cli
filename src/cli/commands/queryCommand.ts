import { Command } from 'commander';
import { executeHandler } from '../types.js';

export const queryCommand = new Command('query')
  .description('Query refs table by symbol match (substring/prefix/wildcard/regex/fuzzy)')
  .argument('<keyword>', 'Symbol substring')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--limit <n>', 'Limit results', '50')
  .option('--mode <mode>', 'Mode: substring|prefix|wildcard|regex|fuzzy (default: auto)')
  .option('--case-insensitive', 'Case-insensitive matching', false)
  .option('--max-candidates <n>', 'Max candidates to fetch before filtering', '1000')
  .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
  .option('--with-repo-map', 'Attach a lightweight repo map (ranked files + top symbols + wiki links)', false)
  .option('--repo-map-files <n>', 'Max repo map files', '20')
  .option('--repo-map-symbols <n>', 'Max repo map symbols per file', '5')
  .option('--wiki <dir>', 'Wiki directory (default: docs/wiki or wiki)', '')
  .action(async (keyword, options) => {
    await executeHandler('query', { keyword, ...options });
  });
