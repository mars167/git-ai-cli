import fs from 'fs-extra';
import path from 'path';
import * as tar from 'tar';

export interface ArchivePaths {
  gitAiDir: string;
  lancedbDir: string;
  archivePath: string;
}

export function getArchivePaths(repoRoot: string): ArchivePaths {
  const gitAiDir = path.join(repoRoot, '.git-ai');
  const lancedbDir = path.join(gitAiDir, 'lancedb');
  const archivePath = path.join(gitAiDir, 'lancedb.tar.gz');
  return { gitAiDir, lancedbDir, archivePath };
}

export async function packLanceDb(repoRoot: string): Promise<{ archivePath: string; packed: boolean }> {
  const { gitAiDir, lancedbDir, archivePath } = getArchivePaths(repoRoot);
  await fs.ensureDir(gitAiDir);
  if (!await fs.pathExists(lancedbDir)) {
    return { archivePath, packed: false };
  }
  await fs.remove(archivePath);
  await tar.c({ gzip: true, file: archivePath, cwd: gitAiDir }, ['lancedb']);
  return { archivePath, packed: true };
}

export async function unpackLanceDb(repoRoot: string): Promise<{ archivePath: string; unpacked: boolean }> {
  const { gitAiDir, lancedbDir, archivePath } = getArchivePaths(repoRoot);
  if (!await fs.pathExists(archivePath)) {
    return { archivePath, unpacked: false };
  }
  await fs.ensureDir(gitAiDir);
  await fs.remove(lancedbDir);
  await tar.x({ file: archivePath, cwd: gitAiDir });
  return { archivePath, unpacked: true };
}
