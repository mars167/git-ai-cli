import type { ToolDefinition } from '../types';
import {
  handleFindExtensionPoints,
  handleFindImpact,
  handleFindTests,
  handleImplementationContext,
  handleLexicalSearch,
  handleReviewContextForDiff,
} from '../handlers/taskHandlers';

export const lexicalSearchDefinition: ToolDefinition = {
  name: 'lexical_search',
  description: 'Lexical-first code retrieval for agents. Supports exact token, substring, regex, literal, path filter, and language filter. Returns structured SearchMatch results.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      query: { type: 'string', description: 'Search query' },
      mode: { type: 'string', enum: ['exact', 'substring', 'regex', 'literal'] },
      lang: { type: 'string', enum: ['all', 'ts', 'java', 'python', 'go', 'rust', 'c', 'markdown', 'yaml'] },
      path_pattern: { type: 'string', description: 'Glob pattern to constrain files' },
      limit: { type: 'number', default: 50 },
    },
    required: ['path', 'query'],
  },
  handler: handleLexicalSearch,
};

export const implementationContextDefinition: ToolDefinition = {
  name: 'implementation_context',
  description: 'Build a ContextBundle for coding tasks. Primary task-oriented entrypoint for implementation work.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      query: { type: 'string', description: 'Task or symbol query' },
      path_hints: { type: 'array', items: { type: 'string' } },
      symbol_hints: { type: 'array', items: { type: 'string' } },
    },
    required: ['path'],
  },
  handler: handleImplementationContext,
};

export const findTestsDefinition: ToolDefinition = {
  name: 'find_tests',
  description: 'Find tests related to a task, symbol, or file path. Returns an EvidenceBundle for agent verification workflows.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      query: { type: 'string', description: 'Task or symbol query' },
      path_hints: { type: 'array', items: { type: 'string' } },
      symbol_hints: { type: 'array', items: { type: 'string' } },
    },
    required: ['path'],
  },
  handler: handleFindTests,
};

export const findImpactDefinition: ToolDefinition = {
  name: 'find_impact',
  description: 'Build a ContextBundle describing impacted code paths and related references for a proposed change.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      query: { type: 'string', description: 'Changed symbol or concept' },
      path_hints: { type: 'array', items: { type: 'string' } },
      symbol_hints: { type: 'array', items: { type: 'string' } },
    },
    required: ['path'],
  },
  handler: handleFindImpact,
};

export const findExtensionPointsDefinition: ToolDefinition = {
  name: 'find_extension_points',
  description: 'Find extension-oriented code such as interfaces, handlers, registries, hooks, adapters, and plugins.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      query: { type: 'string', description: 'Extension-related query' },
      path_hints: { type: 'array', items: { type: 'string' } },
      symbol_hints: { type: 'array', items: { type: 'string' } },
    },
    required: ['path'],
  },
  handler: handleFindExtensionPoints,
};

export const reviewContextForDiffDefinition: ToolDefinition = {
  name: 'review_context_for_diff',
  description: 'Build diff-aware review evidence. Extracts touched files, symbols, signature/import/config changes, and related code evidence.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      diff_text: { type: 'string', description: 'Raw unified diff text' },
      query: { type: 'string', description: 'Optional extra review prompt' },
      path_hints: { type: 'array', items: { type: 'string' } },
      symbol_hints: { type: 'array', items: { type: 'string' } },
    },
    required: ['path', 'diff_text'],
  },
  handler: handleReviewContextForDiff,
};
