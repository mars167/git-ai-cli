import type { ToolDefinition } from '../types';
import {
  handleSearchSymbols,
  handleSemanticSearch,
  handleRepoMap
} from '../handlers';

export const searchSymbolsDefinition: ToolDefinition = {
  name: 'search_symbols',
  description: 'Search symbols and return file locations (substring/prefix/wildcard/regex/fuzzy). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      mode: { type: 'string', enum: ['substring', 'prefix', 'wildcard', 'regex', 'fuzzy'] },
      case_insensitive: { type: 'boolean', default: false },
      max_candidates: { type: 'number', default: 1000 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
      path: { type: 'string', description: 'Repository root path' },
      limit: { type: 'number', default: 50 },
      with_repo_map: { type: 'boolean', default: false },
      repo_map_max_files: { type: 'number', default: 20 },
      repo_map_max_symbols: { type: 'number', default: 5 },
      wiki_dir: { type: 'string', description: 'Wiki dir relative to repo root (optional)' }
    },
    required: ['path', 'query']
  },
  handler: handleSearchSymbols
};

export const semanticSearchDefinition: ToolDefinition = {
  name: 'semantic_search',
  description: 'Semantic search using SQ8 vectors stored in LanceDB (brute-force). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      path: { type: 'string', description: 'Repository root path' },
      topk: { type: 'number', default: 10 },
      lang: { type: 'string', enum: ['auto', 'all', 'java', 'ts'], default: 'auto' },
      with_repo_map: { type: 'boolean', default: false },
      repo_map_max_files: { type: 'number', default: 20 },
      repo_map_max_symbols: { type: 'number', default: 5 },
      wiki_dir: { type: 'string', description: 'Wiki dir relative to repo root (optional)' }
    },
    required: ['path', 'query']
  },
  handler: handleSemanticSearch
};

export const repoMapDefinition: ToolDefinition = {
  name: 'repo_map',
  description: 'Generate a lightweight repository map (ranked files + top symbols + wiki links). Risk: low (read-only).',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Repository root path' },
      max_files: { type: 'number', default: 20 },
      max_symbols: { type: 'number', default: 5 },
      depth: { type: 'number', default: 5, description: 'PageRank iterations (1-20)' },
      max_nodes: { type: 'number', default: 5000, description: 'Max symbols to process for performance' },
      wiki_dir: { type: 'string', description: 'Wiki dir relative to repo root (optional)' }
    },
    required: ['path']
  },
  handler: handleRepoMap
};
