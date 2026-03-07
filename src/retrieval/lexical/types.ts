import type { SearchResultSet } from '../../domain/search';

export type RuntimeLanguage =
  | 'all'
  | 'ts'
  | 'java'
  | 'python'
  | 'go'
  | 'rust'
  | 'c'
  | 'markdown'
  | 'yaml';

export type LexicalSearchMode = 'exact' | 'substring' | 'regex' | 'literal';

export interface LexicalSearchRequest {
  query: string;
  mode?: LexicalSearchMode;
  lang?: RuntimeLanguage;
  pathPattern?: string;
  limit?: number;
}

export interface LexicalSearchResponse extends SearchResultSet {
  scannedFiles: number;
}
