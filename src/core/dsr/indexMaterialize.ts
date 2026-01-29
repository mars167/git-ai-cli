import fs from 'fs-extra';
import path from 'path';
import { openCozoDbAtPath } from '../cozo';
import { dsrDirectory, dsrIndexDbPath, dsrIndexExportPath } from './paths';
import { DeterministicSemanticRecord } from './types';

export interface DsrIndexMaterializeResult {
  enabled: boolean;
  engine?: 'sqlite' | 'mem';
  dbPath?: string;
  exportPath?: string;
  counts?: {
    commits: number;
    affected_symbols: number;
    ast_operations: number;
  };
  skippedReason?: string;
}

export async function materializeDsrIndex(repoRoot: string): Promise<DsrIndexMaterializeResult> {
  const dsrDir = dsrDirectory(repoRoot);
  if (!await fs.pathExists(dsrDir)) {
    return { enabled: false, skippedReason: `DSR directory missing: ${dsrDir}` };
  }

  const files = (await fs.readdir(dsrDir).catch(() => []))
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !f.endsWith('.export.json'))
    .sort((a, b) => a.localeCompare(b));

  const dsrs: DeterministicSemanticRecord[] = [];
  for (const f of files) {
    const full = path.join(dsrDir, f);
    const data = await fs.readJSON(full).catch(() => null);
    if (!data || typeof data !== 'object') continue;
    if (typeof (data as any).commit_hash !== 'string') continue;
    dsrs.push(data as any);
  }

  const dbPath = dsrIndexDbPath(repoRoot);
  const exportPath = dsrIndexExportPath(repoRoot);
  const db = await openCozoDbAtPath(dbPath, exportPath);
  if (!db) return { enabled: false, skippedReason: 'Cozo backend not available (see cozo.error.json next to dsr-index.sqlite)' };

  const commits: Array<[string, string, string, string]> = [];
  const affected: Array<[string, string, string, string, string, string, string, string]> = [];
  const ops: Array<[string, string, string, string, string, string, string, string, string]> = [];

  for (const r of dsrs) {
    const commit = String(r.commit_hash);
    commits.push([
      commit,
      String(r.semantic_change_type ?? ''),
      String(r.risk_level ?? ''),
      String(r.summary ?? ''),
    ]);

    for (const s of Array.isArray(r.affected_symbols) ? r.affected_symbols : []) {
      affected.push([
        commit,
        String((s as any).file ?? ''),
        String((s as any).kind ?? ''),
        String((s as any).name ?? ''),
        String((s as any).signature ?? ''),
        String((s as any).container?.kind ?? ''),
        String((s as any).container?.name ?? ''),
        String((s as any).container?.signature ?? ''),
      ]);
    }

    for (const o of Array.isArray(r.ast_operations) ? r.ast_operations : []) {
      const sym = (o as any).symbol ?? {};
      ops.push([
        commit,
        String((o as any).op ?? ''),
        String(sym.file ?? ''),
        String(sym.kind ?? ''),
        String(sym.name ?? ''),
        String(sym.signature ?? ''),
        String((o as any).previous?.name ?? ''),
        String((o as any).previous?.signature ?? ''),
        String((o as any).content_hash ?? ''),
      ]);
    }
  }

  const script = `
{
  ?[commit_hash, semantic_change_type, risk_level, summary] <- $commits
  :replace dsr_commit { commit_hash: String => semantic_change_type: String, risk_level: String, summary: String }
}
{
  ?[commit_hash, file, kind, name, signature, container_kind, container_name, container_signature] <- $affected
  :replace dsr_affected_symbol { commit_hash: String, file: String, kind: String, name: String, signature: String, container_kind: String, container_name: String, container_signature: String }
}
{
  ?[commit_hash, op, file, kind, name, signature, prev_name, prev_signature, content_hash] <- $ops
  :replace dsr_ast_operation { commit_hash: String, op: String, file: String, kind: String, name: String, signature: String, prev_name: String, prev_signature: String, content_hash: String }
}
`;

  await db.run(script, { commits, affected, ops } as any);

  if (db.engine !== 'sqlite' && db.exportRelations) {
    const exported = await db.exportRelations(['dsr_commit', 'dsr_affected_symbol', 'dsr_ast_operation']);
    await fs.ensureDir(path.dirname(exportPath));
    await fs.writeJSON(exportPath, exported, { spaces: 2 });
  }

  if (db.close) await db.close();
  return {
    enabled: true,
    engine: db.engine,
    dbPath: db.dbPath,
    exportPath: db.engine !== 'sqlite' ? exportPath : undefined,
    counts: {
      commits: commits.length,
      affected_symbols: affected.length,
      ast_operations: ops.length,
    },
  };
}
