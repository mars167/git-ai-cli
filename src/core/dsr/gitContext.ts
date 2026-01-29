import simpleGit from 'simple-git';

export interface RepoGitContext {
  repo_root: string;
  head_commit: string;
  branch: string | null;
  detached: boolean;
}

export async function detectRepoGitContext(startDir: string): Promise<RepoGitContext> {
  const git = simpleGit(startDir);
  const repo_root = (await git.raw(['rev-parse', '--show-toplevel'])).trim();
  const head_commit = (await simpleGit(repo_root).raw(['rev-parse', 'HEAD'])).trim();
  const branchRaw = (await simpleGit(repo_root).raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const detached = branchRaw === 'HEAD';
  return {
    repo_root,
    head_commit,
    branch: detached ? null : branchRaw,
    detached,
  };
}

export async function getCommitParents(repoRoot: string, commitHash: string): Promise<string[]> {
  const git = simpleGit(repoRoot);
  const out = (await git.raw(['show', '-s', '--format=%P', commitHash])).trim();
  if (!out) return [];
  return out.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

export async function getCommitSubject(repoRoot: string, commitHash: string): Promise<string> {
  const git = simpleGit(repoRoot);
  return (await git.raw(['show', '-s', '--format=%s', commitHash])).trim();
}

export async function assertCommitExists(repoRoot: string, commitHash: string): Promise<void> {
  const git = simpleGit(repoRoot);
  await git.raw(['cat-file', '-e', `${commitHash}^{commit}`]);
}

export async function resolveCommitHash(repoRoot: string, rev: string): Promise<string> {
  const git = simpleGit(repoRoot);
  return (await git.raw(['rev-parse', `${rev}^{commit}`])).trim();
}

export interface NameStatusRow {
  status: string;
  path: string;
}

export async function getNameStatusBetween(repoRoot: string, parent: string | null, commit: string): Promise<NameStatusRow[]> {
  const git = simpleGit(repoRoot);
  const lines = parent
    ? (await git.raw(['diff', '--name-status', '--no-renames', parent, commit])).trim().split('\n')
    : (await git.raw(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', commit])).trim().split('\n');

  const rows: NameStatusRow[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\t');
    const status = (parts[0] ?? '').trim();
    const p = (parts[1] ?? '').trim();
    if (!status || !p) continue;
    rows.push({ status, path: p });
  }
  rows.sort((a, b) => (a.status + '\t' + a.path).localeCompare(b.status + '\t' + b.path));
  return rows;
}

export async function gitShowFile(repoRoot: string, commitHash: string, filePath: string): Promise<string | null> {
  const git = simpleGit(repoRoot);
  try {
    return await git.raw(['show', `${commitHash}:${filePath}`]);
  } catch {
    return null;
  }
}
