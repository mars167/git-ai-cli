import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { defaultDbDir, openTables } from '../core/lancedb';
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

  private async open() {
    const repoRoot = await resolveGitRoot(this.startDir);
    const dbDir = defaultDbDir(repoRoot);
    const tables = await openTables({ dbDir, dim: 256, mode: 'create_if_missing' });
    return { repoRoot, ...tables };
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_symbols',
            description: 'Search symbols by substring and return file locations',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
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
                topk: { type: 'number', default: 10 },
              },
              required: ['query'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      const { refs, chunks } = await this.open();

      if (name === 'search_symbols') {
        const query = String((args as any).query ?? '');
        const limit = Number((args as any).limit ?? 50);
        const safe = query.replace(/'/g, "''");
        const rows = await refs.query().where(`symbol LIKE '%${safe}%'`).limit(limit).toArray();
        return {
          content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
        };
      }

      if (name === 'semantic_search') {
        const query = String((args as any).query ?? '');
        const topk = Number((args as any).topk ?? 10);
        const dim = 256;
        const q = buildQueryVector(query, dim);

        const chunkRows = await chunks.query().select(['content_hash', 'text', 'dim', 'scale', 'qvec_b64']).limit(1_000_000).toArray();
        const scored = (chunkRows as any[]).map(r => ({
          content_hash: String(r.content_hash),
          score: scoreAgainst(q, { dim: Number(r.dim), scale: Number(r.scale), qvec: new Int8Array(Buffer.from(String(r.qvec_b64), 'base64')) }),
          text: String(r.text),
        })).sort((a, b) => b.score - a.score).slice(0, topk);

        return {
          content: [{ type: 'text', text: JSON.stringify(scored, null, 2) }],
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
