import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { defaultDbDir, openTables } from '../core/lancedb';
import { buildQueryVector, scoreAgainst } from '../core/search';

export const semanticCommand = new Command('semantic')
  .description('Semantic search using SQ8 vectors (brute-force over chunks)')
  .argument('<text>', 'Query text')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('-k, --topk <k>', 'Top K results', '10')
  .action(async (text, options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const dbDir = defaultDbDir(repoRoot);
    const { chunks, refs } = await openTables({ dbDir, dim: 256, mode: 'create_if_missing' });

    const k = Number(options.topk);
    const dim = 256;
    const q = buildQueryVector(String(text), dim);

    const chunkRows = await chunks.query().select(['content_hash', 'text', 'dim', 'scale', 'qvec_b64']).limit(1_000_000).toArray();
    const scored = (chunkRows as any[]).map(r => ({
      content_hash: String(r.content_hash),
      score: scoreAgainst(q, { dim: Number(r.dim), scale: Number(r.scale), qvec: new Int8Array(Buffer.from(String(r.qvec_b64), 'base64')) }),
      text: String(r.text),
    })).sort((a, b) => b.score - a.score).slice(0, k);

    const ids = scored.map(s => s.content_hash);
    const refsRows = await refs.query().select(['content_hash', 'file', 'symbol', 'kind', 'signature', 'start_line', 'end_line'])
      .limit(1_000_000)
      .toArray();
    const refsById = new Map<string, any[]>();
    for (const r of refsRows as any[]) {
      const id = String(r.content_hash);
      if (!refsById.has(id)) refsById.set(id, []);
      refsById.get(id)!.push(r);
    }

    const hits = scored.map(s => ({
      ...s,
      refs: (refsById.get(s.content_hash) || []).slice(0, 5),
    }));

    console.log(JSON.stringify({ repoRoot, topk: k, hits }, null, 2));
  });
