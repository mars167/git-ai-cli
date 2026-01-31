export type QueryPrimaryType = 'semantic' | 'structural' | 'historical' | 'hybrid';

export interface ExtractedEntity {
  type: 'symbol' | 'file' | 'pattern' | 'keyword';
  value: string;
  confidence: number;
}

export interface QueryType {
  primary: QueryPrimaryType;
  confidence: number;
  entities: ExtractedEntity[];
}

export interface RetrievalWeights {
  vectorWeight: number;
  graphWeight: number;
  dsrWeight: number;
  symbolWeight: number;
}

export type RetrievalSource = 'vector' | 'graph' | 'dsr' | 'symbol';

export interface RetrievalResult {
  source: RetrievalSource;
  score: number;
  id: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface RankedResult extends RetrievalResult {
  normalizedScore: number;
  fusedScore: number;
  rank: number;
}

export interface AdaptiveRetrieval {
  classifyQuery(query: string): QueryType;
  expandQuery(query: string): string[];
  computeWeights(queryType: QueryType): RetrievalWeights;
  fuseResults(candidates: RetrievalResult[]): RankedResult[];
}
