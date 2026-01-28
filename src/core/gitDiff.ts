import simpleGit from 'simple-git';

export type GitNameStatus = 'A' | 'M' | 'D' | 'R';

export interface GitDiffPathChange {
  status: GitNameStatus;
  path: string;
  oldPath?: string;
}

function splitZ(raw: string): string[] {
  return raw.split('\0').map((s) => s.trim()).filter(Boolean);
}

export async function getStagedNameStatus(repoRoot: string): Promise<GitDiffPathChange[]> {
  const git = simpleGit(repoRoot);
  const raw = await git.raw(['diff', '--cached', '--name-status', '-z', '--find-renames']);
  const parts = splitZ(raw);
  const out: GitDiffPathChange[] = [];

  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? '';
    if (!entry) continue;

    const tabIdx = entry.indexOf('\t');
    const statusRaw = tabIdx >= 0 ? entry.slice(0, tabIdx) : entry;
    const rest = tabIdx >= 0 ? entry.slice(tabIdx + 1) : '';
    const statusLetter = statusRaw[0] ?? '';

    if (statusLetter === 'R') {
      const oldPath = rest;
      const newPath = parts[i + 1] ?? '';
      i += 1;
      if (oldPath && newPath) out.push({ status: 'R', oldPath, path: newPath });
      continue;
    }

    if (statusLetter === 'A' || statusLetter === 'M' || statusLetter === 'D') {
      const p = rest;
      if (p) out.push({ status: statusLetter, path: p });
      continue;
    }
  }

  out.sort((a, b) => `${a.status}\t${a.oldPath ?? ''}\t${a.path}`.localeCompare(`${b.status}\t${b.oldPath ?? ''}\t${b.path}`));
  return out;
}

export async function getWorktreeNameStatus(repoRoot: string): Promise<GitDiffPathChange[]> {
  const git = simpleGit(repoRoot);
  const raw = await git.raw(['diff', '--name-status', '-z', '--find-renames']);
  const parts = splitZ(raw);
  const out: GitDiffPathChange[] = [];

  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? '';
    if (!entry) continue;

    const tabIdx = entry.indexOf('\t');
    const statusRaw = tabIdx >= 0 ? entry.slice(0, tabIdx) : entry;
    const rest = tabIdx >= 0 ? entry.slice(tabIdx + 1) : '';
    const statusLetter = statusRaw[0] ?? '';

    if (statusLetter === 'R') {
      const oldPath = rest;
      const newPath = parts[i + 1] ?? '';
      i += 1;
      if (oldPath && newPath) out.push({ status: 'R', oldPath, path: newPath });
      continue;
    }

    if (statusLetter === 'A' || statusLetter === 'M' || statusLetter === 'D') {
      const p = rest;
      if (p) out.push({ status: statusLetter, path: p });
      continue;
    }
  }

  out.sort((a, b) => `${a.status}\t${a.oldPath ?? ''}\t${a.path}`.localeCompare(`${b.status}\t${b.oldPath ?? ''}\t${b.path}`));
  return out;
}
