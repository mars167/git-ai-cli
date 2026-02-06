import { z } from 'zod';

/**
 * Supported languages
 */
const LangEnum = z.enum(['auto', 'all', 'java', 'ts']);

/**
 * Symbol search modes
 */
const SearchModeEnum = z.enum(['substring', 'prefix', 'wildcard', 'regex', 'fuzzy']);

/**
 * Schema for search_symbols tool
 */
export const SearchSymbolsArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  query: z.string().min(1, 'query is required'),
  mode: SearchModeEnum.optional(),
  case_insensitive: z.boolean().default(false),
  max_candidates: z.number().int().positive().default(1000),
  lang: LangEnum.default('auto'),
  limit: z.number().int().positive().default(50),
  with_repo_map: z.boolean().default(false),
  repo_map_max_files: z.number().int().positive().default(20),
  repo_map_max_symbols: z.number().int().positive().default(5),
  wiki_dir: z.string().optional(),
});

export type SearchSymbolsArgs = z.infer<typeof SearchSymbolsArgsSchema>;

/**
 * Schema for semantic_search tool
 */
export const SemanticSearchArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  query: z.string().min(1, 'query is required'),
  topk: z.number().int().positive().default(10),
  lang: LangEnum.default('auto'),
  with_repo_map: z.boolean().default(false),
  repo_map_max_files: z.number().int().positive().default(20),
  repo_map_max_symbols: z.number().int().positive().default(5),
  wiki_dir: z.string().optional(),
});

export type SemanticSearchArgs = z.infer<typeof SemanticSearchArgsSchema>;

/**
 * Schema for repo_map tool
 */
export const RepoMapArgsSchema = z.object({
  path: z.string().min(1, 'path is required'),
  max_files: z.number().int().positive().default(20),
  max_symbols: z.number().int().positive().default(5),
  depth: z.number().int().min(1).max(20).default(5),
  max_nodes: z.number().int().positive().default(5000),
  wiki_dir: z.string().optional(),
});

export type RepoMapArgs = z.infer<typeof RepoMapArgsSchema>;
