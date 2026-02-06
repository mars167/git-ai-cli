import type { QueryType, RetrievalWeights } from './types';

export interface WeightFeedback {
  acceptedSource?: 'vector' | 'graph' | 'symbol';
  weightBias?: Partial<RetrievalWeights>;
}

const BASE_WEIGHTS: Record<QueryType['primary'], RetrievalWeights> = {
  semantic: { vectorWeight: 0.6, graphWeight: 0.3, symbolWeight: 0.1 },
  structural: { vectorWeight: 0.3, graphWeight: 0.6, symbolWeight: 0.1 },
  historical: { vectorWeight: 0.4, graphWeight: 0.3, symbolWeight: 0.3 },
  hybrid: { vectorWeight: 0.5, graphWeight: 0.4, symbolWeight: 0.1 },
};

function normalize(weights: RetrievalWeights): RetrievalWeights {
  const total = weights.vectorWeight + weights.graphWeight + weights.symbolWeight;
  if (total <= 0) return BASE_WEIGHTS.semantic;
  return {
    vectorWeight: weights.vectorWeight / total,
    graphWeight: weights.graphWeight / total,
    symbolWeight: weights.symbolWeight / total,
  };
}

export function computeWeights(queryType: QueryType, feedback?: WeightFeedback): RetrievalWeights {
  const base = { ...BASE_WEIGHTS[queryType.primary] };
  const bias = feedback?.weightBias;
  if (bias) {
    base.vectorWeight += bias.vectorWeight ?? 0;
    base.graphWeight += bias.graphWeight ?? 0;
    base.symbolWeight += bias.symbolWeight ?? 0;
  }

  if (feedback?.acceptedSource) {
    const boost = 0.05;
    if (feedback.acceptedSource === 'vector') base.vectorWeight += boost;
    if (feedback.acceptedSource === 'graph') base.graphWeight += boost;
    if (feedback.acceptedSource === 'symbol') base.symbolWeight += boost;
  }

  return normalize(base);
}
