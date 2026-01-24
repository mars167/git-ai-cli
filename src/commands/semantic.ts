import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { defaultDbDir, openTablesByLang } from '../core/lancedb';
import { buildQueryVector, scoreAgainst } from '../core/search';
import { createLogger } from '../core/log';
import { checkIndex, resolveLangs } from '../core/indexCheck';

export const semanticCommand = new Command('semantic')
  .description('Semantic search using SQ8 vectors (brute-force over chunks)')
  .argument('<text>', 'Query text')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('-k, --topk <k>', 'Top K results', '10')
  .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
  .action(async (text, options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai semantic' });
    const startedAt = Date.now();
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const status = await checkIndex(repoRoot);
      if (!status.ok) {
        process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
        process.exit(2);
        return;
      }

      const dbDir = defaultDbDir(repoRoot);
      const k = Number(options.topk);
      const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
      const q = buildQueryVector(String(text), dim);
      const langSel = String(options.lang ?? 'auto');
      const langs = resolveLangs(status.found.meta ?? null, langSel as any);
      if (langs.length === 0) {
        process.stderr.write(JSON.stringify({ ok: false, reason: 'lang_not_available', lang: langSel, available: status.found.meta?.languages ?? [] }, null, 2) + '\n');
        process.exit(2);
        return;
      }

      const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs });

      const allScored: any[] = [];
      let totalChunks = 0;
      for (const lang of langs) {
        const t = byLang[lang];
        if (!t) continue;
        const chunkRows = await t.chunks.query().select(['content_hash', 'text', 'dim', 'scale', 'qvec_b64']).limit(1_000_000).toArray();
        totalChunks += (chunkRows as any[]).length;
        for (const r of chunkRows as any[]) {
          allScored.push({
            lang,
            content_hash: String(r.content_hash),
            score: scoreAgainst(q, { dim: Number(r.dim), scale: Number(r.scale), qvec: new Int8Array(Buffer.from(String(r.qvec_b64), 'base64')) }),
            text: String(r.text),
          });
        }
      }
      const scored = allScored.sort((a, b) => b.score - a.score).slice(0, k);

      const neededByLang: Partial<Record<string, Set<string>>> = {};
      for (const s of scored) {
        if (!neededByLang[s.lang]) neededByLang[s.lang] = new Set<string>();
        neededByLang[s.lang]!.add(String(s.content_hash));
      }

      const refsByLangAndId = new Map<string, Map<string, any[]>>();
      for (const lang of langs) {
        const t = byLang[lang];
        if (!t) continue;
        const needed = neededByLang[lang];
        if (!needed || needed.size === 0) continue;
        const refsRows = await t.refs.query().select(['content_hash', 'file', 'symbol', 'kind', 'signature', 'start_line', 'end_line'])
          .limit(1_000_000)
          .toArray();
        const byId = new Map<string, any[]>();
        for (const r of refsRows as any[]) {
          const id = String(r.content_hash);
          if (!needed.has(id)) continue;
          if (!byId.has(id)) byId.set(id, []);
          byId.get(id)!.push(r);
        }
        refsByLangAndId.set(lang, byId);
      }

      const hits = scored.map(s => ({
        ...s,
        refs: (refsByLangAndId.get(s.lang)?.get(s.content_hash) || []).slice(0, 5),
      }));

      log.info('semantic_search', { ok: true, repoRoot, topk: k, lang: langSel, langs, chunks: totalChunks, hits: hits.length, duration_ms: Date.now() - startedAt });
      console.log(JSON.stringify({ repoRoot, topk: k, lang: langSel, hits }, null, 2));
    } catch (e) {
      log.error('semantic_search', { ok: false, duration_ms: Date.now() - startedAt, err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } });
      process.exit(1);
    }
  });
