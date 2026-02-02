import { Command } from 'commander';
import { executeHandler } from '../types';

export const serveCommand = new Command('serve')
  .description('Start MCP server. Default: stdio (single client). Use --http for multiple clients.')
  .option('--disable-mcp-log', 'Disable MCP access logging')
  .option('--http', 'Use HTTP transport instead of stdio (supports multiple clients)')
  .option('--port <port>', 'HTTP server port (default: 3000)', '3000')
  .option('--stateless', 'Stateless mode (no session tracking, for load-balanced setups)')
  .action(async (options) => {
    await executeHandler('serve', options);
  });

export const agentCommand = new Command('agent')
  .description('Install Agent skills/rules templates into a target directory')
  .alias('trae')
  .addCommand(
    new Command('install')
      .description('Install skills/rules templates (default: <repoRoot>/.agents)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--to <dir>', 'Destination directory (overrides default)', '')
      .option('--agent <agent>', 'Template layout: agents|trae', 'agents')
      .option('--overwrite', 'Overwrite existing files', false)
      .action(async (options) => {
        await executeHandler('agent', options);
      })
  );
