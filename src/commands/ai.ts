import { Command } from 'commander';
import { indexCommand } from './index';
import { queryCommand } from './query';
import { semanticCommand } from './semantic';
import { serveCommand } from './serve';
import { packCommand } from './pack';
import { unpackCommand } from './unpack';
import { hooksCommand } from './hooks';
import { graphCommand } from './graph';
import { checkIndexCommand } from './checkIndex';
import { statusCommand } from './status';
import { agentCommand } from './trae';
import { dsrCommand } from './dsr';

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
