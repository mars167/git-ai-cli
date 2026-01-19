import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { resolveGitRoot } from '../core/git';
import { packLanceDb, unpackLanceDb } from '../core/archive';
import { defaultDbDir, openTables } from '../core/lancedb';
import { ensureLfsTracking } from '../core/lfs';
import { IndexerV2 } from '../core/indexer';
import { buildQueryVector, scoreAgainst } from '../core/search';

export class GitAIV2MCPServer {
  private server: Server;
  private startDir: string;

  constructor(startDir: string) {
    this.startDir = path.resolve(startDir);
    this.server = new Server(
      { name: 'git-ai-v2', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private async open(startDir?: string) {
    const repoRoot = await resolveGitRoot(path.resolve(startDir ?? this.startDir));
    const dbDir = defaultDbDir(repoRoot);
    const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
    const meta = await fs.pathExists(metaPath) ? await fs.readJSON(metaPath).catch(() => null) : null;
    const dim = typeof meta?.dim === 'number' ? meta.dim : 256;
    const tables = await openTables({ dbDir, dim, mode: 'create_if_missing' });
    return { repoRoot, dim, ...tables };
  }

  private async resolveRepoRoot(callPath?: string) {
    return resolveGitRoot(path.resolve(callPath ?? this.startDir));
  }

  private assertPathInsideRepo(repoRoot: string, file: string) {
    const abs = path.resolve(repoRoot, file);
    const root = path.resolve(repoRoot) + path.sep;
    if (!abs.startsWith(root)) throw new Error('Path escapes repository root');
    return abs;
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
            description: 'Search symbols by substring and return file locations',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                path: { type: 'string', description: 'Repository path (optional)' },
                limit: { type: 'number', default: 50 },
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
              },
              required: ['query'],
            },
          },
          {
            name: 'index_repo',
            description: 'Build or update the repository index (.git-ai/lancedb)',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Repository path (optional)' },
                dim: { type: 'number', default: 256 },
                overwrite: { type: 'boolean', default: false },
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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      const callPath = typeof (args as any).path === 'string' ? String((args as any).path) : undefined;

      if (name === 'get_repo') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, startDir: this.startDir, repoRoot }, null, 2) }],
        };
      }

      if (name === 'set_repo') {
        const p = String((args as any).path ?? '');
        this.startDir = path.resolve(p);
        const repoRoot = await resolveGitRoot(this.startDir);
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, startDir: this.startDir, repoRoot }, null, 2) }],
        };
      }

      if (name === 'index_repo') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const dim = Number((args as any).dim ?? 256);
        const overwrite = Boolean((args as any).overwrite ?? false);
        const indexer = new IndexerV2({ repoRoot, dim, overwrite });
        await indexer.run();
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, dim, overwrite }, null, 2) }],
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
        const repoRoot = await this.resolveRepoRoot(callPath);
        const pattern = String((args as any).pattern ?? '**/*');
        const limit = Number((args as any).limit ?? 500);
        const files = await glob(pattern, {
          cwd: repoRoot,
          dot: true,
          nodir: true,
          ignore: ['node_modules/**', '.git/**', '.git-ai/**', 'dist/**'],
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, files: files.slice(0, limit) }, null, 2) }],
        };
      }

      if (name === 'read_file') {
        const repoRoot = await this.resolveRepoRoot(callPath);
        const file = String((args as any).file ?? '');
        const startLine = Math.max(1, Number((args as any).start_line ?? 1));
        const endLine = Math.max(startLine, Number((args as any).end_line ?? startLine + 199));
        const abs = this.assertPathInsideRepo(repoRoot, file);
        const raw = await fs.readFile(abs, 'utf-8');
        const lines = raw.split(/\r?\n/);
        const slice = lines.slice(startLine - 1, endLine);
        const numbered = slice.map((l, idx) => `${String(startLine + idx).padStart(6, ' ')}→${l}`).join('\n');
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, repoRoot, file, start_line: startLine, end_line: endLine, text: numbered }, null, 2) }],
        };
      }

      const { refs, chunks, repoRoot, dim } = await this.open(callPath);

      if (name === 'search_symbols') {
        const query = String((args as any).query ?? '');
        const limit = Number((args as any).limit ?? 50);
        const safe = query.replace(/'/g, "''");
        const rows = await refs.query().where(`symbol LIKE '%${safe}%'`).limit(limit).toArray();
        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, rows }, null, 2) }],
        };
      }

      if (name === 'semantic_search') {
        const query = String((args as any).query ?? '');
        const topk = Number((args as any).topk ?? 10);
        const q = buildQueryVector(query, dim);

        const chunkRows = await chunks.query().select(['content_hash', 'text', 'dim', 'scale', 'qvec_b64']).limit(1_000_000).toArray();
        const scored = (chunkRows as any[]).map(r => ({
          content_hash: String(r.content_hash),
          score: scoreAgainst(q, { dim: Number(r.dim), scale: Number(r.scale), qvec: new Int8Array(Buffer.from(String(r.qvec_b64), 'base64')) }),
          text: String(r.text),
        })).sort((a, b) => b.score - a.score).slice(0, topk);

        return {
          content: [{ type: 'text', text: JSON.stringify({ repoRoot, rows: scored }, null, 2) }],
        };
      }

      return {
        content: [{ type: 'text', text: 'Tool not found' }],
        isError: true,
      };
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Git-AI v2 MCP Server running on stdio');
  }
}
