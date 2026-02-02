import type { ToolDefinition } from '../types';
import {
  handleAstGraphQuery,
  handleAstGraphFind,
  handleAstGraphChildren,
  handleAstGraphRefs,
  handleAstGraphCallers,
  handleAstGraphCallees,
  handleAstGraphChain
} from '../handlers';

export const astGraphQueryDefinition: ToolDefinition = {
  name: 'ast_graph_query',
  description: 'Run a CozoScript query against the AST graph database (advanced). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      params: { type: 'object', default: {} },
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path', 'query']
  },
  handler: handleAstGraphQuery
};

export const astGraphFindDefinition: ToolDefinition = {
  name: 'ast_graph_find',
  description: 'Find symbols by name prefix (case-insensitive) using the AST graph. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      prefix: { type: 'string' },
      path: { type: 'string', description: 'Repository root path' },
      limit: { type: 'number', default: 50 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' }
    },
    required: ['path', 'prefix']
  },
  handler: handleAstGraphFind
};

export const astGraphChildrenDefinition: ToolDefinition = {
  name: 'ast_graph_children',
  description: 'List direct children in the AST containment graph (file -> top-level symbols, class -> methods). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Parent id (ref_id or file_id; or file path when as_file=true)' },
      as_file: { type: 'boolean', default: false },
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path', 'id']
  },
  handler: handleAstGraphChildren
};

export const astGraphRefsDefinition: ToolDefinition = {
  name: 'ast_graph_refs',
  description: 'Find reference locations by name (calls/new/type). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      limit: { type: 'number', default: 200 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path', 'name']
  },
  handler: handleAstGraphRefs
};

export const astGraphCallersDefinition: ToolDefinition = {
  name: 'ast_graph_callers',
  description: 'Find callers by callee name. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      limit: { type: 'number', default: 200 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path', 'name']
  },
  handler: handleAstGraphCallers
};

export const astGraphCalleesDefinition: ToolDefinition = {
  name: 'ast_graph_callees',
  description: 'Find callees by caller name. Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      limit: { type: 'number', default: 200 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path', 'name']
  },
  handler: handleAstGraphCallees
};

export const astGraphChainDefinition: ToolDefinition = {
  name: 'ast_graph_chain',
  description: 'Compute call chain by symbol name (heuristic, name-based). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      direction: { type: 'string', enum: ['downstream', 'upstream'], default: 'downstream' },
      max_depth: { type: 'number', default: 3 },
      limit: { type: 'number', default: 500 },
      min_name_len: { type: 'number', default: 1 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
      path: { type: 'string', description: 'Repository root path' }
    },
    required: ['path', 'name']
  },
  handler: handleAstGraphChain
};
