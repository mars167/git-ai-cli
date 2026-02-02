import { Command } from 'commander';
import { executeHandler } from '../types';

export const dsrCommand = new Command('dsr')
  .description('Deterministic Semantic Record (per-commit, immutable, Git-addressable)')
  .addCommand(
    new Command('context')
      .description('Discover repository root, HEAD, branch, and DSR directory state')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--json', 'Output machine-readable JSON', false)
      .action(async (options) => {
        await executeHandler('dsr:context', options);
      })
  )
  .addCommand(
    new Command('generate')
      .description('Generate DSR for exactly one commit')
      .argument('<commit>', 'Commit hash (any rev that resolves to a commit)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--json', 'Output machine-readable JSON', false)
      .action(async (commit, options) => {
        await executeHandler('dsr:generate', { commit, ...options });
      })
  )
  .addCommand(
    new Command('rebuild-index')
      .description('Rebuild performance-oriented DSR index from DSR files')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--json', 'Output machine-readable JSON', false)
      .action(async (options) => {
        await executeHandler('dsr:rebuild-index', options);
      })
  )
  .addCommand(
    new Command('query')
      .description('Read-only semantic queries over Git DAG + DSR')
      .addCommand(
        new Command('symbol-evolution')
          .description('List commits where a symbol changed (requires DSR per traversed commit)')
          .argument('<symbol>', 'Symbol name')
          .option('-p, --path <path>', 'Path inside the repository', '.')
          .option('--all', 'Traverse all refs (default: from HEAD)', false)
          .option('--start <commit>', 'Start commit (default: HEAD)')
          .option('--limit <n>', 'Max commits to traverse', (v) => Number(v), 200)
          .option('--contains', 'Match by substring instead of exact match', false)
          .option('--json', 'Output machine-readable JSON', false)
          .action(async (symbol, options) => {
            await executeHandler('dsr:symbol-evolution', { symbol, ...options });
          })
      )
  );
