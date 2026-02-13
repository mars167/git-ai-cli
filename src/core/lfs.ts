import { spawnSync } from 'child_process';

function runGit(args: string[], cwd: string, silent: boolean = false) {
  const res = spawnSync('git', args, { cwd, stdio: silent ? 'ignore' : 'inherit' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
}

function isGitRepo(cwd: string): boolean {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, stdio: 'ignore' });
  return res.status === 0;
}

export function isGitLfsInstalled(cwd: string): boolean {
  if (!isGitRepo(cwd)) return false;
  const res = spawnSync('git', ['lfs', 'version'], { cwd, stdio: 'ignore' });
  return res.status === 0;
}

export function ensureLfsTracking(cwd: string, pattern: string): { tracked: boolean } {
  if (!isGitLfsInstalled(cwd)) return { tracked: false };
  runGit(['lfs', 'track', pattern], cwd, true);
  runGit(['add', '.gitattributes'], cwd, true);
  return { tracked: true };
}
