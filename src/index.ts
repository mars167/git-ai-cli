export { createCodeContextEngine } from './retrieval/runtime';
export type { CodeContextEngine, CodeContextEngineOptions } from './retrieval/runtime';

export type {
  MatchConfidence,
  MatchPosition,
  MatchRange,
  MatchType,
  EvidenceType,
  SearchMatch,
  SearchResultSet,
} from './domain/search';

export type {
  EvidenceBundle,
  ContextBundle,
  ContextSection,
} from './domain/context';

export type {
  DiffFileChange,
  DiffInsight,
} from './domain/diff';

export type {
  TaskRequest,
  DiffTaskRequest,
  TaskResult,
} from './domain/tasks';

export type {
  RuntimeLanguage,
  LexicalSearchMode,
  LexicalSearchRequest,
  LexicalSearchResponse,
} from './retrieval/lexical/types';
