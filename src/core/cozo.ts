import fs from 'fs-extra';
import path from 'path';

export interface CozoClient {
  backend: 'cozo-node';
  run: (script: string, params?: Record<string, any>) => Promise<any>;
  exportRelations?: (relations: string[]) => Promise<any>;
  importRelations?: (data: any) => Promise<any>;
  close?: () => Promise<void>;
  engine: 'sqlite' | 'mem';
  dbPath?: string;
}

export function repoAstGraphDbPath(repoRoot: string): string {
  return path.join(repoRoot, '.git-ai', 'ast-graph.sqlite');
}

export function repoAstGraphExportPath(repoRoot: string): string {
  return path.join(repoRoot, '.git-ai', 'ast-graph.export.json');
}

async function tryImportFromExport(repoRoot: string, client: CozoClient): Promise<void> {
  if (!client.importRelations) return;
  if (client.engine === 'sqlite') return;
  const exportPath = repoAstGraphExportPath(repoRoot);
  if (!await fs.pathExists(exportPath)) return;
  const data = await fs.readJSON(exportPath).catch(() => null);
  if (!data) return;
  await client.importRelations(data);
}

async function tryImportFromExportPath(exportPath: string | null | undefined, client: CozoClient): Promise<void> {
  if (!exportPath) return;
  if (!client.importRelations) return;
  if (client.engine === 'sqlite') return;
  if (!await fs.pathExists(exportPath)) return;
  const data = await fs.readJSON(exportPath).catch(() => null);
  if (!data) return;
  await client.importRelations(data);
}

async function openCozoNode(repoRoot: string): Promise<CozoClient> {
  let mod: any;
  try {
    const moduleName: string = 'cozo-node';
    mod = await import(moduleName);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // Provide helpful error message for common installation issues
    const hint = msg.includes('Cannot find') || msg.includes('not found')
      ? '\n\nTroubleshooting:\n' +
        '1. For China users: npm install --cozo_node_prebuilt_binary_host_mirror=https://gitee.com/cozodb/cozo-lib-nodejs/releases/download/\n' +
        '2. Check network/proxy settings\n' +
        '3. Manual download: https://github.com/cozodb/cozo-lib-nodejs/releases'
      : '';
    throw new Error(`Failed to load cozo-node: ${msg}${hint}`);
  }

  const CozoDb = mod?.CozoDb ?? mod?.default?.CozoDb ?? mod?.default ?? mod;
  if (typeof CozoDb !== 'function') throw new Error('cozo-node loaded but CozoDb export is missing');

  const dbPath = repoAstGraphDbPath(repoRoot);
  await fs.ensureDir(path.dirname(dbPath));

  let db: any;
  let engine: CozoClient['engine'] = 'mem';
  try {
    db = new CozoDb('sqlite', dbPath);
    engine = 'sqlite';
  } catch (e1) {
    try {
      db = new CozoDb({ engine: 'sqlite', path: dbPath });
      engine = 'sqlite';
    } catch {
      db = new CozoDb();
      engine = 'mem';
    }
  }

  const client: CozoClient = {
    backend: 'cozo-node',
    engine,
    dbPath: engine === 'sqlite' ? dbPath : undefined,
    run: async (script: string, params?: Record<string, any>) => db.run(script, params ?? {}),
    exportRelations: typeof db.exportRelations === 'function' ? async (rels: string[]) => db.exportRelations(rels) : undefined,
    importRelations: typeof db.importRelations === 'function' ? async (data: any) => db.importRelations(data) : undefined,
    close: typeof db.close === 'function' ? async () => { await db.close(); } : undefined,
  };
  await tryImportFromExport(repoRoot, client);
  return client;
}

export async function openCozoDbAtPath(dbPath: string, exportPath?: string): Promise<CozoClient | null> {
  const errors: string[] = [];
  try {
    const moduleName: string = 'cozo-node';
    const mod = await import(moduleName);
    const CozoDb = mod?.CozoDb ?? mod?.default?.CozoDb ?? mod?.default ?? mod;
    if (typeof CozoDb !== 'function') throw new Error('cozo-node loaded but CozoDb export is missing');
    await fs.ensureDir(path.dirname(dbPath));

    let db: any;
    let engine: CozoClient['engine'] = 'mem';
    try {
      db = new CozoDb('sqlite', dbPath);
      engine = 'sqlite';
    } catch (e1) {
      try {
        db = new CozoDb({ engine: 'sqlite', path: dbPath });
        engine = 'sqlite';
      } catch {
        db = new CozoDb();
        engine = 'mem';
      }
    }

    const client: CozoClient = {
      backend: 'cozo-node',
      engine,
      dbPath: engine === 'sqlite' ? dbPath : undefined,
      run: async (script: string, params?: Record<string, any>) => db.run(script, params ?? {}),
      exportRelations: typeof db.exportRelations === 'function' ? async (rels: string[]) => db.exportRelations(rels) : undefined,
      importRelations: typeof db.importRelations === 'function' ? async (data: any) => db.importRelations(data) : undefined,
      close: typeof db.close === 'function' ? async () => { await db.close(); } : undefined,
    };
    await tryImportFromExportPath(exportPath, client);
    return client;
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
  }

  await fs.ensureDir(path.dirname(dbPath));
  await fs.writeJSON(path.join(path.dirname(dbPath), 'cozo.error.json'), { 
    errors,
    troubleshooting: {
      gitee_mirror: 'npm install --cozo_node_prebuilt_binary_host_mirror=https://gitee.com/cozodb/cozo-lib-nodejs/releases/download/',
      manual_download: 'https://github.com/cozodb/cozo-lib-nodejs/releases',
      docs: 'https://github.com/mars167/git-ai-cli#troubleshooting'
    }
  }, { spaces: 2 }).catch(() => {});
  return null;
}

export async function openRepoCozoDb(repoRoot: string): Promise<CozoClient | null> {
  const errors: string[] = [];
  try {
    return await openCozoNode(repoRoot);
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
  }
  await fs.ensureDir(path.join(repoRoot, '.git-ai'));
  await fs.writeJSON(path.join(repoRoot, '.git-ai', 'cozo.error.json'), { 
    errors,
    troubleshooting: {
      gitee_mirror: 'npm install --cozo_node_prebuilt_binary_host_mirror=https://gitee.com/cozodb/cozo-lib-nodejs/releases/download/',
      manual_download: 'https://github.com/cozodb/cozo-lib-nodejs/releases',
      docs: 'https://github.com/mars167/git-ai-cli#troubleshooting'
    }
  }, { spaces: 2 }).catch(() => {});
  return null;
}
