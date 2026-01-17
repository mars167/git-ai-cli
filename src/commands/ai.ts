import { Command } from 'commander';
import { indexCommand } from './index';
import { queryCommand } from './query';
import { semanticCommand } from './semantic';
import { serveCommand } from './serve';
import { packCommand } from './pack';
import { unpackCommand } from './unpack';
import { hooksCommand } from './hooks';

export const aiCommand = new Command('ai')
  .description('AI features (indexing, search, hooks, MCP)')
  .addCommand(indexCommand)
  .addCommand(queryCommand)
  .addCommand(semanticCommand)
  .addCommand(packCommand)
  .addCommand(unpackCommand)
  .addCommand(hooksCommand)
  .addCommand(serveCommand);

