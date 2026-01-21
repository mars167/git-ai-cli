import simpleGit from 'simple-git';
import path from 'path';

export async function resolveGitRoot(startDir: string): Promise<string> {
  const resolved = path.resolve(startDir);
  try {
    const git = simpleGit(resolved);
    const root = await git.raw(['rev-parse', '--show-toplevel']);
    return root.trim();
  } catch {
    return resolved;
  }
}

export function inferScanRoot(repoRoot: string): string {
  const resolved = path.resolve(repoRoot);
  const parts = resolved.split(path.sep).filter(Boolean);
  const repoIdx = parts.lastIndexOf('.repo');
  if (repoIdx >= 0 && repoIdx + 1 < parts.length) {
    const next = parts[repoIdx + 1];
    if (next === 'manifests' || next === 'manifests.git') {
      const prefixParts = parts.slice(0, repoIdx);
      const prefix = prefixParts.length === 0 ? path.parse(resolved).root : path.join(path.parse(resolved).root, ...prefixParts);
      return prefix;
    }
  }
  return resolved;
}
