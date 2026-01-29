import fs from 'fs-extra';
import simpleGit from 'simple-git';
import { dsrFilePath } from './paths';
import { DeterministicSemanticRecord } from './types';

export interface SymbolEvolutionOptions {
  start?: string;
  all?: boolean;
  limit?: number;
  contains?: boolean;
}

export interface SymbolEvolutionHit {
  commit_hash: string;
  semantic_change_type: string;
  risk_level?: string;
  summary?: string;
  operations: Array<{
    op: string;
    file: string;
    kind: string;
    name: string;
    signature: string;
    previous_name?: string;
    previous_signature?: string;
    content_hash: string;
  }>;
}

export async function listCommitsTopological(repoRoot: string, opts: SymbolEvolutionOptions): Promise<string[]> {
  const git = simpleGit(repoRoot);
  const args: string[] = ['rev-list', '--topo-order'];
  if (opts.limit && opts.limit > 0) args.push('-n', String(opts.limit));
  if (opts.all) args.push('--all');
  else args.push(String(opts.start ?? 'HEAD'));
  const out = (await git.raw(args)).trim();
  if (!out) return [];
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

export async function symbolEvolution(repoRoot: string, symbol: string, opts: SymbolEvolutionOptions): Promise<{
  ok: boolean;
  hits?: SymbolEvolutionHit[];
  missing_dsrs?: string[];
}> {
  const commits = await listCommitsTopological(repoRoot, opts);
  const missing_dsrs: string[] = [];
  const hits: SymbolEvolutionHit[] = [];
  const needle = String(symbol ?? '').trim();
  if (!needle) return { ok: true, hits: [] };

  const matches = (name: string) => {
    if (opts.contains) return name.includes(needle);
    return name === needle;
  };

  for (const c of commits) {
    const p = dsrFilePath(repoRoot, c);
    if (!await fs.pathExists(p)) {
      missing_dsrs.push(c);
      break;
    }
    const rec = await fs.readJSON(p).catch(() => null) as DeterministicSemanticRecord | null;
    if (!rec) continue;
    const ops = Array.isArray(rec.ast_operations) ? rec.ast_operations : [];
    const matchedOps = ops
      .filter((o: any) => matches(String(o?.symbol?.name ?? '')) || matches(String(o?.previous?.name ?? '')))
      .map((o: any) => ({
        op: String(o?.op ?? ''),
        file: String(o?.symbol?.file ?? ''),
        kind: String(o?.symbol?.kind ?? ''),
        name: String(o?.symbol?.name ?? ''),
        signature: String(o?.symbol?.signature ?? ''),
        previous_name: o?.previous?.name ? String(o.previous.name) : undefined,
        previous_signature: o?.previous?.signature ? String(o.previous.signature) : undefined,
        content_hash: String(o?.content_hash ?? ''),
      }))
      .sort((a, b) => `${a.op}|${a.file}|${a.kind}|${a.name}|${a.signature}|${a.previous_name ?? ''}`.localeCompare(`${b.op}|${b.file}|${b.kind}|${b.name}|${b.signature}|${b.previous_name ?? ''}`));

    if (matchedOps.length === 0) continue;
    hits.push({
      commit_hash: String(rec.commit_hash),
      semantic_change_type: String(rec.semantic_change_type ?? ''),
      risk_level: rec.risk_level,
      summary: rec.summary,
      operations: matchedOps,
    });
  }

  if (missing_dsrs.length > 0) return { ok: false, missing_dsrs };
  return { ok: true, hits };
}
