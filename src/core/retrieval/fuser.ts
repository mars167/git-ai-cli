import type { RankedResult, RetrievalResult, RetrievalWeights } from './types';

function normalizeScores(candidates: RetrievalResult[]): Map<string, number> {
  const bySource = new Map<string, RetrievalResult[]>();
  for (const c of candidates) {
    if (!bySource.has(c.source)) bySource.set(c.source, []);
    bySource.get(c.source)!.push(c);
  }

  const normalized = new Map<string, number>();
  for (const [source, items] of bySource.entries()) {
    const scores = items.map((i) => i.score);
    const max = Math.max(...scores, 0.0001);
    for (const item of items) {
      normalized.set(`${source}:${item.id}`, item.score / max);
    }
  }
  return normalized;
}

export function fuseResults(
  candidates: RetrievalResult[],
  weights: RetrievalWeights,
  limit = 50
): RankedResult[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const normalized = normalizeScores(candidates);
  const out = candidates.map((c) => {
    const key = `${c.source}:${c.id}`;
    const normalizedScore = normalized.get(key) ?? 0;
    const weight =
      c.source === 'vector'
        ? weights.vectorWeight
        : c.source === 'graph'
          ? weights.graphWeight
          : c.source === 'dsr'
            ? weights.dsrWeight
            : weights.symbolWeight;
    const fusedScore = normalizedScore * weight;
    return { ...c, normalizedScore, fusedScore, rank: 0 };
  });

  out.sort((a, b) => b.fusedScore - a.fusedScore || b.score - a.score);
  return out.slice(0, limit).map((item, idx) => ({ ...item, rank: idx + 1 }));
}
