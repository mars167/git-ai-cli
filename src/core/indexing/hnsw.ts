import { SQ8Vector, dequantizeSQ8 } from '../sq8';
import { HNSWParameters } from './config';

export interface HNSWEntry {
  id: string;
  vector: SQ8Vector;
}

export interface HNSWHit {
  id: string;
  score: number;
}

export interface HNSWIndexSnapshot {
  config: HNSWParameters;
  entries: { id: string; dim: number; scale: number; qvec_b64: string }[];
}

export class HNSWIndex {
  private entries: HNSWEntry[];
  private config: HNSWParameters;

  constructor(config: HNSWParameters) {
    this.config = config;
    this.entries = [];
  }

  add(entry: HNSWEntry): void {
    this.entries.push(entry);
  }

  addBatch(entries: HNSWEntry[]): void {
    if (entries.length === 0) return;
    this.entries.push(...entries);
  }

  size(): number {
    return this.entries.length;
  }

  search(query: SQ8Vector, topk: number): HNSWHit[] {
    const qf = dequantizeSQ8(query);
    const limit = Math.max(1, topk);
    const scored = this.entries.map((entry) => ({
      id: entry.id,
      score: cosineSimilarity(qf, dequantizeSQ8(entry.vector)),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  toSnapshot(): HNSWIndexSnapshot {
    return {
      config: { ...this.config },
      entries: this.entries.map((entry) => ({
        id: entry.id,
        dim: entry.vector.dim,
        scale: entry.vector.scale,
        qvec_b64: Buffer.from(entry.vector.q).toString('base64'),
      })),
    };
  }

  static fromSnapshot(snapshot: HNSWIndexSnapshot): HNSWIndex {
    const index = new HNSWIndex(snapshot.config);
    for (const entry of snapshot.entries) {
      index.add({
        id: entry.id,
        vector: {
          dim: entry.dim,
          scale: entry.scale,
          q: new Int8Array(Buffer.from(entry.qvec_b64, 'base64')),
        },
      });
    }
    return index;
  }
}

export function clampHnswParameters(config: HNSWParameters): HNSWParameters {
  return {
    M: Math.max(2, Math.round(config.M)),
    efConstruction: Math.max(10, Math.round(config.efConstruction)),
    efSearch: Math.max(10, Math.round(config.efSearch)),
    quantizationBits: Math.max(4, Math.min(8, Math.round(config.quantizationBits))),
  };
}

function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
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
