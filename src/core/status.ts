import fs from 'fs-extra';
import path from 'path';
import { getArchivePaths } from './archive';
import { defaultDbDir } from './lancedb';

export interface IndexMetaStatus {
  path: string;
  exists: boolean;
  mtimeMs?: number;
  data?: any;
  error?: string;
}

export interface IndexStorageStatus {
  path: string;
  exists: boolean;
  tables: string[];
}

export interface IndexArchiveStatus {
  path: string;
  exists: boolean;
  size?: number;
}

export interface IndexStatus {
  ok: boolean;
  repoRoot: string;
  isGitRepo: boolean;
  meta: IndexMetaStatus;
  lancedb: IndexStorageStatus;
  archive: IndexArchiveStatus;
  suggestions: string[];
}

function normalizeTables(entries: string[]): string[] {
  return entries
    .filter(e => !e.startsWith('.') && e.endsWith('.lance'))
    .map(e => e.replace(/\.lance$/, ''))
    .sort((a, b) => a.localeCompare(b));
}

export async function getIndexStatus(repoRoot: string): Promise<IndexStatus> {
  const gitDir = path.join(repoRoot, '.git');
  const isGitRepo = await fs.pathExists(gitDir);

  const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
  const metaExists = await fs.pathExists(metaPath);
  const meta: IndexMetaStatus = { path: metaPath, exists: metaExists };
  if (metaExists) {
    try {
      meta.data = await fs.readJSON(metaPath);
      const st = await fs.stat(metaPath);
      meta.mtimeMs = st.mtimeMs;
    } catch (e) {
      meta.error = e instanceof Error ? e.message : String(e);
    }
  }

  const dbDir = defaultDbDir(repoRoot);
  const lancedbExists = await fs.pathExists(dbDir);
  const lancedbEntries = lancedbExists ? await fs.readdir(dbDir).catch(() => []) : [];
  const tables = normalizeTables(lancedbEntries);
  const lancedb: IndexStorageStatus = { path: dbDir, exists: lancedbExists, tables };

  const { archivePath } = getArchivePaths(repoRoot);
  const archiveExists = await fs.pathExists(archivePath);
  const archive: IndexArchiveStatus = { path: archivePath, exists: archiveExists };
  if (archiveExists) {
    try {
      const st = await fs.stat(archivePath);
      archive.size = st.size;
    } catch {
    }
  }

  const suggestions: string[] = [];
  if (!isGitRepo) {
    suggestions.push('Not a git repository. Run git init or cd into a git repository.');
  }
  if (isGitRepo && !metaExists) {
    suggestions.push("Index not found. Run 'git-ai ai index --overwrite' (or MCP tool 'index_repo').");
  }
  if (isGitRepo && metaExists && !lancedbExists) {
    if (archiveExists) {
      suggestions.push("Index archive exists. Run 'git-ai ai unpack' (or MCP tool 'unpack_index').");
    } else {
      suggestions.push("Index data missing. Run 'git-ai ai index --overwrite' (or MCP tool 'index_repo').");
    }
  }
  if (isGitRepo && lancedbExists && (tables.length === 0 || !tables.includes('chunks') || !tables.includes('refs'))) {
    suggestions.push("Index tables are missing or incomplete. Rebuild with 'git-ai ai index --overwrite'.");
  }

  const ok = isGitRepo && metaExists && lancedbExists && tables.includes('chunks') && tables.includes('refs');

  return { ok, repoRoot, isGitRepo, meta, lancedb, archive, suggestions };
}

