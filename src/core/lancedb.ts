import * as lancedb from '@lancedb/lancedb';
import { Field, Float32, Int32, Schema, Utf8 } from 'apache-arrow';
import fs from 'fs-extra';
import path from 'path';

export type IndexLang = 'java' | 'ts' | 'c' | 'go' | 'python' | 'rust' | 'markdown' | 'yaml';

export const ALL_INDEX_LANGS: IndexLang[] = ['java', 'ts', 'c', 'go', 'python', 'rust', 'markdown', 'yaml'];

export interface LanceTables {
  db: lancedb.Connection;
  chunks: lancedb.Table;
  refs: lancedb.Table;
}

export interface OpenTablesOptions {
  dbDir: string;
  dim: number;
  mode?: 'create_if_missing' | 'overwrite' | 'open_only';
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
  if (mode === 'open_only') {
    if (!exists) throw new Error(`LanceDB table not found: ${name}`);
    return db.openTable(name);
  }
  if (mode === 'overwrite') {
    if (exists) await db.dropTable(name);
    return db.createEmptyTable(name, schema);
  }
  if (exists) return db.openTable(name);
  return db.createEmptyTable(name, schema);
}

function chunksTableName(lang: IndexLang): string {
  return `chunks_${lang}`;
}

function refsTableName(lang: IndexLang): string {
  return `refs_${lang}`;
}

export interface OpenLangTablesOptions extends OpenTablesOptions {
  languages: IndexLang[];
}

export interface LangTables {
  lang: IndexLang;
  chunks: lancedb.Table;
  refs: lancedb.Table;
}

export interface LanceTablesByLang {
  db: lancedb.Connection;
  byLang: Partial<Record<IndexLang, LangTables>>;
}

export async function openTablesByLang(options: OpenLangTablesOptions): Promise<LanceTablesByLang> {
  if (options.mode === 'open_only') {
    const exists = await fs.pathExists(options.dbDir);
    if (!exists) throw new Error(`LanceDB directory not found: ${options.dbDir}`);
  } else {
    await fs.ensureDir(options.dbDir);
  }
  const db = await lancedb.connect(options.dbDir);
  const byLang: Partial<Record<IndexLang, LangTables>> = {};
  for (const lang of options.languages) {
    const chunks = await openOrCreateTable(db, chunksTableName(lang), chunksSchema(options.dim), options.mode);
    const refs = await openOrCreateTable(db, refsTableName(lang), refsSchema(), options.mode);
    byLang[lang] = { lang, chunks, refs };
  }
  return { db, byLang };
}

export function defaultDbDir(repoRoot: string): string {
  return path.join(repoRoot, '.git-ai', 'lancedb');
}
