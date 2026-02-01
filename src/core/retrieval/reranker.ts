import path from 'path';
import fs from 'fs-extra';
import type { RankedResult, RetrievalResult } from './types';
import { sha256Hex } from '../crypto';
import { hashEmbedding } from '../embedding';
import { createLogger } from '../log';
import type { Cache } from './cache';
import { LruCache } from './cache';

export interface Candidate {
  id: string;
  content: string;
  filePath: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RerankedResult {
  id: string;
  content: string;
  filePath: string;
  originalScore: number;
  rerankScore: number;
  finalScore: number;
}

export interface RerankerConfig {
  modelName: string;
  device: 'cpu' | 'gpu';
  batchSize: number;
  topK: number;
  scoreWeights: {
    original: number;
    crossEncoder: number;
  };
}

export interface Reranker {
  rerank(query: string, candidates: Candidate[]): Promise<RerankedResult[]>;
  rerankBatch(queries: string[], candidates: Candidate[][]): Promise<RerankedResult[][]>;
}

export type { Cache } from './cache';

interface TokenizerEncodeResult {
  input_ids: bigint[];
  attention_mask: bigint[];
}

interface Tokenizer {
  encode(text: string, options?: { maxLength?: number }): TokenizerEncodeResult;
}

interface TokenizerModule {
  loadTokenizer(modelName: string): Promise<Tokenizer>;
}

interface OrtSession {
  run(feeds: Record<string, any>): Promise<Record<string, { data: Float32Array | BigInt64Array | number[]; dims?: number[] }>>;
}

interface OrtModule {
  InferenceSession: {
    create(modelPath: string, options?: Record<string, unknown>): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: any, dims: number[]) => any;
}

const log = createLogger({ component: 'retrieval', kind: 'reranker' });

function normalizeScores(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const denom = max - min;
  if (denom <= 0) return values.map(() => 0);
  return values.map((v) => (v - min) / denom);
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0 && value <= 1) return value;
  return sigmoid(value);
}

export function fuseScores(
  originalScore: number,
  crossEncoderScore: number,
  weights: { original: number; crossEncoder: number }
): number {
  const normalized = normalizeScore(originalScore);
  const cross = clamp(crossEncoderScore, 0, 1);
  return weights.original * normalized + weights.crossEncoder * cross;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function padBigInt(values: bigint[], target: number, pad: bigint = 0n): bigint[] {
  if (values.length >= target) return values.slice(0, target);
  const out = values.slice();
  while (out.length < target) out.push(pad);
  return out;
}

function findModelPath(modelName: string): string {
  const resolved = path.isAbsolute(modelName) ? modelName : path.join(process.cwd(), modelName);
  const candidates = [resolved, path.join(resolved, 'model.onnx'), path.join(resolved, 'onnx', 'model.onnx')];
  for (const c of candidates) {
    if (fs.pathExistsSync(c)) return c;
  }
  return resolved;
}

function sigmoid(x: number): number {
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function validateRerankInput(query: string, candidates: Candidate[]): { query: string; candidates: Candidate[] } {
  const q = String(query ?? '').trim();
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  return { query: q, candidates: safeCandidates };
}

class CrossEncoderModel {
  private config: RerankerConfig;
  private cache: Cache;
  private onnxPromise: Promise<OrtModule> | null;
  private sessionPromise: Promise<OrtSession> | null;
  private tokenizerPromise: Promise<Tokenizer> | null;

  constructor(config: RerankerConfig, cache: Cache) {
    this.config = config;
    this.cache = cache;
    this.onnxPromise = null;
    this.sessionPromise = null;
    this.tokenizerPromise = null;
  }

  async scorePairs(pairs: Array<{ query: string; content: string }>): Promise<number[]> {
    if (pairs.length === 0) return [];
    const cacheKey = sha256Hex(JSON.stringify(pairs.map((p) => [p.query, p.content])));
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.slice();

    const modelPath = findModelPath(this.config.modelName);
    if (!fs.pathExistsSync(modelPath)) {
      log.info('cross_encoder_model_missing', { model: modelPath });
      const scores = pairs.map((p) => this.hashScore(p.query, p.content));
      this.cache.set(cacheKey, scores);
      return scores;
    }

    try {
      const session = await this.getSession();
      const tokenizer = await this.getTokenizer();
      const batchSize = Math.max(1, this.config.batchSize);
      const scores: number[] = new Array(pairs.length).fill(0);
      for (let i = 0; i < pairs.length; i += batchSize) {
        const slice = pairs.slice(i, i + batchSize);
        const encoded = slice.map((pair) => tokenizer.encode(`${pair.query} ${pair.content}`, { maxLength: 256 }));
        const maxLen = Math.max(2, Math.min(256, Math.max(...encoded.map((e) => e.input_ids.length))));
        const inputIds = encoded.map((e) => padBigInt(e.input_ids, maxLen, 0n));
        const attentionMask = encoded.map((e) => padBigInt(e.attention_mask, maxLen, 0n));
        const feeds = await this.buildFeeds(inputIds, attentionMask, maxLen);
        const outputs = await session.run(feeds);
        const outputName = Object.keys(outputs)[0];
        const output = outputs[outputName];
        if (!output) throw new Error('ONNX output missing');
        const data = output.data as Float32Array;
        const dims = output.dims ?? [slice.length, 1];
        const perRow = Math.max(1, dims[dims.length - 1] ?? 1);
        for (let j = 0; j < slice.length; j++) {
          const raw = data[j * perRow] ?? 0;
          scores[i + j] = sigmoid(Number(raw));
        }
      }
      this.cache.set(cacheKey, scores);
      return scores;
    } catch (err) {
      log.warn('cross_encoder_fallback', { err: String((err as Error)?.message ?? err) });
      const scores = pairs.map((p) => this.hashScore(p.query, p.content));
      this.cache.set(cacheKey, scores);
      return scores;
    }
  }

  dispose(): void {
    this.onnxPromise = null;
    this.sessionPromise = null;
    this.tokenizerPromise = null;
    this.cache.clear();
  }

  private async getSession(): Promise<OrtSession> {
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const onnx = await this.getOnnx();
        const modelPath = findModelPath(this.config.modelName);
        const providers = this.config.device === 'gpu' ? ['cuda', 'cpu'] : ['cpu'];
        const opts = { executionProviders: providers };
        const session = await onnx.InferenceSession.create(modelPath, opts as any);
        log.info('cross_encoder_session_ready', { model: modelPath, device: this.config.device });
        return session;
      })();
    }
    return this.sessionPromise;
  }

  private async getTokenizer(): Promise<Tokenizer> {
    if (!this.tokenizerPromise) {
      this.tokenizerPromise = (async () => {
        const mod = await this.loadTokenizerModule();
        return mod.loadTokenizer(this.config.modelName);
      })();
    }
    return this.tokenizerPromise;
  }

  private async getOnnx(): Promise<OrtModule> {
    if (!this.onnxPromise) this.onnxPromise = this.loadOnnx();
    return this.onnxPromise;
  }

  private async loadOnnx(): Promise<OrtModule> {
    const moduleName: string = 'onnxruntime-node';
    const mod = await import(moduleName);
    return mod as unknown as OrtModule;
  }

  private async loadTokenizerModule(): Promise<TokenizerModule> {
    const moduleName: string = '../embedding/tokenizer.js';
    const mod = await import(moduleName);
    return mod as TokenizerModule;
  }

  private async buildFeeds(inputIds: bigint[][], attentionMask: bigint[][], maxLen: number): Promise<Record<string, any>> {
    const onnx = await this.getOnnx();
    const batch = inputIds.length;
    const flattenIds = inputIds.flat();
    const flattenMask = attentionMask.flat();
    const idsTensor = new onnx.Tensor('int64', BigInt64Array.from(flattenIds), [batch, maxLen]);
    const maskTensor = new onnx.Tensor('int64', BigInt64Array.from(flattenMask), [batch, maxLen]);
    const feeds: Record<string, any> = {};
    const inputNames = ['input_ids', 'attention_mask', 'token_type_ids'];
    for (const name of inputNames) {
      if (name === 'input_ids') feeds[name] = idsTensor;
      if (name === 'attention_mask') feeds[name] = maskTensor;
      if (name === 'token_type_ids') {
        const types = new onnx.Tensor('int64', new BigInt64Array(batch * maxLen), [batch, maxLen]);
        feeds[name] = types;
      }
    }
    return feeds;
  }

  private hashScore(query: string, content: string): number {
    const vec = hashEmbedding(`${query} ${content}`, { dim: 64 });
    const sum = vec.reduce((acc, v) => acc + v, 0);
    return sigmoid(sum);
  }
}

export class CrossEncoderReranker implements Reranker {
  private config: RerankerConfig;
  private cache: Cache;
  private model: CrossEncoderModel;

  constructor(config: RerankerConfig, cache: Cache = new LruCache(256)) {
    this.config = config;
    this.cache = cache;
    this.model = new CrossEncoderModel(config, cache);
  }

  async rerank(query: string, candidates: Candidate[]): Promise<RerankedResult[]> {
    const { query: q, candidates: items } = validateRerankInput(query, candidates);
    if (!q || items.length === 0) return [];
    const limited = items.slice(0, Math.max(1, this.config.topK));
    const pairs = limited.map((item) => ({ query: q, content: item.content }));
    const scores = await this.model.scorePairs(pairs);
    const originalScores = limited.map((c) => c.score);
    const normalizedOriginal = normalizeScores(originalScores);
    const results: RerankedResult[] = limited.map((item, idx) => {
      const rerankScore = clamp(scores[idx] ?? 0, 0, 1);
      const originalScore = normalizedOriginal[idx] ?? 0;
      const finalScore =
        this.config.scoreWeights.original * originalScore +
        this.config.scoreWeights.crossEncoder * rerankScore;
      return {
        id: item.id,
        content: item.content,
        filePath: item.filePath,
        originalScore: item.score,
        rerankScore,
        finalScore,
      };
    });
    results.sort((a, b) => b.finalScore - a.finalScore || b.rerankScore - a.rerankScore);
    return results;
  }

  async rerankBatch(queries: string[], candidates: Candidate[][]): Promise<RerankedResult[][]> {
    const batchSize = Math.min(queries.length, candidates.length);
    const results: RerankedResult[][] = new Array(batchSize);
    for (let i = 0; i < batchSize; i++) {
      results[i] = await this.rerank(queries[i] ?? '', candidates[i] ?? []);
    }
    return results;
  }

  dispose(): void {
    this.model.dispose();
    this.cache.clear();
  }
}

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
