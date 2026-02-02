import { Command } from 'commander';
import { executeHandler } from '../types';

export const hooksCommand = new Command('hooks')
  .description('Manage git hooks integration')
  .addCommand(
    new Command('install')
      .description('Install git hooks (write .githooks/* and set core.hooksPath=.githooks)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .action(async (options) => {
        await executeHandler('hooks:install', options);
      })
  )
  .addCommand(
    new Command('uninstall')
      .description('Uninstall git hooks (unset core.hooksPath)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .action(async (options) => {
        await executeHandler('hooks:uninstall', options);
      })
  )
  .addCommand(
    new Command('status')
      .description('Show current hooks configuration')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .action(async (options) => {
        await executeHandler('hooks:status', options);
      })
  );
