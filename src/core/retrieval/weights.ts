import type { QueryType, RetrievalWeights } from './types';

export interface WeightFeedback {
  acceptedSource?: 'vector' | 'graph' | 'dsr' | 'symbol';
  weightBias?: Partial<RetrievalWeights>;
}

const BASE_WEIGHTS: Record<QueryType['primary'], RetrievalWeights> = {
  semantic: { vectorWeight: 0.55, graphWeight: 0.2, dsrWeight: 0.15, symbolWeight: 0.1 },
  structural: { vectorWeight: 0.25, graphWeight: 0.45, dsrWeight: 0.15, symbolWeight: 0.15 },
  historical: { vectorWeight: 0.2, graphWeight: 0.15, dsrWeight: 0.5, symbolWeight: 0.15 },
  hybrid: { vectorWeight: 0.4, graphWeight: 0.3, dsrWeight: 0.2, symbolWeight: 0.1 },
};

function normalize(weights: RetrievalWeights): RetrievalWeights {
  const total = weights.vectorWeight + weights.graphWeight + weights.dsrWeight + weights.symbolWeight;
  if (total <= 0) return BASE_WEIGHTS.semantic;
  return {
    vectorWeight: weights.vectorWeight / total,
    graphWeight: weights.graphWeight / total,
    dsrWeight: weights.dsrWeight / total,
    symbolWeight: weights.symbolWeight / total,
  };
}

export function computeWeights(queryType: QueryType, feedback?: WeightFeedback): RetrievalWeights {
  const base = { ...BASE_WEIGHTS[queryType.primary] };
  const bias = feedback?.weightBias;
  if (bias) {
    base.vectorWeight += bias.vectorWeight ?? 0;
    base.graphWeight += bias.graphWeight ?? 0;
    base.dsrWeight += bias.dsrWeight ?? 0;
    base.symbolWeight += bias.symbolWeight ?? 0;
  }

  if (feedback?.acceptedSource) {
    const boost = 0.05;
    if (feedback.acceptedSource === 'vector') base.vectorWeight += boost;
    if (feedback.acceptedSource === 'graph') base.graphWeight += boost;
    if (feedback.acceptedSource === 'dsr') base.dsrWeight += boost;
    if (feedback.acceptedSource === 'symbol') base.symbolWeight += boost;
  }

  return normalize(base);
}
