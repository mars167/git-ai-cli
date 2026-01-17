#!/usr/bin/env node
import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { aiCommand } from '../src/commands/ai';

function runGit(args: string[]): number {
  const res = spawnSync('git', args, { stdio: 'inherit' });
  return res.status ?? 1;
}

function main() {
  const argv = process.argv;
  const sub = argv[2];
  const isHelpFlag = sub === '-h' || sub === '--help';
  const isVersionFlag = sub === '-v' || sub === '--version';
  const isAi = sub === 'ai';

  if (sub && !isAi && !isHelpFlag && !isVersionFlag && sub !== 'help') {
    const code = runGit(argv.slice(2));
    process.exit(code);
    return;
  }

  const program = new Command();
  program
    .name('git-ai')
    .description('git-ai: git-compatible CLI with AI indexing tools')
    .version('2.0.0');

  program.addCommand(aiCommand);
  program.parse(argv);
}

main();
