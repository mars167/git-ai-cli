import { Command } from 'commander';
import path from 'path';
import { GitAIV2MCPServer } from '../mcp/server';

export const serveCommand = new Command('serve')
  .description('Start MCP server (stdio)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    const server = new GitAIV2MCPServer(path.resolve(options.path));
    await server.start();
  });

