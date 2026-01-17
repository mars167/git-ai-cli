import { Command } from 'commander';
import path from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import { resolveGitRoot } from '../core/git';
import { ensureLfsTracking } from '../core/lfs';

function runGit(cwd: string, args: string[]) {
  const res = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
}

function getGitConfig(cwd: string, key: string): string | null {
  const res = spawnSync('git', ['config', '--get', key], { cwd, stdio: 'pipe', encoding: 'utf-8' });
  if (res.status !== 0) return null;
  const out = String(res.stdout ?? '').trim();
  return out.length > 0 ? out : null;
}

function isGitRepo(cwd: string): boolean {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, stdio: 'ignore' });
  return res.status === 0;
}

async function ensureHooksExecutable(repoRoot: string): Promise<{ changed: number; skipped: boolean }> {
  if (process.platform === 'win32') return { changed: 0, skipped: true };
  const hooksDir = path.join(repoRoot, '.githooks');
  if (!await fs.pathExists(hooksDir)) return { changed: 0, skipped: false };
  const names = await fs.readdir(hooksDir);
  let changed = 0;
  for (const n of names) {
    const p = path.join(hooksDir, n);
    const stat = await fs.stat(p);
    if (!stat.isFile()) continue;
    await fs.chmod(p, 0o755);
    changed++;
  }
  return { changed, skipped: false };
}

async function findPackageRoot(startDir: string): Promise<string> {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const pj = path.join(cur, 'package.json');
    if (await fs.pathExists(pj)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir);
}

async function installHookTemplates(repoRoot: string): Promise<{ installed: string[] }> {
  const hooksDir = path.join(repoRoot, '.githooks');
  await fs.ensureDir(hooksDir);

  const packageRoot = await findPackageRoot(__dirname);
  const templateDir = path.join(packageRoot, 'assets', 'hooks');
  const names = await fs.readdir(templateDir);
  const installed: string[] = [];
  for (const n of names) {
    const src = path.join(templateDir, n);
    const stat = await fs.stat(src);
    if (!stat.isFile()) continue;
    const dst = path.join(hooksDir, n);
    await fs.copyFile(src, dst);
    installed.push(n);
  }
  return { installed };
}

const install = new Command('install')
  .description('Install git hooks (write .githooks/* and set core.hooksPath=.githooks)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--no-lfs', 'Do not run git lfs track for .git-ai/lancedb.tar.gz', false)
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    if (!isGitRepo(repoRoot)) {
      console.log(JSON.stringify({ ok: false, error: 'not_a_git_repo', repoRoot }, null, 2));
      process.exitCode = 1;
      return;
    }
    const templates = await installHookTemplates(repoRoot);
    const exec = await ensureHooksExecutable(repoRoot);
    runGit(repoRoot, ['config', 'core.hooksPath', '.githooks']);
    const lfs = options.lfs !== false ? ensureLfsTracking(repoRoot, '.git-ai/lancedb.tar.gz') : { tracked: false };
    const hooksPath = getGitConfig(repoRoot, 'core.hooksPath');
    console.log(JSON.stringify({ ok: true, repoRoot, hooksPath, templates, executable: exec, lfs }, null, 2));
  });

const uninstall = new Command('uninstall')
  .description('Uninstall git hooks (unset core.hooksPath)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    if (!isGitRepo(repoRoot)) {
      console.log(JSON.stringify({ ok: false, error: 'not_a_git_repo', repoRoot }, null, 2));
      process.exitCode = 1;
      return;
    }
    spawnSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: repoRoot, stdio: 'ignore' });
    const hooksPath = getGitConfig(repoRoot, 'core.hooksPath');
    console.log(JSON.stringify({ ok: true, repoRoot, hooksPath }, null, 2));
  });

const status = new Command('status')
  .description('Show current hooks configuration')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    if (!isGitRepo(repoRoot)) {
      console.log(JSON.stringify({ ok: false, error: 'not_a_git_repo', repoRoot }, null, 2));
      process.exitCode = 1;
      return;
    }
    const hooksPath = getGitConfig(repoRoot, 'core.hooksPath');
    console.log(JSON.stringify({ ok: true, repoRoot, hooksPath, expected: '.githooks', installed: hooksPath === '.githooks' }, null, 2));
  });

export const hooksCommand = new Command('hooks')
  .description('Manage git hooks integration')
  .addCommand(install)
  .addCommand(uninstall)
  .addCommand(status);
