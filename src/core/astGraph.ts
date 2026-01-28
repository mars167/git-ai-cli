import fs from 'fs-extra';
import { openRepoCozoDb, repoAstGraphExportPath } from './cozo';
import { sha256Hex } from './crypto';
import { toPosixPath } from './paths';

export interface AstGraphData {
  files: Array<[string, string, string]>;
  symbols: Array<[string, string, string, string, string, string, number, number]>;
  contains: Array<[string, string]>;
  extends_name: Array<[string, string]>;
  implements_name: Array<[string, string]>;
  refs_name: Array<[string, string, string, string, string, number, number]>;
  calls_name: Array<[string, string, string, string, number, number]>;
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
    refs_name: number;
    calls_name: number;
  };
  skippedReason?: string;
}

export type WriteAstGraphMode = 'replace' | 'put';

export async function writeAstGraphToCozo(repoRoot: string, data: AstGraphData, opts?: { mode?: WriteAstGraphMode }): Promise<WriteAstGraphResult> {
  const db = await openRepoCozoDb(repoRoot);
  if (!db) return { enabled: false, skippedReason: 'Cozo backend not available (see .git-ai/cozo.error.json)' };

  const mode: WriteAstGraphMode = opts?.mode ?? 'replace';
  const op = mode === 'put' ? ':put' : ':replace';

  const script = `
{
  ?[file_id, file, lang] <- $files
  ${op} ast_file { file_id: String => file: String, lang: String }
}
{
  ?[ref_id, file, lang, name, kind, signature, start_line, end_line] <- $symbols
  ${op} ast_symbol { ref_id: String => file: String, lang: String, name: String, kind: String, signature: String, start_line: Int, end_line: Int }
}
{
  ?[parent_id, child_id] <- $contains
  ${op} ast_contains { parent_id: String, child_id: String }
}
{
  ?[sub_id, super_name] <- $extends_name
  ${op} ast_extends_name { sub_id: String, super_name: String }
}
{
  ?[sub_id, iface_name] <- $implements_name
  ${op} ast_implements_name { sub_id: String, iface_name: String }
}
{
  ?[from_id, from_lang, name, ref_kind, file, line, col] <- $refs_name
  ${op} ast_ref_name { from_id: String, from_lang: String, name: String, ref_kind: String, file: String, line: Int, col: Int }
}
{
  ?[caller_id, caller_lang, callee_name, file, line, col] <- $calls_name
  ${op} ast_call_name { caller_id: String, caller_lang: String, callee_name: String, file: String, line: Int, col: Int }
}
`;

  await db.run(script, data as any);
  if (db.engine !== 'sqlite' && db.exportRelations) {
    const exported = await db.exportRelations(['ast_file', 'ast_symbol', 'ast_contains', 'ast_extends_name', 'ast_implements_name', 'ast_ref_name', 'ast_call_name']);
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
      refs_name: data.refs_name.length,
      calls_name: data.calls_name.length,
    },
  };
}

export async function removeFileFromAstGraph(repoRoot: string, file: string): Promise<WriteAstGraphResult> {
  const db = await openRepoCozoDb(repoRoot);
  if (!db) return { enabled: false, skippedReason: 'Cozo backend not available (see .git-ai/cozo.error.json)' };

  const filePosix = toPosixPath(file);
  const file_id = sha256Hex(`file:${filePosix}`);

  const script = `
syms[ref_id] := *ast_symbol{ref_id, file}, file == $file
{
  ?[ref_id] := syms[ref_id]
  :rm ast_symbol { ref_id }
}
{
  ?[parent_id, child_id] := *ast_contains{parent_id, child_id}, syms[child_id]
  :rm ast_contains { parent_id, child_id }
}
{
  ?[parent_id, child_id] := *ast_contains{parent_id, child_id}, syms[parent_id]
  :rm ast_contains { parent_id, child_id }
}
{
  ?[parent_id, child_id] := *ast_contains{parent_id, child_id}, parent_id == $file_id
  :rm ast_contains { parent_id, child_id }
}
{
  ?[sub_id, super_name] := *ast_extends_name{sub_id, super_name}, syms[sub_id]
  :rm ast_extends_name { sub_id, super_name }
}
{
  ?[sub_id, iface_name] := *ast_implements_name{sub_id, iface_name}, syms[sub_id]
  :rm ast_implements_name { sub_id, iface_name }
}
{
  ?[from_id, from_lang, name, ref_kind, file, line, col] := *ast_ref_name{from_id, from_lang, name, ref_kind, file, line, col}, file == $file
  :rm ast_ref_name { from_id, from_lang, name, ref_kind, file, line, col }
}
{
  ?[caller_id, caller_lang, callee_name, file, line, col] := *ast_call_name{caller_id, caller_lang, callee_name, file, line, col}, file == $file
  :rm ast_call_name { caller_id, caller_lang, callee_name, file, line, col }
}
{
  ?[file_id] <- [[$file_id]]
  :rm ast_file { file_id }
}
`;

  await db.run(script, { file: filePosix, file_id } as any);
  if (db.engine !== 'sqlite' && db.exportRelations) {
    const exported = await db.exportRelations(['ast_file', 'ast_symbol', 'ast_contains', 'ast_extends_name', 'ast_implements_name', 'ast_ref_name', 'ast_call_name']);
    await fs.writeJSON(repoAstGraphExportPath(repoRoot), exported, { spaces: 2 });
  }
  if (db.close) await db.close();

  return {
    enabled: true,
    engine: db.engine,
    dbPath: db.dbPath,
  };
}
