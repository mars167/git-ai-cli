import path from 'path';
import fs from 'fs-extra';
import { resolveGitRoot } from '../../core/git';
import { defaultDbDir, openTablesByLang, type IndexLang } from '../../core/lancedb';
import { buildQueryVector, scoreAgainst } from '../../core/search';
import { checkIndex, resolveLangs } from '../../core/indexCheck';
import { generateRepoMap, type FileRank } from '../../core/repoMap';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';
import { resolveRepoContext, validateIndex, resolveLanguages, type RepoContext } from '../helpers';

function isCLIError(value: unknown): value is CLIError {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as any).ok === false;
}

async function buildRepoMapAttachment(
  repoRoot: string,
  options: { wiki: string; repoMapFiles: number; repoMapSymbols: number }
): Promise<{ enabled: boolean; wikiDir: string; files: FileRank[] } | { enabled: boolean; skippedReason: string }> {
  try {
    const wikiDir = resolveWikiDir(repoRoot, options.wiki);
    const files = await generateRepoMap({
      repoRoot,
      maxFiles: options.repoMapFiles,
      maxSymbolsPerFile: options.repoMapSymbols,
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

export async function handleSemanticSearch(input: {
  text: string;
  path: string;
  topk: number;
  lang: string;
  withRepoMap: boolean;
  repoMapFiles: number;
  repoMapSymbols: number;
  wiki: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'semantic' });
  const startedAt = Date.now();

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  try {
    const dbDir = defaultDbDir(ctx.repoRoot);
    const dim = typeof ctx.meta?.dim === 'number' ? ctx.meta.dim : 256;
    const q = buildQueryVector(input.text, dim);
    const langs = resolveLanguages(ctx.meta, input.lang);

    if (langs.length === 0) {
      return error('lang_not_available', {
        lang: input.lang,
        available: ctx.meta?.languages ?? [],
      });
    }

    const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs as IndexLang[] });

    const allScored: any[] = [];
    let totalChunks = 0;
    for (const lang of langs) {
      const t = byLang[lang as IndexLang];
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
    const scored = allScored.sort((a, b) => b.score - a.score).slice(0, input.topk);

    const neededByLang: Partial<Record<string, Set<string>>> = {};
    for (const s of scored) {
      if (!neededByLang[s.lang]) neededByLang[s.lang] = new Set<string>();
      neededByLang[s.lang]!.add(String(s.content_hash));
    }

    const refsByLangAndId = new Map<string, Map<string, any[]>>();
    for (const lang of langs) {
      const t = byLang[lang as IndexLang];
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

    log.info('semantic_search', {
      ok: true,
      repoRoot: ctx.repoRoot,
      topk: input.topk,
      lang: input.lang,
      langs,
      chunks: totalChunks,
      hits: hits.length,
      duration_ms: Date.now() - startedAt,
    });

    const repoMap = input.withRepoMap ? await buildRepoMapAttachment(ctx.repoRoot, input) : undefined;
    return success({ repoRoot: ctx.repoRoot, topk: input.topk, lang: input.lang, hits, ...(repoMap ? { repo_map: repoMap } : {}) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('semantic_search', { ok: false, duration_ms: Date.now() - startedAt, err: message });
    return error('semantic_search_failed', { message });
  }
}
