import { dequantizeSQ8, cosineSimilarity, quantizeSQ8, SQ8Vector } from './sq8';
import { hashEmbedding } from './embedding';
import { classifyQuery } from './retrieval/classifier';
import { expandQuery } from './retrieval/expander';
import { fuseResults } from './retrieval/fuser';
import { rerank } from './retrieval/reranker';
import { computeWeights, type WeightFeedback } from './retrieval/weights';
import type { QueryType, RankedResult, RetrievalResult, RetrievalWeights } from './retrieval/types';

export interface SemanticHit {
  content_hash: string;
  score: number;
  text?: string;
}

export interface AdaptiveQueryPlan {
  query: string;
  expanded: string[];
  queryType: QueryType;
  weights: RetrievalWeights;
}

export interface AdaptiveFusionOptions {
  feedback?: WeightFeedback;
  limit?: number;
}

export interface AdaptiveFusionOutput extends AdaptiveQueryPlan {
  results: RankedResult[];
}

export function buildQueryVector(text: string, dim: number): SQ8Vector {
  const vec = hashEmbedding(text, { dim });
  return quantizeSQ8(vec);
}

export function scoreAgainst(q: SQ8Vector, item: { scale: number; qvec: Int8Array; dim: number }): number {
  const qf = dequantizeSQ8(q);
  const vf = dequantizeSQ8({ dim: item.dim, scale: item.scale, q: item.qvec });
  return cosineSimilarity(qf, vf);
}

export function buildAdaptiveQueryPlan(query: string, feedback?: WeightFeedback): AdaptiveQueryPlan {
  const q = String(query ?? '').trim();
  const queryType = classifyQuery(q);
  const expanded = expandQuery(q, queryType);
  const weights = computeWeights(queryType, feedback);
  return { query: q, expanded, queryType, weights };
}

export function runAdaptiveRetrieval(
  query: string,
  candidates: RetrievalResult[],
  options: AdaptiveFusionOptions = {}
): AdaptiveFusionOutput {
  const plan = buildAdaptiveQueryPlan(query, options.feedback);
  const fused = fuseResults(candidates, plan.weights, options.limit);
  const results = rerank(plan.query, fused, { limit: options.limit });
  return { ...plan, results };
}
