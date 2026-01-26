import { Command } from 'commander';
import path from 'path';
import fs from 'fs-extra';
import { resolveGitRoot } from '../core/git';
import { defaultDbDir, openTablesByLang } from '../core/lancedb';
import { buildQueryVector, scoreAgainst } from '../core/search';
import { createLogger } from '../core/log';
import { checkIndex, resolveLangs } from '../core/indexCheck';
import { generateRepoMap, type FileRank } from '../core/repoMap';

export const semanticCommand = new Command('semantic')
  .description('Semantic search using SQ8 vectors (brute-force over chunks)')
  .argument('<text>', 'Query text')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('-k, --topk <k>', 'Top K results', '10')
  .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c', 'auto')
  .option('--with-repo-map', 'Attach a lightweight repo map (ranked files + top symbols + wiki links)', false)
  .option('--repo-map-files <n>', 'Max repo map files', '20')
  .option('--repo-map-symbols <n>', 'Max repo map symbols per file', '5')
  .option('--wiki <dir>', 'Wiki directory (default: docs/wiki or wiki)', '')
  .action(async (text, options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai semantic' });
    const startedAt = Date.now();
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const withRepoMap = Boolean((options as any).withRepoMap ?? false);
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
      const repoMap = withRepoMap ? await buildRepoMapAttachment(repoRoot, options) : undefined;
      console.log(JSON.stringify({ repoRoot, topk: k, lang: langSel, hits, ...(repoMap ? { repo_map: repoMap } : {}) }, null, 2));
    } catch (e) {
      log.error('semantic_search', { ok: false, duration_ms: Date.now() - startedAt, err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } });
      process.exit(1);
    }
  });

async function buildRepoMapAttachment(repoRoot: string, options: any): Promise<{ enabled: boolean; wikiDir: string; files: FileRank[] } | { enabled: boolean; skippedReason: string }> {
  try {
    const wikiDir = resolveWikiDir(repoRoot, String(options.wiki ?? ''));
    const files = await generateRepoMap({
      repoRoot,
      maxFiles: Number(options.repoMapFiles ?? 20),
      maxSymbolsPerFile: Number(options.repoMapSymbols ?? 5),
      wikiDir,
    });
    return { enabled: true, wikiDir, files };
  } catch (e: any) {
    return { enabled: false, skippedReason: String(e?.message ?? e) };
  }
}

function resolveWikiDir(repoRoot: string, wikiOpt: string): string {
  const w = String(wikiOpt ?? '').trim();
  if (w) return path.resolve(repoRoot, w);
  const candidates = [path.join(repoRoot, 'docs', 'wiki'), path.join(repoRoot, 'wiki')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}
