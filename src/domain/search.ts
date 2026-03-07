export type MatchType = 'exact_token' | 'substring' | 'regex' | 'literal' | 'path';

export type EvidenceType =
  | 'content_match'
  | 'path_match'
  | 'symbol_match'
  | 'graph_match'
  | 'semantic_match'
  | 'diff_change';

export type MatchConfidence = 'high' | 'medium' | 'low';

export interface MatchPosition {
  line: number;
  column: number;
}

export interface MatchRange {
  start: MatchPosition;
  end: MatchPosition;
}

export interface SearchMatch {
  why_matched: string;
  match_type: MatchType;
  evidence_type: EvidenceType;
  score: number;
  path: string;
  range: MatchRange;
  symbol?: string;
  preview: string;
  confidence: MatchConfidence;
  lang?: string;
}

export interface SearchResultSet {
  repoRoot: string;
  query: string;
  mode: string;
  matches: SearchMatch[];
}
