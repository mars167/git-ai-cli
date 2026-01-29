import { Command } from 'commander';
import { GitAIV2MCPServer } from '../mcp/server';

export const serveCommand = new Command('serve')
  .description('Start MCP server (stdio). Repository is specified by path in each tool call.')
  .option('--disable-mcp-log', 'Disable MCP access logging')
  .action(async (options) => {
    const server = new GitAIV2MCPServer(process.cwd(), {
      disableAccessLog: !!options.disableMcpLog,
    });
    await server.start();
  });
