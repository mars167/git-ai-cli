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

