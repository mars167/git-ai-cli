import { Command } from 'commander';
import { executeHandler } from '../types';

export const graphCommand = new Command('graph')
  .description('AST graph search powered by CozoDB')
  .addCommand(
    new Command('query')
      .description('Run a CozoScript query against the AST graph database')
      .argument('<script...>', 'CozoScript query')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--params <json>', 'JSON params object', '{}')
      .action(async (scriptParts, options) => {
        await executeHandler('graph:query', { scriptParts, ...options });
      })
  )
  .addCommand(
    new Command('find')
      .description('Find symbols by name prefix')
      .argument('<prefix>', 'Name prefix (case-insensitive)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
      .action(async (prefix, options) => {
        await executeHandler('graph:find', { prefix, ...options });
      })
  )
  .addCommand(
    new Command('children')
      .description('List direct children in the AST containment graph')
      .argument('<id>', 'Parent id (ref_id or file_id)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--as-file', 'Treat <id> as a repository-relative file path and hash it to file_id', false)
      .action(async (id, options) => {
        await executeHandler('graph:children', { id, ...options });
      })
  )
  .addCommand(
    new Command('refs')
      .description('Find reference locations by name (calls/new/type)')
      .argument('<name>', 'Symbol name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--limit <n>', 'Limit results', '200')
      .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
      .action(async (name, options) => {
        await executeHandler('graph:refs', { name, ...options });
      })
  )
  .addCommand(
    new Command('callers')
      .description('Find callers by callee name')
      .argument('<name>', 'Callee name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--limit <n>', 'Limit results', '200')
      .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
      .action(async (name, options) => {
        await executeHandler('graph:callers', { name, ...options });
      })
  )
  .addCommand(
    new Command('callees')
      .description('Find callees by caller name (resolved by exact callee name match in graph)')
      .argument('<name>', 'Caller name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--limit <n>', 'Limit results', '200')
      .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
      .action(async (name, options) => {
        await executeHandler('graph:callees', { name, ...options });
      })
  )
  .addCommand(
    new Command('chain')
      .description('Compute call chain by symbol name (heuristic, name-based)')
      .argument('<name>', 'Start symbol name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--direction <direction>', 'Direction: downstream|upstream', 'downstream')
      .option('--depth <n>', 'Max depth', '3')
      .option('--limit <n>', 'Limit results', '500')
      .option('--min-name-len <n>', 'Filter out edges with very short names (default: 1)', '1')
      .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
      .action(async (name, options) => {
        await executeHandler('graph:chain', { name, ...options });
      })
  );
