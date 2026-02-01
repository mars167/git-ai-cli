import type { EmbeddingFusion, FusionConfig } from './types';

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm <= 0) return vec.slice();
  return vec.map((v) => v / norm);
}

function scale(vec: number[], weight: number, targetDim: number): number[] {
  const out = new Array(targetDim).fill(0);
  const len = Math.min(vec.length, targetDim);
  for (let i = 0; i < len; i++) out[i] = vec[i]! * weight;
  return out;
}

export class WeightedEmbeddingFusion implements EmbeddingFusion {
  private config: FusionConfig;

  constructor(config: FusionConfig) {
    this.config = config;
  }

  fuse(semantic: number[], structural: number[], symbolic: number[]): number[] {
    const dim = Math.max(semantic.length, structural.length, symbolic.length);
    const out = new Array(dim).fill(0);
    const s0 = scale(semantic, this.config.semanticWeight, dim);
    const s1 = scale(structural, this.config.structuralWeight, dim);
    const s2 = scale(symbolic, this.config.symbolicWeight, dim);
    for (let i = 0; i < dim; i++) out[i] = s0[i]! + s1[i]! + s2[i]!;
    return this.config.normalize ? normalize(out) : out;
  }

  fuseBatch(semantic: number[][], structural: number[][], symbolic: number[][]): number[][] {
    const count = Math.max(semantic.length, structural.length, symbolic.length);
    const out: number[][] = [];
    for (let i = 0; i < count; i++) {
      out.push(this.fuse(semantic[i] ?? [], structural[i] ?? [], symbolic[i] ?? []));
    }
    return out;
  }
}

export function defaultFusionConfig(): FusionConfig {
  return {
    semanticWeight: 0.5,
    structuralWeight: 0.3,
    symbolicWeight: 0.2,
    normalize: true,
  };
}
