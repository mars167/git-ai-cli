import type { RankedResult, RetrievalResult } from './types';

export interface RerankOptions {
  limit?: number;
}

function tokenize(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function overlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const set = new Set(candidateTokens);
  let hits = 0;
  for (const t of queryTokens) if (set.has(t)) hits += 1;
  return hits / queryTokens.length;
}

function pairwiseBoost(results: RankedResult[]): Map<string, number> {
  const boost = new Map<string, number>();
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      if (a.source === b.source) continue;
      const aKey = `${a.source}:${a.id}`;
      const bKey = `${b.source}:${b.id}`;
      const aText = String(a.text ?? a.metadata?.text ?? '');
      const bText = String(b.text ?? b.metadata?.text ?? '');
      const aTokens = new Set(tokenize(aText));
      const overlap = overlapScore(Array.from(aTokens), tokenize(bText));
      if (overlap > 0.2) {
        boost.set(aKey, (boost.get(aKey) ?? 0) + 0.05);
        boost.set(bKey, (boost.get(bKey) ?? 0) + 0.05);
      }
    }
  }
  return boost;
}

export function rerank(
  query: string,
  candidates: Array<RankedResult | RetrievalResult>,
  options: RerankOptions = {}
): RankedResult[] {
  const qTokens = tokenize(query);
  const limit = Math.max(1, Number(options.limit ?? 50));
  const ranked: RankedResult[] = candidates.map((c, idx) => {
    const normalizedScore = 'normalizedScore' in c ? c.normalizedScore : 0;
    const fusedScore = 'fusedScore' in c ? c.fusedScore : c.score;
    const text = String(c.text ?? c.metadata?.text ?? '');
    const overlap = overlapScore(qTokens, tokenize(text));
    const rerankScore = fusedScore + overlap * 0.2;
    return { ...c, normalizedScore, fusedScore: rerankScore, rank: idx + 1 };
  });

  const boosts = pairwiseBoost(ranked);
  for (const r of ranked) {
    const key = `${r.source}:${r.id}`;
    const boost = boosts.get(key) ?? 0;
    r.fusedScore += boost;
  }

  ranked.sort((a, b) => b.fusedScore - a.fusedScore || b.score - a.score);
  return ranked.slice(0, limit).map((r, idx) => ({ ...r, rank: idx + 1 }));
}
