import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { resolveGitRoot, inferScanRoot } from '../core/git';
import { createLogger } from '../core/log';
import type { ToolContext } from './types';
import { ToolRegistry } from './registry';
import { allTools } from './tools';
import * as schemas from './schemas';

export interface GitAIV2MCPServerOptions {
  disableAccessLog?: boolean;
}

export class GitAIV2MCPServer {
  private server: Server;
  private startDir: string;
  private options: GitAIV2MCPServerOptions;
  private registry: ToolRegistry;

  constructor(startDir: string, options: GitAIV2MCPServerOptions = {}) {
    this.startDir = path.resolve(startDir);
    this.options = options;
    this.server = new Server(
      { name: 'git-ai-v2', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.registry = new ToolRegistry();
    this.setupHandlers();
  }

  private async openRepoContext(startDir: string) {
    const repoRoot = await resolveGitRoot(path.resolve(startDir));
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
    // Register all tools with their schemas
    const schemaMap: Record<string, any> = {
      get_repo: schemas.GetRepoArgsSchema,
      check_index: schemas.CheckIndexArgsSchema,
      rebuild_index: schemas.RebuildIndexArgsSchema,
      pack_index: schemas.PackIndexArgsSchema,
      unpack_index: schemas.UnpackIndexArgsSchema,
      list_files: schemas.ListFilesArgsSchema,
      read_file: schemas.ReadFileArgsSchema,
      search_symbols: schemas.SearchSymbolsArgsSchema,
      semantic_search: schemas.SemanticSearchArgsSchema,
      repo_map: schemas.RepoMapArgsSchema,
      ast_graph_query: schemas.AstGraphQueryArgsSchema,
      ast_graph_find: schemas.AstGraphFindArgsSchema,
      ast_graph_children: schemas.AstGraphChildrenArgsSchema,
      ast_graph_refs: schemas.AstGraphRefsArgsSchema,
      ast_graph_callers: schemas.AstGraphCallersArgsSchema,
      ast_graph_callees: schemas.AstGraphCalleesArgsSchema,
      ast_graph_chain: schemas.AstGraphChainArgsSchema,
      dsr_context: schemas.DsrContextArgsSchema,
      dsr_generate: schemas.DsrGenerateArgsSchema,
      dsr_rebuild_index: schemas.DsrRebuildIndexArgsSchema,
      dsr_symbol_evolution: schemas.DsrSymbolEvolutionArgsSchema,
    };

    for (const tool of allTools) {
      const schema = schemaMap[tool.name];
      this.registry.register(tool, schema);
    }

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.registry.listTools() };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      const callPath = typeof (args as any).path === 'string' ? String((args as any).path) : undefined;
      const log = createLogger({ component: 'mcp', tool: name });
      const startedAt = Date.now();
      const context: ToolContext = { startDir: this.startDir, options: this.options };

      const response = await this.registry.execute(name, args, context);

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
