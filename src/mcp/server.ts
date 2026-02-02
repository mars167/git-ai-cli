import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
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
  transport?: 'stdio' | 'http';
  port?: number;
  stateless?: boolean;
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
        args: JSON.stringify(args).slice(0, 1000),
      };
      await fs.appendFile(logFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e) {
      // ignore
    }
  }

  private setupHandlers() {
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
    const log = createLogger({ component: 'mcp' });
    const transport = this.options.transport ?? 'stdio';

    if (transport === 'http') {
      await this.startHttp();
    } else {
      const stdioTransport = new StdioServerTransport();
      await this.server.connect(stdioTransport);
      log.info('server_started', { startDir: this.startDir, transport: 'stdio' });
    }
  }

  private async startHttp() {
    const log = createLogger({ component: 'mcp' });
    const port = this.options.port ?? 3000;
    
    const sessions = new Map<string, StreamableHTTPServerTransport>();

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
        return;
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP endpoint or /health for health check.' }));
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId)!;
      } else if (this.options.stateless) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const serverInstance = new Server(
          { name: 'git-ai-v2', version: '2.0.0' },
          { capabilities: { tools: {} } }
        );
        this.setupServerHandlers(serverInstance);
        await serverInstance.connect(transport);
      } else {
        const newSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
        });
        
        const serverInstance = new Server(
          { name: 'git-ai-v2', version: '2.0.0' },
          { capabilities: { tools: {} } }
        );
        this.setupServerHandlers(serverInstance);
        await serverInstance.connect(transport);
        
        sessions.set(newSessionId, transport);
        log.info('session_created', { sessionId: newSessionId, totalSessions: sessions.size });
        
        transport.onclose = () => {
          sessions.delete(newSessionId);
          log.info('session_closed', { sessionId: newSessionId, totalSessions: sessions.size });
        };
      }

      await transport.handleRequest(req, res);
    });

    httpServer.listen(port, () => {
      log.info('server_started', { 
        startDir: this.startDir, 
        transport: 'http',
        port,
        endpoint: `http://localhost:${port}/mcp`,
        health: `http://localhost:${port}/health`,
        stateless: !!this.options.stateless,
      });
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        msg: 'MCP HTTP server started',
        port,
        endpoint: `http://localhost:${port}/mcp`,
        health: `http://localhost:${port}/health`,
      }));
    });
  }

  private setupServerHandlers(serverInstance: Server) {
    serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.registry.listTools() };
    });

    serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
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
}
