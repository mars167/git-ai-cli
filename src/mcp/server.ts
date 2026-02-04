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

    this.attachServerHandlers(this.server);
  }

  private attachServerHandlers(serverInstance: Server) {
    serverInstance.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.registry.listTools() };
    });

    serverInstance.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      const callPath = typeof (args as any).path === 'string' ? (args as any).path : undefined;
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

  async start(): Promise<never> {
    const log = createLogger({ component: 'mcp' });
    const transport = this.options.transport ?? 'stdio';

    if (transport === 'http') {
      await this.startHttp();
    } else {
      const stdioTransport = new StdioServerTransport();
      await this.server.connect(stdioTransport);
      log.info('server_started', { startDir: this.startDir, transport: 'stdio' });
    }
    
    // Keep process alive indefinitely - server runs until killed by signal
    return new Promise<never>(() => {});
  }

  private async startHttp() {
    const log = createLogger({ component: 'mcp' });
    const port = this.options.port ?? 3000;
    
    const sessions = new Map<string, { transport: StreamableHTTPServerTransport, server: Server }>();

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        let url: URL;
        try {
          url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        } catch (urlError) {
          log.error('invalid_url', { url: req.url, error: String(urlError) });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request URL' }));
          return;
        }
        
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
        let responseSessionId: string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId);
          if (!session) {
            // Session was deleted between check and access (race condition)
            log.warn('session_race_condition', { sessionId });
            res.writeHead(410, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session expired or no longer exists' }));
            return;
          }
          transport = session.transport;
          responseSessionId = sessionId;
        } else if (this.options.stateless) {
          // Stateless mode: create a new server instance for each request
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          });
          const serverInstance = new Server(
            { name: 'git-ai-v2', version: '2.0.0' },
            { capabilities: { tools: {} } }
          );
          this.attachServerHandlers(serverInstance);
          try {
            await serverInstance.connect(transport);
          } catch (err) {
            log.error('stateless_server_connection_failed', { error: String(err) });
            // Clean up transport on connection failure
            try {
              await transport.close();
            } catch (closeErr) {
              log.error('stateless_transport_cleanup_failed', { error: String(closeErr) });
            }
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to initialize MCP server connection' }));
            return;
          }
          // No session ID in stateless mode
        } else {
          // Create a new session
          const newSessionId = randomUUID();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
          });
          
          const serverInstance = new Server(
            { name: 'git-ai-v2', version: '2.0.0' },
            { capabilities: { tools: {} } }
          );
          this.attachServerHandlers(serverInstance);
          
          try {
            await serverInstance.connect(transport);
          } catch (err) {
            log.error('server_connection_failed', { sessionId: newSessionId, error: String(err) });
            // Clean up transport on connection failure
            try {
              await transport.close();
            } catch (closeErr) {
              log.error('transport_cleanup_failed', { sessionId: newSessionId, error: String(closeErr) });
            }
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to initialize MCP server connection' }));
            return;
          }
          
          // Store session before setting up cleanup handlers
          sessions.set(newSessionId, { transport, server: serverInstance });
          responseSessionId = newSessionId;
          log.info('session_created', { sessionId: newSessionId, totalSessions: sessions.size });
          
          // Set up cleanup handler for when transport closes
          transport.onclose = () => {
            if (sessions.has(newSessionId)) {
              sessions.delete(newSessionId);
              log.info('session_closed', { sessionId: newSessionId, totalSessions: sessions.size });
            }
          };
        }

        // Set session ID in response header for client to reuse
        if (responseSessionId) {
          res.setHeader('mcp-session-id', responseSessionId);
        }

        await transport.handleRequest(req, res);
      } catch (err) {
        log.error('http_request_handler_error', { error: String(err), stack: err instanceof Error ? err.stack : undefined });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    // Store reference to http server for graceful shutdown
    const serverStartPromise = new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
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
        resolve();
      });
    });

    await serverStartPromise;

    // Keep process alive for HTTP server
    // The server will run until a SIGTERM/SIGINT signal is received

    // Handle graceful shutdown
    const shutdown = async () => {
      log.info('server_shutting_down', { sessionsToClose: sessions.size });
      
      // Close all active sessions and their transports
      const closePromises: Promise<void>[] = [];
      for (const [sessionId, session] of sessions.entries()) {
        const closePromise = (async () => {
          try {
            await session.transport.close();
            log.info('session_transport_closed', { sessionId });
          } catch (err) {
            log.error('session_cleanup_error', { sessionId, error: String(err) });
          }
        })();
        closePromises.push(closePromise);
      }
      
      // Wait for all sessions to close
      await Promise.allSettled(closePromises);
      sessions.clear();

      // Close HTTP server
      await new Promise<void>((resolve) => {
        httpServer.close(() => {
          log.info('server_stopped');
          resolve();
        });
      });
    };

    // Register signal handlers for graceful shutdown (use once to prevent duplicates)
    process.once('SIGTERM', async () => {
      await shutdown();
      process.exit(0);
    });

    process.once('SIGINT', async () => {
      await shutdown();
      process.exit(0);
    });
  }
}
