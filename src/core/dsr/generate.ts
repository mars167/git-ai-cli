import fs from 'fs-extra';
import path from 'path';
import { sha256Hex } from '../crypto';
import { toPosixPath } from '../paths';
import { assertCommitExists, getCommitParents, getCommitSubject, getNameStatusBetween, gitShowFile, resolveCommitHash } from './gitContext';
import { dsrDirectory, dsrFilePath } from './paths';
import { SnapshotCodeParser } from './snapshotParser';
import { DeterministicSemanticRecord, DsrAstOperation, DsrOperationKind, DsrRiskLevel, DsrSemanticChangeType, DsrSymbolDescriptor } from './types';

export interface GenerateDsrResult {
  dsr: DeterministicSemanticRecord;
  file_path: string;
  existed: boolean;
}

function normalizeFilePath(p: string): string {
  return toPosixPath(p);
}

function symbolContainerKey(s: { container?: { kind: string; name: string } }): string {
  if (!s.container) return '';
  return `${s.container.kind}:${s.container.name}`;
}

function symbolKeyFull(file: string, s: { kind: string; name: string; signature: string; container?: { kind: string; name: string } }): string {
  return `${file}|${symbolContainerKey(s)}|${s.kind}|${s.name}|${s.signature}`;
}

function symbolKeyNoSig(file: string, s: { kind: string; name: string; container?: { kind: string; name: string } }): string {
  return `${file}|${symbolContainerKey(s)}|${s.kind}|${s.name}`;
}

function clampLine(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function computeRangeHash(content: string, startLine: number, endLine: number): string {
  const lines = content.split('\n');
  const maxLine = Math.max(1, lines.length);
  const s = clampLine(startLine, 1, maxLine);
  const e = clampLine(endLine, 1, maxLine);
  const from = Math.min(s, e);
  const to = Math.max(s, e);
  const slice = lines.slice(from - 1, to).join('\n');
  return sha256Hex(slice);
}

interface SymbolSnap {
  desc: DsrSymbolDescriptor;
  content_hash: string;
}

function toDescriptor(file: string, s: any): DsrSymbolDescriptor {
  const out: DsrSymbolDescriptor = {
    file,
    kind: String(s.kind),
    name: String(s.name),
    signature: String(s.signature ?? ''),
    start_line: Number(s.startLine ?? 0),
    end_line: Number(s.endLine ?? 0),
  };
  if (s.container?.name) {
    out.container = {
      kind: String(s.container.kind),
      name: String(s.container.name),
      signature: String(s.container.signature ?? ''),
    };
  }
  return out;
}

function riskFromOps(ops: DsrAstOperation[]): DsrRiskLevel {
  let max: DsrRiskLevel = 'low';
  for (const op of ops) {
    if (op.op === 'delete' || op.op === 'rename') return 'high';
    if (op.op === 'modify') max = 'medium';
  }
  return max;
}

function semanticTypeFromOps(ops: DsrAstOperation[]): DsrSemanticChangeType {
  if (ops.length === 0) return 'no-op';
  const kinds = new Set<DsrOperationKind>(ops.map((o) => o.op));
  if (kinds.size === 1) {
    const only = Array.from(kinds)[0];
    if (only === 'add') return 'additive';
    if (only === 'modify') return 'modification';
    if (only === 'delete') return 'deletion';
    if (only === 'rename') return 'rename';
  }
  return 'mixed';
}

function stableSortDescriptor(a: DsrSymbolDescriptor, b: DsrSymbolDescriptor): number {
  const ak = `${a.file}|${a.kind}|${a.name}|${a.signature}|${a.container?.kind ?? ''}|${a.container?.name ?? ''}`;
  const bk = `${b.file}|${b.kind}|${b.name}|${b.signature}|${b.container?.kind ?? ''}|${b.container?.name ?? ''}`;
  return ak.localeCompare(bk);
}

function stableSortOp(a: DsrAstOperation, b: DsrAstOperation): number {
  const ak = `${a.op}|${a.symbol.file}|${a.symbol.kind}|${a.symbol.name}|${a.symbol.signature}|${a.previous?.name ?? ''}|${a.previous?.signature ?? ''}|${a.content_hash}`;
  const bk = `${b.op}|${b.symbol.file}|${b.symbol.kind}|${b.symbol.name}|${b.symbol.signature}|${b.previous?.name ?? ''}|${b.previous?.signature ?? ''}|${b.content_hash}`;
  return ak.localeCompare(bk);
}

function canonDsr(dsr: DeterministicSemanticRecord): DeterministicSemanticRecord {
  const affected = [...dsr.affected_symbols].sort(stableSortDescriptor);
  const ops = [...dsr.ast_operations].sort(stableSortOp);
  const out: DeterministicSemanticRecord = {
    commit_hash: dsr.commit_hash,
    affected_symbols: affected,
    ast_operations: ops,
    semantic_change_type: dsr.semantic_change_type,
  };
  if (dsr.summary) out.summary = dsr.summary;
  if (dsr.risk_level) out.risk_level = dsr.risk_level;
  return out;
}

function stringifyDsr(dsr: DeterministicSemanticRecord): string {
  return JSON.stringify(canonDsr(dsr), null, 2) + '\n';
}

export async function generateDsrForCommit(repoRoot: string, commitHash: string): Promise<GenerateDsrResult> {
  const resolvedCommit = await resolveCommitHash(repoRoot, commitHash);
  await assertCommitExists(repoRoot, resolvedCommit);
  const parents = await getCommitParents(repoRoot, resolvedCommit);
  const parent = parents.length > 0 ? parents[0] : null;

  const changes = await getNameStatusBetween(repoRoot, parent, resolvedCommit);
  const parser = new SnapshotCodeParser();

  const beforeSnaps: SymbolSnap[] = [];
  const afterSnaps: SymbolSnap[] = [];

  for (const ch of changes) {
    const status = String(ch.status);
    const file = normalizeFilePath(String(ch.path));
    const includeBefore = status !== 'A';
    const includeAfter = status !== 'D';

    if (includeBefore && parent) {
      const beforeContent = await gitShowFile(repoRoot, parent, file);
      if (beforeContent != null) {
        const parsed = parser.parseContent(file, beforeContent);
        for (const s of parsed.symbols) {
          const desc = toDescriptor(file, s);
          const content_hash = computeRangeHash(beforeContent, desc.start_line, desc.end_line);
          beforeSnaps.push({ desc, content_hash });
        }
      }
    }

    if (includeAfter) {
      const afterContent = await gitShowFile(repoRoot, resolvedCommit, file);
      if (afterContent != null) {
        const parsed = parser.parseContent(file, afterContent);
        for (const s of parsed.symbols) {
          const desc = toDescriptor(file, s);
          const content_hash = computeRangeHash(afterContent, desc.start_line, desc.end_line);
          afterSnaps.push({ desc, content_hash });
        }
      }
    }
  }

  const beforeByFull = new Map<string, SymbolSnap[]>();
  const afterByFull = new Map<string, SymbolSnap[]>();
  const beforeByNoSig = new Map<string, SymbolSnap[]>();
  const afterByNoSig = new Map<string, SymbolSnap[]>();

  for (const s of beforeSnaps) {
    const file = s.desc.file;
    const kFull = symbolKeyFull(file, s.desc);
    const kNoSig = symbolKeyNoSig(file, s.desc);
    beforeByFull.set(kFull, [...(beforeByFull.get(kFull) ?? []), s]);
    beforeByNoSig.set(kNoSig, [...(beforeByNoSig.get(kNoSig) ?? []), s]);
  }

  for (const s of afterSnaps) {
    const file = s.desc.file;
    const kFull = symbolKeyFull(file, s.desc);
    const kNoSig = symbolKeyNoSig(file, s.desc);
    afterByFull.set(kFull, [...(afterByFull.get(kFull) ?? []), s]);
    afterByNoSig.set(kNoSig, [...(afterByNoSig.get(kNoSig) ?? []), s]);
  }

  const usedBefore = new Set<SymbolSnap>();
  const usedAfter = new Set<SymbolSnap>();

  const ops: DsrAstOperation[] = [];

  for (const [kFull, bList] of beforeByFull.entries()) {
    const aList = afterByFull.get(kFull) ?? [];
    if (aList.length === 0) continue;
    const pairs = Math.min(bList.length, aList.length);
    for (let i = 0; i < pairs; i++) {
      const b = bList[i];
      const a = aList[i];
      usedBefore.add(b);
      usedAfter.add(a);
      if (b.content_hash !== a.content_hash) {
        ops.push({
          op: 'modify',
          symbol: a.desc,
          previous: { name: b.desc.name, signature: b.desc.signature },
          content_hash: a.content_hash,
        });
      }
    }
  }

  const remainingBefore = beforeSnaps.filter((s) => !usedBefore.has(s));
  const remainingAfter = afterSnaps.filter((s) => !usedAfter.has(s));

  const remainingAfterByNoSig = new Map<string, SymbolSnap[]>();
  for (const a of remainingAfter) {
    const k = symbolKeyNoSig(a.desc.file, a.desc);
    remainingAfterByNoSig.set(k, [...(remainingAfterByNoSig.get(k) ?? []), a]);
  }

  for (const b of remainingBefore) {
    const k = symbolKeyNoSig(b.desc.file, b.desc);
    const candidates = remainingAfterByNoSig.get(k) ?? [];
    if (candidates.length !== 1) continue;
    const a = candidates[0];
    if (usedAfter.has(a)) continue;
    usedBefore.add(b);
    usedAfter.add(a);
    if (b.content_hash !== a.content_hash || b.desc.signature !== a.desc.signature) {
      ops.push({
        op: 'modify',
        symbol: a.desc,
        previous: { name: b.desc.name, signature: b.desc.signature },
        content_hash: a.content_hash,
      });
    }
  }

  const remBefore2 = beforeSnaps.filter((s) => !usedBefore.has(s));
  const remAfter2 = afterSnaps.filter((s) => !usedAfter.has(s));

  const afterByHash = new Map<string, SymbolSnap[]>();
  for (const a of remAfter2) {
    const k = `${a.desc.file}|${symbolContainerKey(a.desc)}|${a.desc.kind}|${a.content_hash}`;
    afterByHash.set(k, [...(afterByHash.get(k) ?? []), a]);
  }

  for (const b of remBefore2) {
    const k = `${b.desc.file}|${symbolContainerKey(b.desc)}|${b.desc.kind}|${b.content_hash}`;
    const candidates = afterByHash.get(k) ?? [];
    if (candidates.length !== 1) continue;
    const a = candidates[0];
    if (usedAfter.has(a)) continue;
    usedBefore.add(b);
    usedAfter.add(a);
    if (b.desc.name !== a.desc.name || b.desc.signature !== a.desc.signature) {
      ops.push({
        op: 'rename',
        symbol: a.desc,
        previous: { name: b.desc.name, signature: b.desc.signature },
        content_hash: a.content_hash,
      });
    } else if (b.content_hash !== a.content_hash) {
      ops.push({
        op: 'modify',
        symbol: a.desc,
        previous: { name: b.desc.name, signature: b.desc.signature },
        content_hash: a.content_hash,
      });
    }
  }

  for (const a of afterSnaps) {
    if (usedAfter.has(a)) continue;
    ops.push({
      op: 'add',
      symbol: a.desc,
      content_hash: a.content_hash,
    });
  }

  for (const b of beforeSnaps) {
    if (usedBefore.has(b)) continue;
    ops.push({
      op: 'delete',
      symbol: b.desc,
      content_hash: b.content_hash,
    });
  }

  const affectedMap = new Map<string, DsrSymbolDescriptor>();
  for (const op of ops) {
    const s = op.symbol;
    const k = symbolKeyFull(s.file, s);
    affectedMap.set(k, s);
  }

  const subject = await getCommitSubject(repoRoot, resolvedCommit).catch(() => '');
  const risk_level = riskFromOps(ops);
  const semantic_change_type = semanticTypeFromOps(ops);

  const dsr: DeterministicSemanticRecord = canonDsr({
    commit_hash: resolvedCommit,
    affected_symbols: Array.from(affectedMap.values()),
    ast_operations: ops,
    semantic_change_type,
    summary: subject || undefined,
    risk_level,
  });

  const dir = dsrDirectory(repoRoot);
  const file_path = dsrFilePath(repoRoot, resolvedCommit);
  await fs.ensureDir(dir);

  const rendered = stringifyDsr(dsr);
  if (await fs.pathExists(file_path)) {
    const existing = await fs.readFile(file_path, 'utf-8').catch(() => '');
    if (existing.trimEnd() !== rendered.trimEnd()) {
      throw new Error(`DSR already exists but differs: ${file_path}`);
    }
    return { dsr, file_path, existed: true };
  }

  const tmp = path.join(dir, `${commitHash}.json.tmp-${process.pid}-${Date.now()}`);
  await fs.writeFile(tmp, rendered, 'utf-8');
  await fs.move(tmp, file_path, { overwrite: false });
  return { dsr, file_path, existed: false };
}
