import fs from 'fs-extra';
import path from 'path';
import simpleGit from 'simple-git';
import { inferWorkspaceRoot } from './git';
import { unpackLanceDb } from './archive';
import { defaultDbDir, openTablesByLang } from './lancedb';
import { IndexerV2 } from './indexer';
import { buildCloneUrl, loadRepoManifestFromManifestsRepo, resolveProjectFetch, resolveProjectRevision, RepoManifestProject } from './manifest';
import { checkIndex, resolveLangs } from './indexCheck';

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

async function isGitRepo(dir: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, '.git'));
}

async function ensureCheckedOut(repoDir: string, revision?: string): Promise<void> {
  if (!revision) return;
  const git = simpleGit(repoDir);
  await git.fetch(['--all', '--tags']).catch(() => undefined);
  try {
    await git.checkout(revision);
    return;
  } catch {
    await git.checkout(['-f', `origin/${revision}`]);
  }
}

export async function ensureProjectRepo(params: {
  manifestRepoRoot: string;
  project: RepoManifestProject;
  fetch?: string;
  revision?: string;
}): Promise<{ repoDir: string; from: 'workspace' | 'cache' | 'cloned' }> {
  const workspaceRoot = inferWorkspaceRoot(params.manifestRepoRoot);
  if (workspaceRoot) {
    const direct = path.resolve(workspaceRoot, params.project.path);
    if (await isGitRepo(direct)) {
      await ensureCheckedOut(direct, params.revision);
      return { repoDir: direct, from: 'workspace' };
    }
  }

  const cacheBase = path.join(params.manifestRepoRoot, '.git-ai', 'workspace-cache');
  const cacheDir = path.join(cacheBase, sanitizeSegment(params.project.path || params.project.name));
  if (await isGitRepo(cacheDir)) {
    await ensureCheckedOut(cacheDir, params.revision);
    return { repoDir: cacheDir, from: 'cache' };
  }

  if (!params.fetch) throw new Error(`No remote fetch configured for project: ${params.project.name}`);
  await fs.ensureDir(cacheBase);
  const url = buildCloneUrl(params.fetch, params.project.name);
  await simpleGit().clone(url, cacheDir);
  await ensureCheckedOut(cacheDir, params.revision);
  return { repoDir: cacheDir, from: 'cloned' };
}

export async function ensureRepoIndexReady(repoRoot: string, dim = 256): Promise<{ source: 'unpacked' | 'built' | 'present' }> {
  const dbDir = defaultDbDir(repoRoot);
  const lancedbDir = path.join(dbDir);
  if (await fs.pathExists(lancedbDir)) return { source: 'present' };
  const archive = path.join(repoRoot, '.git-ai', 'lancedb.tar.gz');
  if (await fs.pathExists(archive)) {
    await unpackLanceDb(repoRoot);
    return { source: 'unpacked' };
  }
  const indexer = new IndexerV2({ repoRoot, scanRoot: repoRoot, dim, overwrite: true });
  await indexer.run();
  return { source: 'built' };
}

export async function queryManifestWorkspace(params: {
  manifestRepoRoot: string;
  keyword: string;
  limit: number;
}): Promise<{ repoRoot: string; workspaceRoot: string; count: number; rows: any[] }> {
  const workspaceRoot = inferWorkspaceRoot(params.manifestRepoRoot);
  if (!workspaceRoot) throw new Error('Not a manifests repo (.repo/manifests)');

  const manifest = await loadRepoManifestFromManifestsRepo(params.manifestRepoRoot);
  const q = params.keyword.replace(/'/g, "''");
  const rows: any[] = [];

  for (const project of manifest.projects) {
    const fetch = resolveProjectFetch(project, manifest);
    const revision = resolveProjectRevision(project, manifest);
    const ensured = await ensureProjectRepo({ manifestRepoRoot: params.manifestRepoRoot, project, fetch, revision });
    await ensureRepoIndexReady(ensured.repoDir, 256);
    const status = await checkIndex(ensured.repoDir);
    if (!status.ok) {
      const indexer = new IndexerV2({ repoRoot: ensured.repoDir, scanRoot: ensured.repoDir, dim: 256, overwrite: true });
      await indexer.run();
    }

    const dbDir = defaultDbDir(ensured.repoDir);
    const status2 = await checkIndex(ensured.repoDir);
    const langs = resolveLangs(status2.found.meta ?? null, 'all');
    const { byLang } = await openTablesByLang({ dbDir, dim: 256, mode: 'open_only', languages: langs });
    for (const lang of langs) {
      const t = byLang[lang];
      if (!t) continue;
      const projectRows = await t.refs.query().where(`symbol ILIKE '%${q}%'`).limit(params.limit).toArray();
      for (const r of projectRows as any[]) {
        rows.push({
          project: { name: project.name, path: project.path, repoRoot: ensured.repoDir, from: ensured.from },
          lang,
          ...r,
        });
        if (rows.length >= params.limit) break;
      }
      if (rows.length >= params.limit) break;
    }
    if (rows.length >= params.limit) break;
  }

  return { repoRoot: params.manifestRepoRoot, workspaceRoot, count: rows.length, rows };
}
