import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';

export interface RepoManifestProject {
  name: string;
  path: string;
  remote?: string;
  revision?: string;
}

export interface RepoManifest {
  defaultRemote?: string;
  defaultRevision?: string;
  remotes: Record<string, { fetch?: string }>;
  projects: RepoManifestProject[];
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

export function parseRepoManifestXml(xml: string): RepoManifest {
  const remotes: RepoManifest['remotes'] = {};
  const projects: RepoManifestProject[] = [];
  let defaultRemote: string | undefined;
  let defaultRevision: string | undefined;

  for (const m of xml.matchAll(/<remote\b([^>]*?)\/>/g)) {
    const attrs = parseAttributes(m[1] ?? '');
    if (attrs.name) {
      remotes[attrs.name] = { fetch: attrs.fetch };
    }
  }

  for (const m of xml.matchAll(/<default\b([^>]*?)\/>/g)) {
    const attrs = parseAttributes(m[1] ?? '');
    if (attrs.remote) defaultRemote = attrs.remote;
    if (attrs.revision) defaultRevision = attrs.revision;
  }

  for (const m of xml.matchAll(/<project\b([^>]*?)(?:\/>|>)/g)) {
    const attrs = parseAttributes(m[1] ?? '');
    if (!attrs.name) continue;
    projects.push({
      name: attrs.name,
      path: attrs.path ?? attrs.name,
      remote: attrs.remote,
      revision: attrs.revision,
    });
  }

  return { defaultRemote, defaultRevision, remotes, projects };
}

export async function loadRepoManifestFromManifestsRepo(repoRoot: string): Promise<RepoManifest> {
  const defaultXml = path.join(repoRoot, 'default.xml');
  if (await fs.pathExists(defaultXml)) {
    const xml = await fs.readFile(defaultXml, 'utf-8');
    return parseRepoManifestXml(xml);
  }

  const xmlFiles = await glob('*.xml', { cwd: repoRoot, nodir: true });
  for (const f of xmlFiles) {
    const xml = await fs.readFile(path.join(repoRoot, f), 'utf-8');
    const parsed = parseRepoManifestXml(xml);
    if (parsed.projects.length > 0) return parsed;
  }

  return { remotes: {}, projects: [] };
}

export function resolveProjectRevision(project: RepoManifestProject, manifest: RepoManifest): string | undefined {
  return project.revision ?? manifest.defaultRevision;
}

export function resolveProjectFetch(project: RepoManifestProject, manifest: RepoManifest): string | undefined {
  const remoteName = project.remote ?? manifest.defaultRemote;
  return remoteName ? manifest.remotes[remoteName]?.fetch : undefined;
}

export function buildCloneUrl(fetch: string, projectName: string): string {
  const base = String(fetch).trim();
  if (base.includes('://')) {
    return base.endsWith('/') ? `${base}${projectName}` : `${base}/${projectName}`;
  }
  if (base.includes(':')) {
    const idx = base.indexOf(':');
    const left = base.slice(0, idx + 1);
    const right = base.slice(idx + 1).replace(/\/+$/, '');
    return `${left}${right}/${projectName}`;
  }
  return base.endsWith('/') ? `${base}${projectName}` : `${base}/${projectName}`;
}

