import type { ToolDefinition } from '../types';
import {
  handleDsrContext,
  handleDsrGenerate,
  handleDsrRebuildIndex,
  handleDsrSymbolEvolution
} from '../handlers';

export const dsrContextDefinition: ToolDefinition = {
  name: 'dsr_context',
  description: 'Get repository Git context and DSR directory state. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path']
  },
  handler: handleDsrContext
};

export const dsrGenerateDefinition: ToolDefinition = {
  name: 'dsr_generate',
  description: 'Generate DSR (Deterministic Semantic Record) for a specific commit. Risk: medium (writes .git-ai/dsr).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      commit: { type: 'string', description: 'Commit hash or ref' }
    },
    required: ['path', 'commit']
  },
  handler: handleDsrGenerate
};

export const dsrRebuildIndexDefinition: ToolDefinition = {
  name: 'dsr_rebuild_index',
  description: 'Rebuild DSR index from DSR files for faster queries. Risk: medium (writes .git-ai/dsr-index).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path']
  },
  handler: handleDsrRebuildIndex
};

export const dsrSymbolEvolutionDefinition: ToolDefinition = {
  name: 'dsr_symbol_evolution',
  description: 'Query symbol evolution history across commits using DSR. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      symbol: { type: 'string', description: 'Symbol name to query' },
      start: { type: 'string', description: 'Start commit (default: HEAD)' },
      all: { type: 'boolean', default: false, description: 'Traverse all refs instead of just HEAD' },
      limit: { type: 'number', default: 200, description: 'Max commits to traverse' },
      contains: { type: 'boolean', default: false, description: 'Match by substring instead of exact' }
    },
    required: ['path', 'symbol']
  },
  handler: handleDsrSymbolEvolution
};
