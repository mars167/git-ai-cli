import fs from 'fs-extra';
import path from 'path';
import { dsrCacheRoot, dsrDirectory } from './paths';

export interface DsrDirectoryState {
  cache_root: string;
  cache_root_exists: boolean;
  dsr_dir: string;
  dsr_dir_exists: boolean;
  dsr_file_count: number;
}

export async function getDsrDirectoryState(repoRoot: string): Promise<DsrDirectoryState> {
  const cache_root = dsrCacheRoot(repoRoot);
  const dsr_dir = dsrDirectory(repoRoot);
  const cache_root_exists = await fs.pathExists(cache_root);
  const dsr_dir_exists = await fs.pathExists(dsr_dir);
  let dsr_file_count = 0;
  if (dsr_dir_exists) {
    const entries = await fs.readdir(dsr_dir).catch(() => []);
    dsr_file_count = entries.filter((e) => e.endsWith('.json') && !e.endsWith('.export.json')).length;
  }
  return {
    cache_root: path.resolve(cache_root),
    cache_root_exists,
    dsr_dir: path.resolve(dsr_dir),
    dsr_dir_exists,
    dsr_file_count,
  };
}
