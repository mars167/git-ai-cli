import { spawnSync } from 'child_process';

function runGit(args: string[], cwd: string) {
  const res = spawnSync('git', args, { cwd, stdio: 'inherit' });
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
  runGit(['lfs', 'track', pattern], cwd);
  runGit(['add', '.gitattributes'], cwd);
  return { tracked: true };
}
