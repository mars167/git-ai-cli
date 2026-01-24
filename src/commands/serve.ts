import { Command } from 'commander';
import path from 'path';
import { GitAIV2MCPServer } from '../mcp/server';

export const serveCommand = new Command('serve')
  .description('Start MCP server (stdio) using current directory by default')
  .option('-p, --path <path>', 'Repository path (defaults to current directory)', '.')
  .option('--disable-mcp-log', 'Disable MCP access logging')
  .action(async (options) => {
    const server = new GitAIV2MCPServer(path.resolve(options.path), {
      disableAccessLog: !!options.disableMcpLog,
    });
    await server.start();
  });
