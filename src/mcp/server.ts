import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { glob } from 'glob';
import { resolveGitRoot, inferScanRoot, inferWorkspaceRoot } from '../core/git';
import { packLanceDb, unpackLanceDb } from '../core/archive';
import { defaultDbDir, openTablesByLang } from '../core/lancedb';
import { ensureLfsTracking } from '../core/lfs';
import { buildQueryVector, scoreAgainst } from '../core/search';
import { queryManifestWorkspace } from '../core/workspace';
import { buildCallChainDownstreamByNameQuery, buildCallChainUpstreamByNameQuery, buildCalleesByNameQuery, buildCallersByNameQuery, buildChildrenQuery, buildFindReferencesQuery, buildFindSymbolsQuery, runAstGraphQuery } from '../core/astGraphQuery';
import { buildCoarseWhere, filterAndRankSymbolRows, inferSymbolSearchMode, pickCoarseToken } from '../core/symbolSearch';
import { sha256Hex } from '../core/crypto';
import { toPosixPath } from '../core/paths';
import { createLogger } from '../core/log';
import { checkIndex, resolveLangs } from '../core/indexCheck';
import { generateRepoMap, type FileRank } from '../core/repoMap';

export interface GitAIV2MCPServerOptions {
  disableAccessLog?: boolean;
}

export class GitAIV2MCPServer {
  private server: Server;
  private startDir: string;
  private options: GitAIV2MCPServerOptions;

  constructor(startDir: string, options: GitAIV2MCPServerOptions = {}) {
    this.startDir = path.resolve(startDir);
    this.options = options;
    this.server = new Server(
      { name: 'git-ai-v2', version: '1.1.1' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private async openRepoContext(startDir?: string) {
    const repoRoot = await resolveGitRoot(path.resolve(startDir ?? this.startDir));
    const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
    const meta = await fs.pathExists(metaPath) ? await fs.readJSON(metaPath).catch(() => null) : null;
    const dim = typeof meta?.dim === 'number' ? meta.dim : 256;
    const scanRoot = path.resolve(repoRoot, typeof meta?.scanRoot === 'string' ? meta.scanRoot : path.relative(repoRoot, inferScanRoot(repoRoot)));
    return { repoRoot, scanRoot, dim, meta };
  }

  private async resolveRepoRoot(callPath?: string) {
    return resolveGitRoot(path.resolve(callPath ?? this.startDir));
  }

  private assertPathInsideRoot(rootDir: string, file: string) {
    const abs = path.resolve(rootDir, file);
    const rel = path.relative(path.resolve(rootDir), abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path escapes repository root');
    return abs;
  }

  private async writeAccessLog(name: string, args: any, duration: number, ok: boolean, repoRoot?: string) {
    if (this.options.disableAccessLog) return;
    if (process.env.GIT_AI_DISABLE_MCP_ACCESS_LOG === 'true' || process.env.GIT_AI_DISABLE_MCP_ACCESS_LOG === '1') return;

    try {
      const logDir = path.join(os.homedir(), '.git-ai', 'logs');
      await fs.ensureDir(logDir);
      const logFile = path.join(logDir, 'mcp-access.log');
      const entry = {
        ts: new Date().toISOString(),
        tool: name,
        repo: repoRoot ? path.basename(repoRoot) : 'unknown',
        duration_ms: duration,
        ok,
        args: JSON.stringify(args).slice(0, 1000), // Avoid overly large logs
      };
      await fs.appendFile(logFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e) {
      // ignore
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_repo',
            description: 'Get current default repository root for this MCP server',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'search_symbols',
            description: 'Search symbols and return file locations (substring/prefix/wildcard/regex/fuzzy)',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                mode: { type: 'string', enum: ['substring', 'prefix', 'wildcard', 'regex', 'fuzzy'] },
                case_insensitive: { type: 'boolean', default: false },
                max_candidates: { type: 'number', default: 1000 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
                path: { type: 'string', description: 'Repository path (optional)' },
                limit: { type: 'number', default: 50 },
                with_repo_map: { type: 'boolean', default: false },
                repo_map_max_files: { type: 'number', default: 20 },
                repo_map_max_symbols: { type: 'number', default: 5 },
                wiki_dir: { type: 'string', description: 'Wiki dir relative to repo root (optional)' },
              },
              required: ['query'],
            },
          },
          {
            name: 'semantic_search',
            description: 'Semantic search using SQ8 vectors stored in LanceDB (brute-force)',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                path: { type: 'string', description: 'Repository path (optional)' },
                topk: { type: 'number', default: 10 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
                with_repo_map: { type: 'boolean', default: false },
                repo_map_max_files: { type: 'number', default: 20 },
                repo_map_max_symbols: { type: 'number', default: 5 },
                wiki_dir: { type: 'string', description: 'Wiki dir relative to repo root (optional)' },
              },
              required: ['query'],
            },
          },
          {
            name: 'repo_map',
            description: 'Generate a lightweight repository map (ranked files + top symbols + wiki links)',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
                max_files: { type: 'number', default: 20 },
                max_symbols: { type: 'number', default: 5 },
                wiki_dir: { type: 'string', description: 'Wiki dir relative to repo root (optional)' },
              },
            },
          },
          {
            name: 'check_index',
            description: 'Check whether the repository index structure matches current expected schema',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
              },
            },
          },
          {
            name: 'pack_index',
            description: 'Pack .git-ai/lancedb into .git-ai/lancedb.tar.gz',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
                lfs: { type: 'boolean', default: false, description: 'Run git lfs track for .git-ai/lancedb.tar.gz' },
              },
            },
          },
          {
            name: 'unpack_index',
            description: 'Unpack .git-ai/lancedb.tar.gz into .git-ai/lancedb',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
              },
            },
          },
          {
            name: 'list_files',
            description: 'List repository files by glob pattern',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
                pattern: { type: 'string', default: '**/*' },
                limit: { type: 'number', default: 500 },
              },
            },
          },
          {
            name: 'read_file',
            description: 'Read a repository file with optional line range',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
                file: { type: 'string', description: 'File path relative to repo root' },
                start_line: { type: 'number', default: 1 },
                end_line: { type: 'number', default: 200 },
              },
              required: ['file'],
            },
          },
          {
            name: 'set_repo',
            description: 'Set default repository path for subsequent tool calls',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
          {
            name: 'ast_graph_query',
            description: 'Run a CozoScript query against the AST graph database (advanced)',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                params: { type: 'object', default: {} },
                path: { type: 'string', description: 'Repository path (optional)' },
              },
              required: ['query'],
            },
          },
          {
            name: 'ast_graph_find',
            description: 'Find symbols by name prefix (case-insensitive) using the AST graph',
            inputSchema: {
              type: 'object',
              properties: {
                prefix: { type: 'string' },
                path: { type: 'string', description: 'Repository path (optional)' },
                limit: { type: 'number', default: 50 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
              },
              required: ['prefix'],
            },
          },
          {
            name: 'ast_graph_children',
            description: 'List direct children in the AST containment graph (file -> top-level symbols, class -> methods)',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Parent id (ref_id or file_id; or file path when as_file=true)' },
                as_file: { type: 'boolean', default: false },
                path: { type: 'string', description: 'Repository path (optional)' },
              },
              required: ['id'],
            },
          },
          {
            name: 'ast_graph_refs',
            description: 'Find reference locations by name (calls/new/type)',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                limit: { type: 'number', default: 200 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
                path: { type: 'string', description: 'Repository path (optional)' },
              },
              required: ['name'],
            },
          },
          {
            name: 'ast_graph_callers',
            description: 'Find callers by callee name',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                limit: { type: 'number', default: 200 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
                path: { type: 'string', description: 'Repository path (optional)' },
              },
              required: ['name'],
            },
          },
          {
            name: 'ast_graph_callees',
            description: 'Find callees by caller name',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                limit: { type: 'number', default: 200 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
                path: { type: 'string', description: 'Repository path (optional)' },
              },
              required: ['name'],
            },
          },
          {
            name: 'ast_graph_chain',
            description: 'Compute call chain by symbol name (heuristic, name-based)',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                direction: { type: 'string', enum: ['downstream', 'upstream'], default: 'downstream' },
                max_depth: { type: 'number', default: 3 },
                limit: { type: 'number', default: 500 },
                min_name_len: { type: 'number', default: 1 },
                lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
                path: { type: 'string', description: 'Repository path (optional)' },
              },
              required: ['name'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      const callPath = typeof (args as any).path === 'string' ? String((args as any).path) : undefined;
      const log = createLogger({ component: 'mcp', tool: name });
      const startedAt = Date.now();

      const response = await (async () => {

      if (name === 'get_repo') {
        const ctx = await this.openRepoContext(callPath);
        const repoRoot = ctx.repoRoot;
        const scanRoot = ctx.scanRoot;
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, startDir: this.startDir, repoRoot, scanRoot }, null, 2) }],
        };
      }

      if (name === 'set_repo') {
        const p = String((args as any).path ?? '');
        this.startDir = path.resolve(p);
        const ctx = await this.openRepoContext(this.startDir);
        const repoRoot = ctx.repoRoot;
        const scanRoot = ctx.scanRoot;
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, startDir: this.startDir, repoRoot, scanRoot }, null, 2) }],
        };
      }

      if (name === 'check_index') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const res = await checkIndex(repoRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, ...res }, null, 2) }],
          isError: !res.ok,
        };
      }

      if (name === 'pack_index') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const packed = await packLanceDb(repoRoot);
        const lfs = Boolean((args as any).lfs ?? false) ? ensureLfsTracking(repoRoot, '.git-ai/lancedb.tar.gz') : { tracked: false };
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, ...packed, lfs }, null, 2) }],
        };
      }

      if (name === 'unpack_index') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const unpacked = await unpackLanceDb(repoRoot);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, ...unpacked }, null, 2) }],
        };
      }

      if (name === 'list_files') {
        const { repoRoot, scanRoot } = await this.openRepoContext(callPath);
        const pattern = String((args as any).pattern ?? '**/*');
        const limit = Number((args as any).limit ?? 500);
        const files = await glob(pattern, {
          cwd: scanRoot,
          dot: true,
          nodir: true,
          ignore: ['node_modules/**', '.git/**', '**/.git/**', '.git-ai/**', '**/.git-ai/**', '.repo/**', '**/.repo/**', 'dist/**', 'target/**', '**/target/**', 'build/**', '**/build/**', '.gradle/**', '**/.gradle/**'],
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, scanRoot, files: files.slice(0, limit) }, null, 2) }],
        };
      }

      if (name === 'read_file') {
        const { repoRoot, scanRoot } = await this.openRepoContext(callPath);
        const file = String((args as any).file ?? '');
        const startLine = Math.max(1, Number((args as any).start_line ?? 1));
        const endLine = Math.max(startLine, Number((args as any).end_line ?? startLine + 199));
        const abs = this.assertPathInsideRoot(scanRoot, file);
        const raw = await fs.readFile(abs, 'utf-8');
        const lines = raw.split(/\r?\n/);
        const slice = lines.slice(startLine - 1, endLine);
        const numbered = slice.map((l, idx) => `${String(startLine + idx).padStart(6, ' ')}→${l}`).join('\n');
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, scanRoot, file, start_line: startLine, end_line: endLine, text: numbered }, null, 2) }],
        };
      }

      if (name === 'ast_graph_query') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const query = String((args as any).query ?? '');
        const params = (args as any).params && typeof (args as any).params === 'object' ? (args as any).params : {};
        const result = await runAstGraphQuery(repoRoot, query, params);
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, result }, null, 2) }],
        };
      }

      if (name === 'ast_graph_find') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const prefix = String((args as any).prefix ?? '');
        const limit = Number((args as any).limit ?? 50);
        const langSel = String((args as any).lang ?? 'auto');
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildFindSymbolsQuery(lang), { prefix, lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, lang: langSel, result: { headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'], rows: allRows.slice(0, limit) } }, null, 2) }],
        };
      }

      if (name === 'ast_graph_children') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const id = String((args as any).id ?? '');
        const asFile = Boolean((args as any).as_file ?? false);
        const parent_id = asFile ? sha256Hex(`file:${toPosixPath(id)}`) : id;
        const result = await runAstGraphQuery(repoRoot, buildChildrenQuery(), { parent_id });
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, parent_id, result }, null, 2) }],
        };
      }

      if (name === 'ast_graph_refs') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const target = String((args as any).name ?? '');
        const limit = Number((args as any).limit ?? 200);
        const langSel = String((args as any).lang ?? 'auto');
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildFindReferencesQuery(lang), { name: target, lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, name: target, lang: langSel, result: { headers: ['file', 'line', 'col', 'ref_kind', 'from_id', 'from_kind', 'from_name', 'from_lang'], rows: allRows.slice(0, limit) } }, null, 2) }],
        };
      }

      if (name === 'ast_graph_callers') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const target = String((args as any).name ?? '');
        const limit = Number((args as any).limit ?? 200);
        const langSel = String((args as any).lang ?? 'auto');
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildCallersByNameQuery(lang), { name: target, lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, name: target, lang: langSel, result: { headers: ['caller_id', 'caller_kind', 'caller_name', 'file', 'line', 'col', 'caller_lang'], rows: allRows.slice(0, limit) } }, null, 2) }],
        };
      }

      if (name === 'ast_graph_callees') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const target = String((args as any).name ?? '');
        const limit = Number((args as any).limit ?? 200);
        const langSel = String((args as any).lang ?? 'auto');
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildCalleesByNameQuery(lang), { name: target, lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, name: target, lang: langSel, result: { headers: ['caller_id', 'caller_lang', 'callee_id', 'callee_file', 'callee_name', 'callee_kind', 'file', 'line', 'col'], rows: allRows.slice(0, limit) } }, null, 2) }],
        };
      }

      if (name === 'ast_graph_chain') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const target = String((args as any).name ?? '');
        const direction = String((args as any).direction ?? 'downstream');
        const maxDepth = Number((args as any).max_depth ?? 3);
        const limit = Number((args as any).limit ?? 500);
        const minNameLen = Math.max(1, Number((args as any).min_name_len ?? 1));
        const langSel = String((args as any).lang ?? 'auto');
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const query = direction === 'upstream' ? buildCallChainUpstreamByNameQuery() : buildCallChainDownstreamByNameQuery();
        const rawRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, query, { name: target, max_depth: maxDepth, lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) rawRows.push(r);
        }
        const filtered = minNameLen > 1
          ? rawRows.filter((r: any[]) => String(r?.[3] ?? '').length >= minNameLen && String(r?.[4] ?? '').length >= minNameLen)
          : rawRows;
        const rows = filtered.slice(0, limit);
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, name: target, lang: langSel, direction, max_depth: maxDepth, min_name_len: minNameLen, result: { headers: ['caller_id', 'callee_id', 'depth', 'caller_name', 'callee_name', 'lang'], rows } }, null, 2) }],
        };
      }

      const repoRootForDispatch = await this.resolveRepoRoot(callPath);

      if (name === 'repo_map') {
        const wikiDir = resolveWikiDirInsideRepo(repoRootForDispatch, String((args as any).wiki_dir ?? ''));
        const maxFiles = Number((args as any).max_files ?? 20);
        const maxSymbolsPerFile = Number((args as any).max_symbols ?? 5);
        const repoMap = await buildRepoMapAttachment(repoRootForDispatch, wikiDir, maxFiles, maxSymbolsPerFile);
        return { content: [{ type: 'text', text: JSON.stringify({ repoRoot: repoRootForDispatch, repo_map: repoMap }, null, 2) }] };
      }

      if (name === 'search_symbols' && inferWorkspaceRoot(repoRootForDispatch)) {
        const query = String((args as any).query ?? '');
        const limit = Number((args as any).limit ?? 50);
        const mode = inferSymbolSearchMode(query, (args as any).mode);
        const caseInsensitive = Boolean((args as any).case_insensitive ?? false);
        const maxCandidates = Math.max(limit, Number((args as any).max_candidates ?? Math.min(2000, limit * 20)));
        const keyword = (mode === 'substring' || mode === 'prefix') ? query : pickCoarseToken(query);
        const res = await queryManifestWorkspace({ manifestRepoRoot: repoRootForDispatch, keyword, limit: maxCandidates });
        const langSel = String((args as any).lang ?? 'auto');
        const filteredByLang = (langSel === 'java')
          ? res.rows.filter(r => String((r as any).file ?? '').endsWith('.java'))
          : (langSel === 'ts')
            ? res.rows.filter(r => !String((r as any).file ?? '').endsWith('.java'))
            : res.rows;
        const rows = filterAndRankSymbolRows(filteredByLang, { query, mode, caseInsensitive, limit });
        const withRepoMap = Boolean((args as any).with_repo_map ?? false);
        const repoMap = withRepoMap ? { enabled: false, skippedReason: 'workspace_mode_not_supported' } : undefined;
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot: repoRootForDispatch, lang: langSel, rows, ...(repoMap ? { repo_map: repoMap } : {}) }, null, 2) }],
        };
      }

      if (name === 'search_symbols') {
        const query = String((args as any).query ?? '');
        const limit = Number((args as any).limit ?? 50);
        const langSel = String((args as any).lang ?? 'auto');
        const mode = inferSymbolSearchMode(query, (args as any).mode);
        const caseInsensitive = Boolean((args as any).case_insensitive ?? false);
        const maxCandidates = Math.max(limit, Number((args as any).max_candidates ?? Math.min(2000, limit * 20)));
        const withRepoMap = Boolean((args as any).with_repo_map ?? false);
        const wikiDir = resolveWikiDirInsideRepo(repoRootForDispatch, String((args as any).wiki_dir ?? ''));
        const repoMapMaxFiles = Number((args as any).repo_map_max_files ?? 20);
        const repoMapMaxSymbols = Number((args as any).repo_map_max_symbols ?? 5);
        const status = await checkIndex(repoRootForDispatch);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
        const dbDir = defaultDbDir(repoRootForDispatch);
        const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs });
        const where = buildCoarseWhere({ query, mode, caseInsensitive });
        const candidates: any[] = [];
        for (const lang of langs) {
          const t = byLang[lang];
          if (!t) continue;
          const rows = where
            ? await t.refs.query().where(where).limit(maxCandidates).toArray()
            : await t.refs.query().limit(maxCandidates).toArray();
          for (const r of rows as any[]) candidates.push({ ...r, lang });
        }
        const rows = filterAndRankSymbolRows(candidates as any[], { query, mode, caseInsensitive, limit });
        const repoMap = withRepoMap ? await buildRepoMapAttachment(repoRootForDispatch, wikiDir, repoMapMaxFiles, repoMapMaxSymbols) : undefined;
        return { content: [{ type: 'text', text: JSON.stringify({ repoRoot: repoRootForDispatch, lang: langSel, rows, ...(repoMap ? { repo_map: repoMap } : {}) }, null, 2) }] };
      }

      if (name === 'semantic_search') {
        const query = String((args as any).query ?? '');
        const topk = Number((args as any).topk ?? 10);
        const langSel = String((args as any).lang ?? 'auto');
        const withRepoMap = Boolean((args as any).with_repo_map ?? false);
        const wikiDir = resolveWikiDirInsideRepo(repoRootForDispatch, String((args as any).wiki_dir ?? ''));
        const repoMapMaxFiles = Number((args as any).repo_map_max_files ?? 20);
        const repoMapMaxSymbols = Number((args as any).repo_map_max_symbols ?? 5);
        const status = await checkIndex(repoRootForDispatch);
        if (!status.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) }], isError: true };
        }
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const dim = typeof status.found.meta?.dim === 'number' ? status.found.meta.dim : 256;
        const dbDir = defaultDbDir(repoRootForDispatch);
        const { byLang } = await openTablesByLang({ dbDir, dim, mode: 'open_only', languages: langs });
        const q = buildQueryVector(query, dim);

        const allScored: any[] = [];
        for (const lang of langs) {
          const t = byLang[lang];
          if (!t) continue;
          const chunkRows = await t.chunks.query().select(['content_hash', 'text', 'dim', 'scale', 'qvec_b64']).limit(1_000_000).toArray();
          for (const r of chunkRows as any[]) {
            allScored.push({
              lang,
              content_hash: String(r.content_hash),
              score: scoreAgainst(q, { dim: Number(r.dim), scale: Number(r.scale), qvec: new Int8Array(Buffer.from(String(r.qvec_b64), 'base64')) }),
              text: String(r.text),
            });
          }
        }
        const rows = allScored.sort((a, b) => b.score - a.score).slice(0, topk);
        const repoMap = withRepoMap ? await buildRepoMapAttachment(repoRootForDispatch, wikiDir, repoMapMaxFiles, repoMapMaxSymbols) : undefined;
        return { content: [{ type: 'text', text: JSON.stringify({ repoRoot: repoRootForDispatch, lang: langSel, rows, ...(repoMap ? { repo_map: repoMap } : {}) }, null, 2) }] };
      }

      return {
        content: [{ type: 'text', text: 'Tool not found' }],
        isError: true,
      };
      })().catch((e) => {
        const err = e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) };
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, tool: name, error: err }, null, 2) }],
          isError: true,
        };
      });

      log.info('tool_call', { ok: !response.isError, duration_ms: Date.now() - startedAt, path: callPath });
      const repoRootForLog = await this.resolveRepoRoot(callPath).catch(() => undefined);
      await this.writeAccessLog(name, args, Date.now() - startedAt, !response.isError, repoRootForLog);
      return response;
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    createLogger({ component: 'mcp' }).info('server_started', { startDir: this.startDir, transport: 'stdio' });
  }
}

async function buildRepoMapAttachment(
  repoRoot: string,
  wikiDir: string,
  maxFiles: number,
  maxSymbolsPerFile: number
): Promise<{ enabled: true; wikiDir: string; files: FileRank[] } | { enabled: false; skippedReason: string }> {
  try {
    const files = await generateRepoMap({ repoRoot, maxFiles, maxSymbolsPerFile, wikiDir: wikiDir || undefined });
    return { enabled: true, wikiDir, files };
  } catch (e: any) {
    return { enabled: false, skippedReason: String(e?.message ?? e) };
  }
}

function resolveWikiDirInsideRepo(repoRoot: string, wikiOpt: string): string {
  const w = String(wikiOpt ?? '').trim();
  if (w) {
    const abs = path.resolve(repoRoot, w);
    const rel = path.relative(repoRoot, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('wiki_dir escapes repository root');
    if (fs.existsSync(abs)) return abs;
    return '';
  }
  const candidates = [path.join(repoRoot, 'docs', 'wiki'), path.join(repoRoot, 'wiki')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}
