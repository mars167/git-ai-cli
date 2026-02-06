import type { ToolDefinition } from '../types';
import {
  getRepoDefinition,
  checkIndexDefinition,
  rebuildIndexDefinition,
  packIndexDefinition,
  unpackIndexDefinition
} from './repoTools';
import {
  listFilesDefinition,
  readFileDefinition
} from './fileTools';
import {
  searchSymbolsDefinition,
  semanticSearchDefinition,
  repoMapDefinition
} from './searchTools';
import {
  astGraphQueryDefinition,
  astGraphFindDefinition,
  astGraphChildrenDefinition,
  astGraphRefsDefinition,
  astGraphCallersDefinition,
  astGraphCalleesDefinition,
  astGraphChainDefinition
} from './astGraphTools';

export const allTools: ToolDefinition[] = [
  // Repo tools (5)
  getRepoDefinition,
  checkIndexDefinition,
  rebuildIndexDefinition,
  packIndexDefinition,
  unpackIndexDefinition,

  // File tools (2)
  listFilesDefinition,
  readFileDefinition,

  // Search tools (3)
  searchSymbolsDefinition,
  semanticSearchDefinition,
  repoMapDefinition,

  // AST graph tools (7)
  astGraphQueryDefinition,
  astGraphFindDefinition,
  astGraphChildrenDefinition,
  astGraphRefsDefinition,
  astGraphCallersDefinition,
  astGraphCalleesDefinition,
  astGraphChainDefinition,
];

export * from './repoTools';
export * from './fileTools';
export * from './searchTools';
export * from './astGraphTools';
