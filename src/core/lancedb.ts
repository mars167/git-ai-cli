import * as lancedb from '@lancedb/lancedb';
import { Field, Float32, Int32, Schema, Utf8 } from 'apache-arrow';
import fs from 'fs-extra';
import path from 'path';

export interface LanceTables {
  db: lancedb.Connection;
  chunks: lancedb.Table;
  refs: lancedb.Table;
}

export interface OpenTablesOptions {
  dbDir: string;
  dim: number;
  mode?: 'create_if_missing' | 'overwrite';
}

function chunksSchema(dim: number): Schema {
  return new Schema([
    new Field('content_hash', new Utf8(), false),
    new Field('text', new Utf8(), false),
    new Field('dim', new Int32(), false),
    new Field('scale', new Float32(), false),
    new Field('qvec_b64', new Utf8(), false),
  ]);
}

function refsSchema(): Schema {
  return new Schema([
    new Field('ref_id', new Utf8(), false),
    new Field('content_hash', new Utf8(), false),
    new Field('file', new Utf8(), false),
    new Field('symbol', new Utf8(), false),
    new Field('kind', new Utf8(), false),
    new Field('signature', new Utf8(), false),
    new Field('start_line', new Int32(), false),
    new Field('end_line', new Int32(), false),
  ]);
}

async function openOrCreateTable(db: lancedb.Connection, name: string, schema: Schema, mode: OpenTablesOptions['mode']): Promise<lancedb.Table> {
  const tables = await db.tableNames();
  const exists = tables.includes(name);
  if (mode === 'overwrite') {
    if (exists) await db.dropTable(name);
    return db.createEmptyTable(name, schema);
  }
  if (exists) return db.openTable(name);
  return db.createEmptyTable(name, schema);
}

export async function openTables(options: OpenTablesOptions): Promise<LanceTables> {
  await fs.ensureDir(options.dbDir);
  const db = await lancedb.connect(options.dbDir);
  const chunks = await openOrCreateTable(db, 'chunks', chunksSchema(options.dim), options.mode);
  const refs = await openOrCreateTable(db, 'refs', refsSchema(), options.mode);
  return { db, chunks, refs };
}

export function defaultDbDir(repoRoot: string): string {
  return path.join(repoRoot, '.git-ai', 'lancedb');
}
