import type { ToolDefinition } from '../types';
import {
  handleGetRepo,
  handleCheckIndex,
  handleRebuildIndex,
  handlePackIndex,
  handleUnpackIndex
} from '../handlers';

export const getRepoDefinition: ToolDefinition = {
  name: 'get_repo',
  description: 'Resolve repository root and scan root for a given path. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path']
  },
  handler: handleGetRepo
};

export const checkIndexDefinition: ToolDefinition = {
  name: 'check_index',
  description: 'Check whether the repository index structure matches current expected schema. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path']
  },
  handler: handleCheckIndex
};

export const rebuildIndexDefinition: ToolDefinition = {
  name: 'rebuild_index',
  description: 'Rebuild full repository index under .git-ai (LanceDB + AST graph). Risk: high (writes .git-ai; can be slow).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      dim: { type: 'number', default: 256 },
      overwrite: { type: 'boolean', default: true }
    },
    required: ['path']
  },
  handler: handleRebuildIndex
};

export const packIndexDefinition: ToolDefinition = {
  name: 'pack_index',
  description: 'Pack .git-ai/lancedb into .git-ai/lancedb.tar.gz. Risk: medium (writes archive; may touch git-lfs config).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      lfs: { type: 'boolean', default: false, description: 'Run git lfs track for .git-ai/lancedb.tar.gz' }
    },
    required: ['path']
  },
  handler: handlePackIndex
};

export const unpackIndexDefinition: ToolDefinition = {
  name: 'unpack_index',
  description: 'Unpack .git-ai/lancedb.tar.gz into .git-ai/lancedb. Risk: medium (writes .git-ai/lancedb).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path']
  },
  handler: handleUnpackIndex
};
