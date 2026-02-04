import type { ToolHandler } from '../types';
import { successResponse, errorResponse } from '../types';
import type {
  SearchSymbolsArgs,
  SemanticSearchArgs,
  RepoMapArgs
} from '../schemas';
import { resolveGitRoot, inferScanRoot, inferWorkspaceRoot } from '../../core/git';
import { defaultDbDir, openTablesByLang } from '../../core/lancedb';
import { buildQueryVector, scoreAgainst } from '../../core/search';
import { checkIndex, resolveLangs } from '../../core/indexCheck';
import { generateRepoMap } from '../../core/repoMap';
import { buildCoarseWhere, filterAndRankSymbolRows, inferSymbolSearchMode, pickCoarseToken } from '../../core/symbolSearch';
import { queryManifestWorkspace } from '../../core/workspace';
import fs from 'fs-extra';
import path from 'path';

async function openRepoContext(startDir: string) {
  const repoRoot = await resolveGitRoot(path.resolve(startDir));
  const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
  const meta = await fs.pathExists(metaPath)
    ? await fs.readJSON(metaPath).catch(() => null)
    : null;
  const dim = typeof meta?.dim === 'number' ? meta.dim : 256;
  const scanRoot = path.resolve(
    repoRoot,
    typeof meta?.scanRoot === 'string'
      ? meta.scanRoot
      : path.relative(repoRoot, inferScanRoot(repoRoot))
  );
  return { repoRoot, scanRoot, dim, meta };
}

function resolveWikiDirInsideRepo(repoRoot: string, wikiOpt: string): string {
  const w = String(wikiOpt ?? '').trim();
  if (w) {
    const abs = path.resolve(repoRoot, w);
    const rel = path.relative(repoRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('wiki_dir escapes repository root');
    }
    if (fs.existsSync(abs)) return abs;
    return '';
  }
  const candidates = [
    path.join(repoRoot, 'docs', 'wiki'),
    path.join(repoRoot, 'wiki')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

async function buildRepoMapAttachment(
  repoRoot: string,
  wikiDir: string,
  maxFiles: number,
  maxSymbolsPerFile: number
) {
  try {
    const files = await generateRepoMap({
      repoRoot,
      maxFiles,
      maxSymbolsPerFile,
      wikiDir: wikiDir || undefined
    });
    return { enabled: true, wikiDir, files };
  } catch (e: any) {
    return { enabled: false, skippedReason: String(e?.message ?? e) };
  }
}

export const handleRepoMap: ToolHandler<RepoMapArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  
  const status = await checkIndex(repoRoot);
  
  if (!status.ok) {
    return successResponse({
      repoRoot,
      repo_map: { 
        enabled: false, 
        skippedReason: 'index_unavailable',
        diagnostics: {
          ok: status.ok,
          problems: status.problems,
          warnings: status.warnings,
          hint: status.hint || 'Rebuild index with: git-ai ai index --overwrite'
        }
      }
    });
  }
  
  const astGraphPath = path.join(repoRoot, '.git-ai', 'ast-graph.sqlite');
  if (!fs.existsSync(astGraphPath)) {
    return successResponse({
      repoRoot,
      repo_map: { 
        enabled: false, 
        skippedReason: 'missing_ast_graph',
        hint: 'Index exists but AST graph is missing. Rebuild with: git-ai ai index --overwrite'
      }
    });
  }
  
  const wikiDir = resolveWikiDirInsideRepo(repoRoot, args.wiki_dir ?? '');
  const maxFiles = args.max_files ?? 20;
  const maxSymbolsPerFile = args.max_symbols ?? 5;
  
  try {
    const files = await generateRepoMap({
      repoRoot,
      maxFiles,
      maxSymbolsPerFile,
      wikiDir: wikiDir || undefined
    });
    
    if (files.length === 0) {
      return successResponse({
        repoRoot,
        repo_map: { 
          enabled: false, 
          skippedReason: 'no_symbols_found',
          hint: 'AST graph exists but no symbols found. This may indicate: (1) Empty repository, (2) Unsupported file types, or (3) Parsing errors. Check .git-ai/cozo.error.json for details.'
        }
      });
    }
    
    return successResponse({
      repoRoot,
      repo_map: { enabled: true, wikiDir, files }
    });
    
  } catch (e: any) {
    return successResponse({
      repoRoot,
      repo_map: { 
        enabled: false, 
        skippedReason: 'generation_error',
        error: String(e?.message ?? e),
        hint: 'Check .git-ai/cozo.error.json for details'
      }
    });
  }
};

export const handleSearchSymbols: ToolHandler<SearchSymbolsArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const query = args.query;
  const limit = args.limit ?? 50;
  const langSel = args.lang ?? 'auto';
  const mode = inferSymbolSearchMode(query, args.mode);
  const caseInsensitive = args.case_insensitive ?? false;
  const maxCandidates = Math.max(
    limit,
    args.max_candidates ?? Math.min(2000, limit * 20)
  );
  const withRepoMap = args.with_repo_map ?? false;
  const wikiDir = resolveWikiDirInsideRepo(repoRoot, args.wiki_dir ?? '');
  const repoMapMaxFiles = args.repo_map_max_files ?? 20;
  const repoMapMaxSymbols = args.repo_map_max_symbols ?? 5;

  const workspaceRoot = inferWorkspaceRoot(repoRoot);
  if (workspaceRoot) {
    const keyword =
      mode === 'substring' || mode === 'prefix'
        ? query
        : pickCoarseToken(query);
    const res = await queryManifestWorkspace({
      manifestRepoRoot: repoRoot,
      keyword,
      limit: maxCandidates
    });
    const filteredByLang =
      langSel === 'java'
        ? res.rows.filter((r: any) =>
            String(r?.file ?? '').endsWith('.java')
          )
        : langSel === 'ts'
          ? res.rows.filter((r: any) =>
              !String(r?.file ?? '').endsWith('.java')
            )
          : res.rows;
    const rows = filterAndRankSymbolRows(filteredByLang, {
      query,
      mode,
      caseInsensitive,
      limit
    });
    const repoMap = withRepoMap
      ? { enabled: false, skippedReason: 'workspace_mode_not_supported' }
      : undefined;

    return successResponse({
      repoRoot,
      lang: langSel,
      rows,
      ...(repoMap ? { repo_map: repoMap } : {})
    });
  }

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
  const dbDir = defaultDbDir(repoRoot);
  const { byLang } = await openTablesByLang({
    dbDir,
    dim,
    mode: 'open_only',
    languages: langs
  });
  const where = buildCoarseWhere({ query, mode, caseInsensitive });
  const candidates: any[] = [];

  for (const lang of langs) {
    const t = byLang[lang];
    if (!t) continue;
    const rows = where
      ? await t.refs.query().where(where).limit(maxCandidates).toArray()
      : await t.refs.query().limit(maxCandidates).toArray();
    for (const r of rows as any[]) {
      candidates.push({ ...r, lang });
    }
  }

  const rows = filterAndRankSymbolRows(candidates as any[], {
    query,
    mode,
    caseInsensitive,
    limit
  });
  const repoMap = withRepoMap
    ? await buildRepoMapAttachment(repoRoot, wikiDir, repoMapMaxFiles, repoMapMaxSymbols)
    : undefined;

  return successResponse({
    repoRoot,
    lang: langSel,
    rows,
    ...(repoMap ? { repo_map: repoMap } : {})
  });
};

export const handleSemanticSearch: ToolHandler<SemanticSearchArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const query = args.query;
  const topk = args.topk ?? 10;
  const langSel = args.lang ?? 'auto';
  const withRepoMap = args.with_repo_map ?? false;
  const wikiDir = resolveWikiDirInsideRepo(repoRoot, args.wiki_dir ?? '');
  const repoMapMaxFiles = args.repo_map_max_files ?? 20;
  const repoMapMaxSymbols = args.repo_map_max_symbols ?? 5;

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
  const dbDir = defaultDbDir(repoRoot);
  const { byLang } = await openTablesByLang({
    dbDir,
    dim,
    mode: 'open_only',
    languages: langs
  });
  const q = buildQueryVector(query, dim);

  const allScored: any[] = [];
  for (const lang of langs) {
    const t = byLang[lang];
    if (!t) continue;
    const chunkRows = await t.chunks
      .query()
      .select(['content_hash', 'text', 'dim', 'scale', 'qvec_b64'])
      .limit(1_000_000)
      .toArray();
    for (const r of chunkRows as any[]) {
      allScored.push({
        lang,
        content_hash: String(r.content_hash),
        score: scoreAgainst(q, {
          dim: Number(r.dim),
          scale: Number(r.scale),
          qvec: new Int8Array(Buffer.from(String(r.qvec_b64), 'base64'))
        }),
        text: String(r.text)
      });
    }
  }

  const rows = allScored
    .sort((a, b) => b.score - a.score)
    .slice(0, topk);
  const repoMap = withRepoMap
    ? await buildRepoMapAttachment(repoRoot, wikiDir, repoMapMaxFiles, repoMapMaxSymbols)
    : undefined;

  return successResponse({
    repoRoot,
    lang: langSel,
    rows,
    ...(repoMap ? { repo_map: repoMap } : {})
  });
};
