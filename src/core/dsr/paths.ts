import path from 'path';

export function dsrCacheRoot(repoRoot: string): string {
  return path.join(repoRoot, '.git-ai');
}

export function dsrDirectory(repoRoot: string): string {
  return path.join(dsrCacheRoot(repoRoot), 'dsr');
}

export function dsrFilePath(repoRoot: string, commitHash: string): string {
  return path.join(dsrDirectory(repoRoot), `${commitHash}.json`);
}

export function dsrIndexDbPath(repoRoot: string): string {
  return path.join(dsrDirectory(repoRoot), 'dsr-index.sqlite');
}

export function dsrIndexExportPath(repoRoot: string): string {
  return path.join(dsrDirectory(repoRoot), 'dsr-index.export.json');
}
