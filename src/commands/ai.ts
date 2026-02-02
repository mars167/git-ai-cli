import { Command } from 'commander';
import { indexCommand } from '../cli/commands/indexCommand.js';
import { queryCommand } from '../cli/commands/queryCommand.js';
import { semanticCommand } from '../cli/commands/semanticCommand.js';
import { serveCommand, agentCommand } from '../cli/commands/serveCommands.js';
import { packCommand, unpackCommand } from '../cli/commands/archiveCommands.js';
import { hooksCommand } from '../cli/commands/hooksCommands.js';
import { graphCommand } from '../cli/commands/graphCommands.js';
import { checkIndexCommand, statusCommand } from '../cli/commands/statusCommands.js';
import { dsrCommand } from '../cli/commands/dsrCommands.js';

export const aiCommand = new Command('ai')
  .description('AI features (indexing, search, hooks, MCP)')
  .addCommand(indexCommand)
  .addCommand(checkIndexCommand)
  .addCommand(statusCommand)
  .addCommand(dsrCommand)
  .addCommand(queryCommand)
  .addCommand(semanticCommand)
  .addCommand(graphCommand)
  .addCommand(packCommand)
  .addCommand(unpackCommand)
  .addCommand(agentCommand)
  .addCommand(hooksCommand)
  .addCommand(serveCommand);
