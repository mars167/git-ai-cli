import { sha256Hex } from './crypto';

export interface EmbeddingOptions {
  dim: number;
}

function tokenise(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean);
}

function hashToUint32(hex: string): number {
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

export function hashEmbedding(text: string, options: EmbeddingOptions): number[] {
  const dim = options.dim;
  const vec = new Float32Array(dim);
  const tokens = tokenise(text);
  if (tokens.length === 0) return Array.from(vec);

  for (const t of tokens) {
    const h = sha256Hex(t);
    const u = hashToUint32(h);
    const idx = u % dim;
    const sign = (u & 1) === 0 ? 1 : -1;
    vec[idx] += sign;
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] = vec[i]! / norm;
  }

  return Array.from(vec);
}

