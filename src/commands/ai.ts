import { Command } from 'commander';
import { indexCommand } from '../cli/commands/indexCommand.js';
import { serveCommand, agentCommand } from '../cli/commands/serveCommands.js';
import { checkIndexCommand, statusCommand } from '../cli/commands/statusCommands.js';
import { repoMapCommand } from '../cli/commands/repoMapCommand.js';

export const aiCommand = new Command('ai')
  .description('Code Context Engine adapters (index, repo overview, agent install, MCP)')
  .addCommand(indexCommand)
  .addCommand(checkIndexCommand)
  .addCommand(statusCommand)
  .addCommand(repoMapCommand)
  .addCommand(agentCommand)
  .addCommand(serveCommand);
