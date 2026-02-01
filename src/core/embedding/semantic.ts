import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { hashEmbedding } from '../embedding';
import { sha256Hex } from '../crypto';
import { createLogger } from '../log';
import type { SemanticConfig, SemanticEmbedder } from './types';

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
  run(feeds: Record<string, any>): Promise<Record<string, { data: Float32Array | BigInt64Array | number[] }>>;
}

interface OrtModule {
  InferenceSession: {
    create(modelPath: string, options?: Record<string, unknown>): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: any, dims: number[]) => any;
}

const log = createLogger({ component: 'embedding', kind: 'semantic' });

class LruCache {
  private maxSize: number;
  private map: Map<string, number[]>;

  constructor(maxSize: number) {
    this.maxSize = Math.max(1, maxSize);
    this.map = new Map();
  }

  get(key: string): number[] | undefined {
    const value = this.map.get(key);
    if (!value) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: number[]): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value as string | undefined;
      if (first) this.map.delete(first);
    }
  }
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm <= 0) return vec.slice();
  return vec.map((v) => v / norm);
}

function meanPool(
  hidden: Float32Array,
  attention: ArrayLike<number> | ArrayLike<bigint>,
  dims: [number, number, number]
): number[] {
  const [batch, seqLen, dim] = dims;
  if (batch !== 1) throw new Error('meanPool expects batch=1');
  const out = new Float32Array(dim);
  let count = 0;
  for (let i = 0; i < seqLen; i++) {
    const att = Number(attention[i] ?? 0);
    if (att === 0) continue;
    const offset = i * dim;
    for (let d = 0; d < dim; d++) out[d] += hidden[offset + d];
    count += 1;
  }
  if (count === 0) return Array.from(out);
  for (let d = 0; d < dim; d++) out[d] /= count;
  return Array.from(out);
}

function padBigInt(values: bigint[], target: number, pad: bigint = 0n): bigint[] {
  if (values.length >= target) return values.slice(0, target);
  const out = values.slice();
  while (out.length < target) out.push(pad);
  return out;
}

function findModelPath(modelName: string): string {
  const resolved = path.isAbsolute(modelName) ? modelName : path.join(process.cwd(), modelName);
  const candidates = [
    resolved,
    path.join(resolved, 'model.onnx'),
    path.join(resolved, 'onnx', 'model.onnx'),
  ];
  for (const c of candidates) {
    if (fs.pathExistsSync(c)) return c;
  }
  return resolved;
}

async function loadOnnx(): Promise<OrtModule> {
  const moduleName: string = 'onnxruntime-node';
  const mod = await import(moduleName);
  return mod as unknown as OrtModule;
}

async function loadTokenizerModule(): Promise<TokenizerModule> {
  const moduleName: string = './tokenizer.js';
  const mod = await import(moduleName);
  return mod as TokenizerModule;
}

export class OnnxSemanticEmbedder implements SemanticEmbedder {
  private config: SemanticConfig;
  private cache: LruCache;
  private onnxPromise: Promise<OrtModule> | null;
  private sessionPromise: Promise<OrtSession> | null;
  private tokenizerPromise: Promise<Tokenizer> | null;

  constructor(config: SemanticConfig) {
    this.config = config;
    this.cache = new LruCache(512);
    this.onnxPromise = null;
    this.sessionPromise = null;
    this.tokenizerPromise = null;
  }

  async embed(code: string): Promise<number[]> {
    const batch = await this.embedBatch([code]);
    return batch[0] ?? new Array(this.config.embeddingDim).fill(0);
  }

  async embedBatch(codes: string[]): Promise<number[][]> {
    const clean = codes.map((c) => String(c ?? ''));
    const results: number[][] = new Array(clean.length);
    const pending: Array<{ index: number; code: string; key: string }> = [];
    for (let i = 0; i < clean.length; i++) {
      const key = sha256Hex(clean[i]);
      const cached = this.cache.get(key);
      if (cached) {
        results[i] = cached.slice();
      } else {
        pending.push({ index: i, code: clean[i], key });
      }
    }

    if (pending.length === 0) return results;

    try {
      const session = await this.getSession();
      const tokenizer = await this.getTokenizer();
      const batchSize = Math.max(1, this.config.batchSize);
      for (let i = 0; i < pending.length; i += batchSize) {
        const slice = pending.slice(i, i + batchSize);
        const encoded = slice.map((item) => tokenizer.encode(item.code, { maxLength: 512 }));
        const maxLen = Math.max(2, Math.min(512, Math.max(...encoded.map((e) => e.input_ids.length))));
        const inputIds = encoded.map((e) => padBigInt(e.input_ids, maxLen, 0n));
        const attentionMask = encoded.map((e) => padBigInt(e.attention_mask, maxLen, 0n));

        const feeds = await this.buildFeeds(inputIds, attentionMask, maxLen, session);
        const outputs = await session.run(feeds);
        const outputName = Object.keys(outputs)[0];
        const output = outputs[outputName];
        if (!output) throw new Error('ONNX output missing');
        const outputDims = (output as any).dims as number[] | undefined;
        const seqLen = outputDims?.[1] ?? maxLen;
        const hiddenDim = outputDims?.[2] ?? this.config.embeddingDim;
        const data = output.data as Float32Array;
        const batchOut: number[][] = [];
        for (let b = 0; b < slice.length; b++) {
          const offset = b * seqLen * hiddenDim;
          const chunk = data.slice(offset, offset + seqLen * hiddenDim);
          const pooled = meanPool(chunk, attentionMask[b]!, [1, seqLen, hiddenDim]);
          const normalized = normalize(pooled);
          batchOut.push(this.ensureDim(normalized, this.config.embeddingDim));
        }

        for (let j = 0; j < slice.length; j++) {
          const out = batchOut[j] ?? new Array(this.config.embeddingDim).fill(0);
          results[slice[j]!.index] = out;
          this.cache.set(slice[j]!.key, out);
        }
      }
      return results;
    } catch (err) {
      log.warn('semantic_embed_fallback', { err: String((err as Error)?.message ?? err) });
      for (const item of pending) {
        const out = this.hashEmbed(item.code);
        results[item.index] = out;
        this.cache.set(item.key, out);
      }
      return results;
    }
  }

  private async getSession(): Promise<OrtSession> {
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const onnx = await this.getOnnx();
        const modelPath = findModelPath(this.config.modelName);
        const providers = this.config.device === 'gpu' ? ['cuda', 'cpu'] : ['cpu'];
        const opts = { executionProviders: providers };
        const session = await onnx.InferenceSession.create(modelPath, opts as any);
        log.info('semantic_session_ready', { model: modelPath, device: this.config.device });
        return session;
      })();
    }
    return this.sessionPromise;
  }

  private async getTokenizer(): Promise<Tokenizer> {
    if (!this.tokenizerPromise) {
      this.tokenizerPromise = (async () => {
        const mod = await loadTokenizerModule();
        return mod.loadTokenizer(this.config.modelName);
      })();
    }
    return this.tokenizerPromise;
  }

  private async getOnnx(): Promise<OrtModule> {
    if (!this.onnxPromise) this.onnxPromise = loadOnnx();
    return this.onnxPromise;
  }

  private async buildFeeds(
    inputIds: bigint[][],
    attentionMask: bigint[][],
    maxLen: number,
    session: OrtSession
  ): Promise<Record<string, any>> {
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

  private ensureDim(vec: number[], dim: number): number[] {
    if (vec.length === dim) return vec;
    if (vec.length > dim) return vec.slice(0, dim);
    const out = vec.slice();
    while (out.length < dim) out.push(0);
    return out;
  }

  private hashEmbed(text: string): number[] {
    const out = hashEmbedding(text, { dim: this.config.embeddingDim });
    return out;
  }
}

export function defaultSemanticConfig(): SemanticConfig {
  // Support environment variable override
  const modelPath = process.env.GIT_AI_EMBEDDING_MODEL ||
    path.join(os.homedir(), '.cache', 'git-ai', 'models', 'codebert', 'model.onnx');

  // Auto-detect embedding dimension based on model path
  let embeddingDim = 768; // Default for CodeBERT
  if (modelPath.includes('MiniLM')) {
    embeddingDim = 384; // MiniLM-L6 uses 384 dimensions
  }

  return {
    modelName: modelPath,
    embeddingDim,
    device: 'cpu',
    batchSize: 4,
  };
}
