import fs from 'fs-extra';
import path from 'path';
import { SQ8Vector, quantizeSQ8, dequantizeSQ8, cosineSimilarity as cosineSimilarityRaw } from '../sq8';
import { HNSWParameters } from './config';

export interface HNSWConfig extends HNSWParameters {
  dim?: number;
  maxElements?: number;
}

export interface QuantizedVector extends SQ8Vector {
  id: string;
}

export interface HNSWEntry {
  id: string;
  vector: SQ8Vector;
}

export interface SearchResult {
  id: string;
  score: number;
}

export type HNSWHit = SearchResult;

export interface HNSWNode {
  id: string;
  vector: SQ8Vector;
  level: number;
  neighbors: Map<number, Map<string, number>>;
}

export interface EntryPoint {
  nodeId: string;
  level: number;
}

export interface IndexStats {
  nodeCount: number;
  edgeCount: number;
  maxLevel: number;
  memoryUsage: number;
}

export interface HNSWIndexSnapshot {
  config: HNSWConfig;
  entries?: { id: string; dim: number; scale: number; qvec_b64: string }[];
  nodes?: {
    id: string;
    level: number;
    dim: number;
    scale: number;
    qvec_b64: string;
    neighbors: Array<{ level: number; items: Array<{ id: string; distance: number }> }>;
  }[];
  entryPoint?: EntryPoint | null;
  maxLevel?: number;
}

const HNSW_MAGIC = Buffer.from('HNSW');
const HNSW_VERSION = 1;

function writeUInt32(value: number): Buffer {
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

function writeFloat32(value: number): Buffer {
  const buf = Buffer.allocUnsafe(4);
  buf.writeFloatLE(value, 0);
  return buf;
}

function writeString(value: string): Buffer[] {
  const bytes = Buffer.from(value, 'utf-8');
  return [writeUInt32(bytes.length), bytes];
}

function assertAvailable(buf: Buffer, offset: number, size: number): void {
  if (offset + size > buf.length) {
    throw new Error('HNSW index file is truncated');
  }
}

function readUInt32(buf: Buffer, state: { offset: number }): number {
  assertAvailable(buf, state.offset, 4);
  const value = buf.readUInt32LE(state.offset);
  state.offset += 4;
  return value;
}

function readFloat32(buf: Buffer, state: { offset: number }): number {
  assertAvailable(buf, state.offset, 4);
  const value = buf.readFloatLE(state.offset);
  state.offset += 4;
  return value;
}

function readString(buf: Buffer, state: { offset: number }): string {
  const length = readUInt32(buf, state);
  if (length === 0) return '';
  assertAvailable(buf, state.offset, length);
  const value = buf.toString('utf-8', state.offset, state.offset + length);
  state.offset += length;
  return value;
}

function copyInt8Slice(buf: Buffer, offset: number, length: number): Int8Array {
  assertAvailable(buf, offset, length);
  const slice = buf.subarray(offset, offset + length);
  const out = new Int8Array(length);
  out.set(slice);
  return out;
}

export class HNSWIndex {
  private config: HNSWConfig;
  private nodes: Map<string, HNSWNode>;
  private entryPoint: EntryPoint | null;
  private maxLevel: number;
  private levelMult: number;
  private dim?: number;
  private levelCap?: number;

  constructor(config: HNSWConfig) {
    const clamped = clampHnswParameters(config);
    this.config = { ...clamped, dim: config.dim, maxElements: config.maxElements };
    this.nodes = new Map();
    this.entryPoint = null;
    this.maxLevel = 0;
    this.levelMult = this.computeLevelMult();
    this.dim = config.dim;
    this.levelCap = this.computeLevelCap();
  }

  getConfig(): HNSWConfig {
    return { ...this.config };
  }

  getCount(): number {
    return this.nodes.size;
  }

  size(): number {
    return this.getCount();
  }

  add(entry: HNSWEntry): void;
  add(id: string, vector: SQ8Vector): void;
  add(arg1: HNSWEntry | string, arg2?: SQ8Vector): void {
    const entry = typeof arg1 === 'string' ? { id: arg1, vector: arg2! } : arg1;
    if (!entry?.id) throw new Error('HNSW entry id is required');
    if (!entry.vector) throw new Error('HNSW entry vector is required');
    if (this.nodes.has(entry.id)) throw new Error(`HNSW entry already exists: ${entry.id}`);
    if (this.config.maxElements && this.nodes.size >= this.config.maxElements) {
      throw new Error('HNSW index is full');
    }

    this.ensureDim(entry.vector);
    const level = this.selectLevel();
    const node: HNSWNode = {
      id: entry.id,
      vector: entry.vector,
      level,
      neighbors: new Map(),
    };
    this.nodes.set(node.id, node);

    if (!this.entryPoint) {
      this.entryPoint = { nodeId: node.id, level: node.level };
      this.maxLevel = node.level;
      return;
    }

    const entryPointLevel = this.entryPoint.level;
    const insertLevel = Math.min(level, entryPointLevel);
    let current = this.findInsertionPoint(entry.vector, insertLevel);

    for (let layer = insertLevel; layer >= 0; layer--) {
      const candidates = this.searchLayer(entry.vector, current, this.config.efConstruction, layer);
      const neighbors = this.selectNeighbors(candidates, this.config.M, node.id);
      this.connectNeighbors(node.id, neighbors, layer);
      if (candidates.length > 0) current = candidates[0]!.id;
    }

    if (node.level > this.maxLevel) {
      this.entryPoint = { nodeId: node.id, level: node.level };
      this.maxLevel = node.level;
    }
  }

  addBatch(entries: HNSWEntry[]): void {
    if (entries.length === 0) return;
    for (const entry of entries) this.add(entry);
  }

  search(query: SQ8Vector, k: number): SearchResult[] {
    if (!this.entryPoint) return [];
    const limit = Math.max(1, k);
    let current = this.entryPoint.nodeId;

    for (let level = this.entryPoint.level; level > 0; level--) {
      const nearest = this.searchLayer(query, current, 1, level);
      if (nearest.length > 0) current = nearest[0]!.id;
    }

    const ef = Math.max(limit, this.config.efSearch);
    const results = this.searchLayer(query, current, ef, 0);
    return results.slice(0, limit);
  }

  searchBatch(queries: SQ8Vector[], k: number): SearchResult[][] {
    if (queries.length === 0) return [];
    return queries.map((query) => this.search(query, k));
  }

  async save(filePath: string): Promise<void> {
    const pieces: Buffer[] = [];
    pieces.push(HNSW_MAGIC);
    pieces.push(writeUInt32(HNSW_VERSION));
    pieces.push(writeUInt32(this.config.M));
    pieces.push(writeUInt32(this.config.efConstruction));
    pieces.push(writeUInt32(this.config.efSearch));
    pieces.push(writeUInt32(this.config.quantizationBits));
    pieces.push(writeUInt32(this.dim ?? this.config.dim ?? 0));
    pieces.push(writeUInt32(this.config.maxElements ?? 0));
    pieces.push(writeUInt32(this.nodes.size));
    pieces.push(writeUInt32(this.maxLevel));

    for (const node of this.nodes.values()) {
      pieces.push(...writeString(node.id));
      pieces.push(writeUInt32(node.level));
      pieces.push(writeUInt32(node.vector.dim));
      pieces.push(writeFloat32(node.vector.scale));
      const qBuffer = Buffer.from(node.vector.q.buffer, node.vector.q.byteOffset, node.vector.q.byteLength);
      pieces.push(qBuffer);

      const neighborsByLevel = Array.from(node.neighbors.entries());
      pieces.push(writeUInt32(neighborsByLevel.length));
      for (const [level, neighbors] of neighborsByLevel) {
        pieces.push(writeUInt32(level));
        pieces.push(writeUInt32(neighbors.size));
        for (const [neighborId, distance] of neighbors) {
          pieces.push(...writeString(neighborId));
          pieces.push(writeFloat32(distance));
        }
      }
    }

    if (this.entryPoint) {
      pieces.push(...writeString(this.entryPoint.nodeId));
      pieces.push(writeUInt32(this.entryPoint.level));
    } else {
      pieces.push(writeUInt32(0));
      pieces.push(writeUInt32(0));
    }

    const output = Buffer.concat(pieces);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, output);
  }

  async load(filePath: string): Promise<void> {
    const data = await fs.readFile(filePath);
    const state = { offset: 0 };

    assertAvailable(data, state.offset, HNSW_MAGIC.length);
    const magic = data.subarray(state.offset, state.offset + HNSW_MAGIC.length);
    state.offset += HNSW_MAGIC.length;
    if (!magic.equals(HNSW_MAGIC)) {
      throw new Error('Invalid HNSW index file');
    }

    const version = readUInt32(data, state);
    if (version !== HNSW_VERSION) {
      throw new Error(`Unsupported HNSW index version: ${version}`);
    }

    const M = readUInt32(data, state);
    const efConstruction = readUInt32(data, state);
    const efSearch = readUInt32(data, state);
    const quantizationBits = readUInt32(data, state);
    const dim = readUInt32(data, state) || undefined;
    const maxElements = readUInt32(data, state) || undefined;
    const nodeCount = readUInt32(data, state);
    const headerMaxLevel = readUInt32(data, state);

    const config: HNSWConfig = {
      M,
      efConstruction,
      efSearch,
      quantizationBits,
      dim,
      maxElements,
    };

    const nodes = new Map<string, HNSWNode>();
    let maxLevel = headerMaxLevel;
    let highest: EntryPoint | null = null;

    for (let i = 0; i < nodeCount; i++) {
      const id = readString(data, state);
      const level = readUInt32(data, state);
      const vecDim = readUInt32(data, state);
      const scale = readFloat32(data, state);
      const q = copyInt8Slice(data, state.offset, vecDim);
      state.offset += vecDim;

      const neighborsByLevelCount = readUInt32(data, state);
      const neighbors = new Map<number, Map<string, number>>();
      for (let j = 0; j < neighborsByLevelCount; j++) {
        const levelId = readUInt32(data, state);
        const neighborCount = readUInt32(data, state);
        const map = new Map<string, number>();
        for (let k = 0; k < neighborCount; k++) {
          const neighborId = readString(data, state);
          const distance = readFloat32(data, state);
          map.set(neighborId, distance);
        }
        neighbors.set(levelId, map);
      }

      const node: HNSWNode = {
        id,
        level,
        vector: { dim: vecDim, scale, q },
        neighbors,
      };
      nodes.set(id, node);

      if (!highest || level > highest.level) highest = { nodeId: id, level };
      if (level > maxLevel) maxLevel = level;
    }

    const entryId = readString(data, state);
    const entryLevel = readUInt32(data, state);
    let entryPoint: EntryPoint | null = null;
    if (entryId) {
      if (!nodes.has(entryId)) {
        throw new Error(`HNSW entry point not found: ${entryId}`);
      }
      entryPoint = { nodeId: entryId, level: entryLevel };
    } else if (highest) {
      entryPoint = highest;
    }

    const clamped = clampHnswParameters(config);
    this.config = { ...clamped, dim, maxElements };
    this.nodes = nodes;
    this.entryPoint = entryPoint;
    this.maxLevel = maxLevel;
    this.dim = dim ?? this.dim;
    if (!this.dim && nodes.size > 0) {
      const first = nodes.values().next().value as HNSWNode | undefined;
      this.dim = first?.vector.dim;
    }
    this.config.dim = this.dim;
    this.levelMult = this.computeLevelMult();
    this.levelCap = this.computeLevelCap();
  }

  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.maxLevel = 0;
    this.dim = this.config.dim;
  }

  stats(): IndexStats {
    let edgeCount = 0;
    let memoryUsage = 0;
    for (const node of this.nodes.values()) {
      memoryUsage += Buffer.byteLength(node.id, 'utf-8');
      memoryUsage += node.vector.q.byteLength + 8;
      for (const neighbors of node.neighbors.values()) {
        edgeCount += neighbors.size;
        for (const neighborId of neighbors.keys()) {
          memoryUsage += Buffer.byteLength(neighborId, 'utf-8') + 8;
        }
      }
    }
    return {
      nodeCount: this.nodes.size,
      edgeCount,
      maxLevel: this.maxLevel,
      memoryUsage,
    };
  }

  toSnapshot(): HNSWIndexSnapshot {
    return {
      config: { ...this.config },
      nodes: Array.from(this.nodes.values()).map((node) => ({
        id: node.id,
        level: node.level,
        dim: node.vector.dim,
        scale: node.vector.scale,
        qvec_b64: Buffer.from(node.vector.q).toString('base64'),
        neighbors: Array.from(node.neighbors.entries()).map(([level, neighbors]) => ({
          level,
          items: Array.from(neighbors.entries()).map(([id, distance]) => ({ id, distance })),
        })),
      })),
      entryPoint: this.entryPoint ? { ...this.entryPoint } : null,
      maxLevel: this.maxLevel,
    };
  }

  static fromSnapshot(snapshot: HNSWIndexSnapshot): HNSWIndex {
    const index = new HNSWIndex(snapshot.config);
    if (snapshot.entries && snapshot.entries.length > 0) {
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

    const nodes = snapshot.nodes ?? [];
    for (const node of nodes) {
      index.nodes.set(node.id, {
        id: node.id,
        level: node.level,
        vector: {
          dim: node.dim,
          scale: node.scale,
          q: new Int8Array(Buffer.from(node.qvec_b64, 'base64')),
        },
        neighbors: new Map(
          node.neighbors.map((layer) => [
            layer.level,
            new Map(layer.items.map((item) => [item.id, item.distance])),
          ]),
        ),
      });
    }

    const entryPoint = snapshot.entryPoint ?? null;
    index.entryPoint = entryPoint ? { ...entryPoint } : null;
    index.maxLevel = snapshot.maxLevel ?? entryPoint?.level ?? 0;
    if (index.nodes.size > 0 && index.maxLevel === 0) {
      for (const node of index.nodes.values()) {
        if (node.level > index.maxLevel) index.maxLevel = node.level;
      }
    }
    if (!index.dim && index.nodes.size > 0) {
      const first = index.nodes.values().next().value as HNSWNode | undefined;
      index.dim = first?.vector.dim;
      index.config.dim = index.dim;
    }
    index.levelMult = index.computeLevelMult();
    index.levelCap = index.computeLevelCap();
    return index;
  }

  private ensureDim(vector: SQ8Vector): void {
    if (!this.dim || this.dim === 0) {
      this.dim = vector.dim;
      this.config.dim = vector.dim;
      return;
    }
    if (vector.dim !== this.dim) {
      throw new Error(`HNSW vector dim mismatch: expected ${this.dim}, got ${vector.dim}`);
    }
  }

  private computeLevelMult(): number {
    const M = Math.max(2, this.config.M);
    const base = Math.log(M);
    if (!Number.isFinite(base) || base === 0) return 1;
    return 1 / base;
  }

  private computeLevelCap(): number | undefined {
    if (!this.config.maxElements || this.config.maxElements <= 0) return undefined;
    const base = Math.log(Math.max(2, this.config.M));
    if (!Number.isFinite(base) || base === 0) return undefined;
    const level = Math.ceil(Math.log(this.config.maxElements) / base);
    return Math.max(0, level);
  }

  private selectLevel(): number {
    const r = Math.max(Number.EPSILON, Math.random());
    const level = Math.floor(-Math.log(r) * this.levelMult);
    if (this.levelCap == null) return level;
    return Math.min(level, this.levelCap);
  }

  private selectNeighbors(candidates: SearchResult[], M: number, excludeId: string): string[] {
    const limit = Math.max(1, M);
    const sorted = candidates
      .filter((c) => c.id !== excludeId)
      .sort((a, b) => b.score - a.score);
    const neighbors: string[] = [];
    const seen = new Set<string>();
    for (const candidate of sorted) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      neighbors.push(candidate.id);
      if (neighbors.length >= limit) break;
    }
    return neighbors;
  }

  private searchLayer(query: SQ8Vector, entryPoint: string, ef: number, level: number): SearchResult[] {
    const entryNode = this.nodes.get(entryPoint);
    if (!entryNode) return [];

    const efSearch = Math.max(1, ef);
    const queryVector = dequantizeSQ8(query);

    const visited = new Set<string>();
    const candidates: SearchResult[] = [];
    const top: SearchResult[] = [];

    const entryScore = this.scoreWithQuery(queryVector, entryNode.vector);
    const entryResult = { id: entryPoint, score: entryScore };
    candidates.push(entryResult);
    top.push(entryResult);
    visited.add(entryPoint);

    while (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const current = candidates.shift()!;
      top.sort((a, b) => b.score - a.score);
      const worstTop = top[top.length - 1];
      if (worstTop && current.score < worstTop.score && top.length >= efSearch) {
        break;
      }

      const currentNode = this.nodes.get(current.id);
      if (!currentNode) continue;
      const neighborMap = currentNode.neighbors.get(level);
      if (!neighborMap) continue;

      for (const neighborId of neighborMap.keys()) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;
        const score = this.scoreWithQuery(queryVector, neighborNode.vector);
        const candidate = { id: neighborId, score };

        if (top.length < efSearch) {
          candidates.push(candidate);
          top.push(candidate);
          continue;
        }

        top.sort((a, b) => b.score - a.score);
        const worst = top[top.length - 1];
        if (worst && score > worst.score) {
          candidates.push(candidate);
          top.push(candidate);
          top.sort((a, b) => b.score - a.score);
          while (top.length > efSearch) top.pop();
        }
      }
    }

    top.sort((a, b) => b.score - a.score);
    return top;
  }

  private findInsertionPoint(query: SQ8Vector, level: number): string {
    if (!this.entryPoint) throw new Error('HNSW index is empty');
    let current = this.entryPoint.nodeId;
    for (let l = this.entryPoint.level; l > level; l--) {
      const results = this.searchLayer(query, current, 1, l);
      if (results.length > 0) current = results[0]!.id;
    }
    return current;
  }

  private connectNeighbors(nodeId: string, neighbors: string[], level: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const nodeNeighbors = this.getNeighborMap(node, level);

    for (const neighborId of neighbors) {
      const neighborNode = this.nodes.get(neighborId);
      if (!neighborNode) continue;
      const distance = this.distanceBetweenVectors(node.vector, neighborNode.vector);
      nodeNeighbors.set(neighborId, distance);

      const neighborMap = this.getNeighborMap(neighborNode, level);
      neighborMap.set(nodeId, distance);
      if (neighborMap.size > this.config.M) {
        neighborNode.neighbors.set(level, this.pruneNeighbors(neighborMap, this.config.M));
      }
    }

    if (nodeNeighbors.size > this.config.M) {
      node.neighbors.set(level, this.pruneNeighbors(nodeNeighbors, this.config.M));
    }
  }

  private getNeighborMap(node: HNSWNode, level: number): Map<string, number> {
    const existing = node.neighbors.get(level);
    if (existing) return existing;
    const map = new Map<string, number>();
    node.neighbors.set(level, map);
    return map;
  }

  private pruneNeighbors(neighbors: Map<string, number>, max: number): Map<string, number> {
    if (neighbors.size <= max) return neighbors;
    const sorted = Array.from(neighbors.entries()).sort((a, b) => a[1] - b[1]).slice(0, max);
    return new Map(sorted);
  }

  private scoreWithQuery(queryVector: Float32Array, vector: SQ8Vector): number {
    return cosineSimilarityRaw(queryVector, dequantizeSQ8(vector));
  }

  private scoreBetweenVectors(a: SQ8Vector, b: SQ8Vector): number {
    return cosineSimilarityRaw(dequantizeSQ8(a), dequantizeSQ8(b));
  }

  private distanceBetweenVectors(a: SQ8Vector, b: SQ8Vector): number {
    return 1 - this.scoreBetweenVectors(a, b);
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

export function quantize(vector: number[], bits: number = 8): SQ8Vector {
  return quantizeSQ8(vector, bits);
}

export function dequantize(q: SQ8Vector): Float32Array {
  return dequantizeSQ8(q);
}

export function cosineSimilarity(a: SQ8Vector, b: SQ8Vector): number {
  return cosineSimilarityRaw(dequantizeSQ8(a), dequantizeSQ8(b));
}
