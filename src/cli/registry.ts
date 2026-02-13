import type { HandlerRegistration } from './types';
import {
  GraphQuerySchema,
  FindSymbolsSchema,
  GraphChildrenSchema,
  GraphRefsSchema,
  GraphCallersSchema,
  GraphCalleesSchema,
  GraphChainSchema,
} from './schemas/graphSchemas';
import {
  handleGraphQuery,
  handleFindSymbols,
  handleGraphChildren,
  handleGraphRefs,
  handleGraphCallers,
  handleGraphCallees,
  handleGraphChain,
} from './handlers/graphHandlers';
import { IndexRepoSchema } from './schemas/indexSchemas';
import { SearchSymbolsSchema } from './schemas/querySchemas';
import { SearchFilesSchema } from './schemas/queryFilesSchemas';
import { handleIndexRepo } from './handlers/indexHandlers';
import { handleSearchSymbols } from './handlers/queryHandlers';
import { handleSearchFiles } from './handlers/queryFilesHandlers';
import { CheckIndexSchema, StatusSchema } from './schemas/statusSchemas';
import { handleCheckIndex, handleStatus } from './handlers/statusHandlers';
import { PackIndexSchema, UnpackIndexSchema } from './schemas/archiveSchemas';
import { handlePackIndex, handleUnpackIndex } from './handlers/archiveHandlers';
import { InstallHooksSchema, UninstallHooksSchema, HooksStatusSchema } from './schemas/hooksSchemas';
import { handleInstallHooks, handleUninstallHooks, handleHooksStatus } from './handlers/hooksHandlers';
import { ServeSchema, AgentInstallSchema } from './schemas/serveSchemas';
import { handleServe, handleAgentInstall } from './handlers/serveHandlers';
import { RepoMapSchema } from './schemas/repoMapSchema';
import { handleRepoMap } from './handlers/repoMapHandler';

/**
 * Registry of all CLI command handlers
 *
 * Maps command keys to their schema + handler implementations.
 *
 * Command keys follow the pattern:
 * - Top-level commands: 'index', 'status'
 * - Subcommands: 'graph:find', 'graph:query'
 *
 * This will be populated as commands are migrated from src/commands/*.ts
 */
export const cliHandlers: Record<string, HandlerRegistration<any>> = {
  // Top-level commands
  'index': {
    schema: IndexRepoSchema,
    handler: handleIndexRepo,
  },
  'query': {
    schema: SearchSymbolsSchema,
    handler: handleSearchSymbols,
  },
  'query-files': {
    schema: SearchFilesSchema,
    handler: handleSearchFiles,
  },
  'status': {
    schema: StatusSchema,
    handler: handleStatus,
  },
  'checkIndex': {
    schema: CheckIndexSchema,
    handler: handleCheckIndex,
  },
  'pack': {
    schema: PackIndexSchema,
    handler: handlePackIndex,
  },
  'unpack': {
    schema: UnpackIndexSchema,
    handler: handleUnpackIndex,
  },
  'serve': {
    schema: ServeSchema,
    handler: handleServe,
  },
  'agent': {
    schema: AgentInstallSchema,
    handler: handleAgentInstall,
  },
  'repo-map': {
    schema: RepoMapSchema,
    handler: handleRepoMap,
  },
  // Hooks subcommands
  'hooks:install': {
    schema: InstallHooksSchema,
    handler: handleInstallHooks,
  },
  'hooks:uninstall': {
    schema: UninstallHooksSchema,
    handler: handleUninstallHooks,
  },
  'hooks:status': {
    schema: HooksStatusSchema,
    handler: handleHooksStatus,
  },
  // Graph subcommands
  'graph:query': {
    schema: GraphQuerySchema,
    handler: handleGraphQuery,
  },
  'graph:find': {
    schema: FindSymbolsSchema,
    handler: handleFindSymbols,
  },
  'graph:children': {
    schema: GraphChildrenSchema,
    handler: handleGraphChildren,
  },
  'graph:refs': {
    schema: GraphRefsSchema,
    handler: handleGraphRefs,
  },
  'graph:callers': {
    schema: GraphCallersSchema,
    handler: handleGraphCallers,
  },
  'graph:callees': {
    schema: GraphCalleesSchema,
    handler: handleGraphCallees,
  },
  'graph:chain': {
    schema: GraphChainSchema,
    handler: handleGraphChain,
  },
};
