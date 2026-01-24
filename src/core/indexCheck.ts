import fs from 'fs-extra';
import path from 'path';
import * as lancedb from '@lancedb/lancedb';
import { IndexLang } from './lancedb';

export const EXPECTED_INDEX_SCHEMA_VERSION = 3;

export type LangSelector = 'auto' | 'all' | IndexLang;

export interface IndexMetaV21 {
  version?: string;
  index_schema_version?: number;
  dim?: number;
  dbDir?: string;
  scanRoot?: string;
  languages?: IndexLang[];
  astGraph?: any;
}

export interface IndexCheckResult {
  ok: boolean;
  problems: string[];
  expected: {
    index_schema_version: number;
  };
  found: {
    metaPath: string;
    meta?: IndexMetaV21 | null;
    lancedbDir: string;
    lancedbTables?: string[];
    astGraphDbPath: string;
    astGraphDbExists: boolean;
  };
  hint: string;
}

function requiredTablesForLang(lang: IndexLang): string[] {
  return [`chunks_${lang}`, `refs_${lang}`];
}

export function resolveLangs(meta: IndexMetaV21 | null, selector: LangSelector): IndexLang[] {
  const available = Array.isArray(meta?.languages) && meta!.languages.length > 0 ? meta!.languages : (['java', 'ts'] as IndexLang[]);
  if (selector === 'all') return available;
  if (selector === 'java' || selector === 'ts') return available.includes(selector) ? [selector] : [];
  if (available.includes('java')) return ['java'];
  if (available.includes('ts')) return ['ts'];
  return available.slice(0, 1);
}

export async function checkIndex(repoRoot: string): Promise<IndexCheckResult> {
  const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
  const lancedbDir = path.join(repoRoot, '.git-ai', 'lancedb');
  const astGraphDbPath = path.join(repoRoot, '.git-ai', 'ast-graph.sqlite');

  const problems: string[] = [];
  const meta: IndexMetaV21 | null = await fs.pathExists(metaPath) ? await fs.readJSON(metaPath).catch(() => null) : null;

  if (!meta) {
    problems.push('missing_or_unreadable_meta_json');
  } else if (meta.index_schema_version !== EXPECTED_INDEX_SCHEMA_VERSION) {
    problems.push(`index_schema_version_mismatch(found=${String(meta.index_schema_version ?? 'null')}, expected=${EXPECTED_INDEX_SCHEMA_VERSION})`);
  }

  let lancedbTables: string[] | undefined;
  if (await fs.pathExists(lancedbDir)) {
    try {
      const db = await lancedb.connect(lancedbDir);
      lancedbTables = await db.tableNames();
    } catch {
      problems.push('lancedb_open_failed');
    }
  } else {
    problems.push('missing_lancedb_dir');
  }

  const astGraphDbExists = await fs.pathExists(astGraphDbPath);
  if (!astGraphDbExists) problems.push('missing_ast_graph_db');

  if (meta && lancedbTables) {
    const langs = Array.isArray(meta.languages) && meta.languages.length > 0 ? meta.languages : [];
    const expectedTables = langs.flatMap(requiredTablesForLang);
    for (const t of expectedTables) {
      if (!lancedbTables.includes(t)) problems.push(`missing_lancedb_table(${t})`);
    }
  }

  const ok = problems.length === 0;
  return {
    ok,
    problems,
    expected: { index_schema_version: EXPECTED_INDEX_SCHEMA_VERSION },
    found: {
      metaPath,
      meta,
      lancedbDir,
      lancedbTables,
      astGraphDbPath,
      astGraphDbExists,
    },
    hint: ok ? 'ok' : 'Rebuild index: git-ai ai index --overwrite',
  };
}

