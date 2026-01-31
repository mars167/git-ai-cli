export interface SQ8Vector {
  dim: number;
  scale: number;
  q: Int8Array;
}

export function quantizeSQ8(vector: number[], bits: number = 8): SQ8Vector {
  const dim = vector.length;
  let maxAbs = 0;
  for (let i = 0; i < dim; i++) {
    const a = Math.abs(vector[i] ?? 0);
    if (a > maxAbs) maxAbs = a;
  }

  const { scale, q } = quantizeToBits(vector, bits, maxAbs);
  return { dim, scale, q };
}

export function quantizeToBits(vector: number[], bits: number, maxAbs?: number): SQ8Vector {
  const dim = vector.length;
  const clampedBits = Math.max(4, Math.min(8, Math.round(bits)));
  const range = Math.pow(2, clampedBits - 1) - 1;
  let maxAbsLocal = maxAbs ?? 0;
  if (maxAbsLocal === 0) {
    for (let i = 0; i < dim; i++) {
      const a = Math.abs(vector[i] ?? 0);
      if (a > maxAbsLocal) maxAbsLocal = a;
    }
  }

  const scale = maxAbsLocal === 0 ? 1 : maxAbsLocal / range;
  const q = new Int8Array(dim);
  for (let i = 0; i < dim; i++) {
    const v = (vector[i] ?? 0) / scale;
    const r = Math.round(v);
    const clamped = Math.max(-range, Math.min(range, r));
    q[i] = clamped;
  }
  return { dim, scale, q };
}

export function dequantizeSQ8(sq8: SQ8Vector): Float32Array {
  const out = new Float32Array(sq8.dim);
  for (let i = 0; i < sq8.dim; i++) out[i] = sq8.q[i]! * sq8.scale;
  return out;
}

export function hnswQuantize(vector: number[], bits: number): SQ8Vector {
  return quantizeToBits(vector, bits);
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < dim; i++) {
    const av = Number(a[i] ?? 0);
    const bv = Number(b[i] ?? 0);
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

