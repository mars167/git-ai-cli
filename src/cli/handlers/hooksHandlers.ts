import path from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import { resolveGitRoot } from '../../core/git';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';

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
  const names = new Set(await fs.readdir(hooksDir));
  const targets = ['pre-commit', 'pre-push', 'post-checkout', 'post-merge'].filter(n => names.has(n));
  let changed = 0;
  for (const n of targets) {
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

export async function handleInstallHooks(input: {
  path: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'hooks:install' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    if (!isGitRepo(repoRoot)) {
      log.error('hooks:install', { ok: false, error: 'not_a_git_repo', repoRoot });
      return error('not_a_git_repo', { repoRoot, message: 'Not a git repository' });
    }
    const templates = await installHookTemplates(repoRoot);
    const exec = await ensureHooksExecutable(repoRoot);
    runGit(repoRoot, ['config', 'core.hooksPath', '.githooks']);
    const hooksPath = getGitConfig(repoRoot, 'core.hooksPath');

    log.info('hooks_install', {
      ok: true,
      repoRoot,
      hooksPath,
      templates,
      duration_ms: Date.now() - startedAt,
    });

    return success({ ok: true, repoRoot, hooksPath, templates, executable: exec });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('hooks:install', { ok: false, err: message });
    return error('hooks_install_failed', { message });
  }
}

export async function handleUninstallHooks(input: {
  path: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'hooks:uninstall' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    if (!isGitRepo(repoRoot)) {
      log.error('hooks:uninstall', { ok: false, error: 'not_a_git_repo', repoRoot });
      return error('not_a_git_repo', { repoRoot, message: 'Not a git repository' });
    }
    spawnSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: repoRoot, stdio: 'ignore' });
    const hooksPath = getGitConfig(repoRoot, 'core.hooksPath');

    log.info('hooks_uninstall', {
      ok: true,
      repoRoot,
      hooksPath,
      duration_ms: Date.now() - startedAt,
    });

    return success({ ok: true, repoRoot, hooksPath });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('hooks:uninstall', { ok: false, err: message });
    return error('hooks_uninstall_failed', { message });
  }
}

export async function handleHooksStatus(input: {
  path: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'hooks:status' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    if (!isGitRepo(repoRoot)) {
      log.error('hooks:status', { ok: false, error: 'not_a_git_repo', repoRoot });
      return error('not_a_git_repo', { repoRoot, message: 'Not a git repository' });
    }
    const hooksPath = getGitConfig(repoRoot, 'core.hooksPath');

    log.info('hooks_status', {
      ok: true,
      repoRoot,
      hooksPath,
      duration_ms: Date.now() - startedAt,
    });

    return success({
      ok: true,
      repoRoot,
      hooksPath,
      expected: '.githooks',
      installed: hooksPath === '.githooks',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('hooks:status', { ok: false, err: message });
    return error('hooks_status_failed', { message });
  }
}
