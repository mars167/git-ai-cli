#!/usr/bin/env node
import { Command } from 'commander';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { aiCommand } from '../src/commands/ai';

function runGit(args: string[]): number {
  const res = spawnSync('git', args, { stdio: 'inherit' });
  return res.status ?? 1;
}

function findPackageJson(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readVersionFromPackageJson(): string {
  const pkgPath = findPackageJson(__dirname);
  if (!pkgPath) return '0.0.0';
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return typeof parsed?.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
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
  const version = readVersionFromPackageJson();
  program
    .name('git-ai')
    .description('git-ai: git-compatible CLI with AI indexing tools')
    .version(version);

  program.addCommand(aiCommand);
  program.parse(argv);
}

main();
