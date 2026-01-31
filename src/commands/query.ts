import { Command } from 'commander';
import path from 'path';
import fs from 'fs-extra';
import { inferWorkspaceRoot, resolveGitRoot } from '../core/git';
import { IndexLang, defaultDbDir, openTablesByLang } from '../core/lancedb';
import { queryManifestWorkspace } from '../core/workspace';
import { buildCoarseWhere, filterAndRankSymbolRows, inferSymbolSearchMode, pickCoarseToken, SymbolSearchMode } from '../core/symbolSearch';
import { createLogger } from '../core/log';
import { checkIndex, resolveLangs } from '../core/indexCheck';
import { generateRepoMap, type FileRank } from '../core/repoMap';

export const queryCommand = new Command('query')
  .description('Query refs table by symbol match (substring/prefix/wildcard/regex/fuzzy)')
  .argument('<keyword>', 'Symbol substring')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--limit <n>', 'Limit results', '50')
  .option('--mode <mode>', 'Mode: substring|prefix|wildcard|regex|fuzzy (default: auto)')
  .option('--case-insensitive', 'Case-insensitive matching', false)
  .option('--max-candidates <n>', 'Max candidates to fetch before filtering', '1000')
  .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
  .option('--with-repo-map', 'Attach a lightweight repo map (ranked files + top symbols + wiki links)', false)
  .option('--repo-map-files <n>', 'Max repo map files', '20')
  .option('--repo-map-symbols <n>', 'Max repo map symbols per file', '5')
  .option('--wiki <dir>', 'Wiki directory (default: docs/wiki or wiki)', '')
  .action(async (keyword, options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai query' });
    const startedAt = Date.now();
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const limit = Number(options.limit);
      const q = String(keyword);
      const mode = inferSymbolSearchMode(q, options.mode as SymbolSearchMode | undefined);
      const caseInsensitive = Boolean(options.caseInsensitive ?? false);
      const maxCandidates = Math.max(limit, Number(options.maxCandidates ?? Math.min(2000, limit * 20)));
      const langSel = String(options.lang ?? 'auto');
      const withRepoMap = Boolean((options as any).withRepoMap ?? false);

      if (inferWorkspaceRoot(repoRoot)) {
        const coarse = (mode === 'substring' || mode === 'prefix') ? q : pickCoarseToken(q);
        const res = await queryManifestWorkspace({ manifestRepoRoot: repoRoot, keyword: coarse, limit: maxCandidates });
        const filteredByLang = filterWorkspaceRowsByLang(res.rows, langSel);
        const rows = filterAndRankSymbolRows(filteredByLang, { query: q, mode, caseInsensitive, limit });
        log.info('query_symbols', { ok: true, repoRoot, workspace: true, mode, case_insensitive: caseInsensitive, limit, max_candidates: maxCandidates, candidates: res.rows.length, rows: rows.length, duration_ms: Date.now() - startedAt });
        const repoMap = withRepoMap ? { enabled: false, skippedReason: 'workspace_mode_not_supported' } : undefined;
        console.log(JSON.stringify({ ...res, rows, ...(repoMap ? { repo_map: repoMap } : {}) }, null, 2));
        return;
      }

      const status = await checkIndex(repoRoot);
      if (!status.ok) {
        process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
        process.exit(2);
        return;
      }

      const langs = resolveLangs(status.found.meta ?? null, langSel as any);
      if (langs.length === 0) {
        process.stderr.write(JSON.stringify({ ok: false, reason: 'lang_not_available', lang: langSel, available: status.found.meta?.languages ?? [] }, null, 2) + '\n');
        process.exit(2);
        return;
      }

      const dbDir = defaultDbDir(repoRoot);
      const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
      const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs });
      const where = buildCoarseWhere({ query: q, mode, caseInsensitive });
      const candidates: any[] = [];
      for (const lang of langs) {
        const t = byLang[lang];
        if (!t) continue;
        const rows = where
          ? await t.refs.query().where(where).limit(maxCandidates).toArray()
          : await t.refs.query().limit(maxCandidates).toArray();
        for (const r of rows as any[]) candidates.push({ ...r, lang });
      }
      const rows = filterAndRankSymbolRows(candidates as any[], { query: q, mode, caseInsensitive, limit });
      log.info('query_symbols', { ok: true, repoRoot, workspace: false, lang: langSel, langs, mode, case_insensitive: caseInsensitive, limit, max_candidates: maxCandidates, candidates: candidates.length, rows: rows.length, duration_ms: Date.now() - startedAt });
      const repoMap = withRepoMap ? await buildRepoMapAttachment(repoRoot, options) : undefined;
      console.log(JSON.stringify({ repoRoot, count: rows.length, lang: langSel, rows, ...(repoMap ? { repo_map: repoMap } : {}) }, null, 2));
    } catch (e) {
      log.error('query_symbols', { ok: false, duration_ms: Date.now() - startedAt, err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } });
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

function inferLangFromFile(file: string): IndexLang {
  const f = String(file);
  if (f.endsWith('.md') || f.endsWith('.mdx')) return 'markdown';
  if (f.endsWith('.yml') || f.endsWith('.yaml')) return 'yaml';
  if (f.endsWith('.java')) return 'java';
  if (f.endsWith('.c') || f.endsWith('.h')) return 'c';
  if (f.endsWith('.go')) return 'go';
  if (f.endsWith('.py')) return 'python';
  if (f.endsWith('.rs')) return 'rust';
  return 'ts';
}

function filterWorkspaceRowsByLang(rows: any[], langSel: string): any[] {
  const sel = String(langSel ?? 'auto');
  if (sel === 'auto' || sel === 'all') return rows;
  const target = sel as IndexLang;
  return rows.filter(r => inferLangFromFile(String((r as any).file ?? '')) === target);
}
