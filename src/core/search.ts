import { dequantizeSQ8, cosineSimilarity, quantizeSQ8, SQ8Vector } from './sq8';
import { hashEmbedding } from './embedding';

export interface SemanticHit {
  content_hash: string;
  score: number;
  text?: string;
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

