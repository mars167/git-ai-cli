import fs from 'fs-extra';
import path from 'path';

export interface CozoClient {
  backend: 'cozo-node' | 'cozo-wasm';
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

let cozoWasmInit: Promise<void> | null = null;

async function tryImportFromExport(repoRoot: string, client: CozoClient): Promise<void> {
  if (!client.importRelations) return;
  if (client.engine === 'sqlite') return;
  const exportPath = repoAstGraphExportPath(repoRoot);
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
    throw new Error(`Failed to load cozo-node: ${String(e?.message ?? e)}`);
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

async function openCozoWasm(repoRoot: string): Promise<CozoClient> {
  let mod: any;
  try {
    const moduleName: string = 'cozo-lib-wasm';
    mod = await import(moduleName);
  } catch (e: any) {
    throw new Error(`Failed to load cozo-lib-wasm: ${String(e?.message ?? e)}`);
  }

  const init = mod?.default;
  const CozoDb = mod?.CozoDb;
  if (typeof init !== 'function' || typeof CozoDb?.new !== 'function') {
    throw new Error('cozo-lib-wasm loaded but exports are not compatible');
  }

  if (!cozoWasmInit) cozoWasmInit = Promise.resolve(init()).then(() => {});
  await cozoWasmInit;

  const db: any = CozoDb.new();

  const run = async (script: string, params?: Record<string, any>) => {
    const out = db.run(String(script), JSON.stringify(params ?? {}));
    try {
      return JSON.parse(String(out));
    } catch {
      return out;
    }
  };

  const exportRelations = async (relations: string[]) => {
    if (typeof db.export_relations !== 'function') return null;
    const out = db.export_relations(JSON.stringify(relations));
    try {
      return JSON.parse(String(out));
    } catch {
      return out;
    }
  };

  const importRelations = async (data: any) => {
    if (typeof db.import_relations !== 'function') return null;
    const out = db.import_relations(JSON.stringify(data));
    try {
      return JSON.parse(String(out));
    } catch {
      return out;
    }
  };

  const client: CozoClient = {
    backend: 'cozo-wasm',
    engine: 'mem',
    run,
    exportRelations,
    importRelations,
    close: typeof db.free === 'function' ? async () => { db.free(); } : undefined,
  };

  await tryImportFromExport(repoRoot, client);
  return client;
}

export async function openRepoCozoDb(repoRoot: string): Promise<CozoClient | null> {
  const errors: string[] = [];
  try {
    return await openCozoNode(repoRoot);
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
  }
  try {
    return await openCozoWasm(repoRoot);
  } catch (e: any) {
    errors.push(String(e?.message ?? e));
  }
  await fs.ensureDir(path.join(repoRoot, '.git-ai'));
  await fs.writeJSON(path.join(repoRoot, '.git-ai', 'cozo.error.json'), { errors }, { spaces: 2 }).catch(() => {});
  return null;
}
