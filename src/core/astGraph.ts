import fs from 'fs-extra';
import { openRepoCozoDb, repoAstGraphExportPath } from './cozo';

export interface AstGraphData {
  files: Array<[string, string]>;
  symbols: Array<[string, string, string, string, string, number, number]>;
  contains: Array<[string, string]>;
  extends_name: Array<[string, string]>;
  implements_name: Array<[string, string]>;
}

export interface WriteAstGraphResult {
  enabled: boolean;
  engine?: 'sqlite' | 'mem';
  dbPath?: string;
  counts?: {
    files: number;
    symbols: number;
    contains: number;
    extends_name: number;
    implements_name: number;
  };
  skippedReason?: string;
}

export async function writeAstGraphToCozo(repoRoot: string, data: AstGraphData): Promise<WriteAstGraphResult> {
  const db = await openRepoCozoDb(repoRoot);
  if (!db) return { enabled: false, skippedReason: 'Cozo backend not available (see .git-ai/cozo.error.json)' };

  const script = `
{
  ?[file_id, file] <- $files
  :replace ast_file { file_id: String => file: String }
}
{
  ?[ref_id, file, name, kind, signature, start_line, end_line] <- $symbols
  :replace ast_symbol { ref_id: String => file: String, name: String, kind: String, signature: String, start_line: Int, end_line: Int }
}
{
  ?[parent_id, child_id] <- $contains
  :replace ast_contains { parent_id: String, child_id: String }
}
{
  ?[sub_id, super_name] <- $extends_name
  :replace ast_extends_name { sub_id: String, super_name: String }
}
{
  ?[sub_id, iface_name] <- $implements_name
  :replace ast_implements_name { sub_id: String, iface_name: String }
}
`;

  await db.run(script, data as any);
  if (db.engine !== 'sqlite' && db.exportRelations) {
    const exported = await db.exportRelations(['ast_file', 'ast_symbol', 'ast_contains', 'ast_extends_name', 'ast_implements_name']);
    await fs.writeJSON(repoAstGraphExportPath(repoRoot), exported, { spaces: 2 });
  }
  if (db.close) await db.close();

  return {
    enabled: true,
    engine: db.engine,
    dbPath: db.dbPath,
    counts: {
      files: data.files.length,
      symbols: data.symbols.length,
      contains: data.contains.length,
      extends_name: data.extends_name.length,
      implements_name: data.implements_name.length,
    },
  };
}
