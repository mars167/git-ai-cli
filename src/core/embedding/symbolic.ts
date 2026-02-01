import { sha256Hex } from '../crypto';
import type { SymbolInfo } from '../types';
import type { SymbolicConfig, SymbolicEmbedder } from './types';

function tokenize(text: string): string[] {
  const raw = String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const tok of raw) {
    if (tok.length <= 6) {
      out.push(tok);
    } else {
      out.push(tok.slice(0, 3));
      out.push(tok.slice(3, 6));
      out.push(tok.slice(6));
    }
  }
  return out;
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm <= 0) return vec.slice();
  return vec.map((v) => v / norm);
}

function hashToIndex(hash: string, dim: number): number {
  const idx = parseInt(hash.slice(0, 8), 16) >>> 0;
  return idx % dim;
}

function addToken(vec: number[], token: string, dim: number, weight: number): void {
  const hash = sha256Hex(token);
  const idx = hashToIndex(hash, dim);
  const sign = (parseInt(hash.slice(8, 10), 16) & 1) === 0 ? 1 : -1;
  vec[idx] += sign * weight;
}

function addRelation(vec: number[], a: string, b: string, dim: number, weight: number): void {
  const h = sha256Hex(`${a}=>${b}`);
  const idx = hashToIndex(h, dim);
  vec[idx] += weight;
}

export class GraphSymbolicEmbedder implements SymbolicEmbedder {
  private config: SymbolicConfig;

  constructor(config: SymbolicConfig) {
    this.config = config;
  }

  embedSymbols(symbols: SymbolInfo[]): number[] {
    const dim = this.config.dim;
    const vec = new Array(dim).fill(0);
    for (const sym of symbols) {
      const nameTokens = tokenize(sym.name);
      for (const t of nameTokens) addToken(vec, t, dim, 1);
      const signatureTokens = tokenize(sym.signature);
      for (const t of signatureTokens) addToken(vec, t, dim, 0.5);
      addToken(vec, sym.kind, dim, 0.3);
      if (sym.container) {
        const containerTokens = tokenize(sym.container.name);
        for (const t of containerTokens) addToken(vec, t, dim, 0.4);
      }
      if (sym.extends) {
        for (const ext of sym.extends) addToken(vec, ext, dim, 0.6);
      }
      if (sym.implements) {
        for (const iface of sym.implements) addToken(vec, iface, dim, 0.4);
      }
    }
    return normalize(vec);
  }

  embedRelations(relations: {
    calls: [string, string][];
    types: [string, string][];
    imports: [string, string][];
  }): number[] {
    const dim = this.config.dim;
    const vec = new Array(dim).fill(0);
    if (this.config.includeCalls) {
      for (const [caller, callee] of relations.calls) {
        addRelation(vec, caller, callee, dim, 1);
        for (const t of tokenize(caller)) addToken(vec, t, dim, 0.2);
        for (const t of tokenize(callee)) addToken(vec, t, dim, 0.2);
      }
    }
    if (this.config.includeTypes) {
      for (const [sub, sup] of relations.types) {
        addRelation(vec, sub, sup, dim, 0.8);
        for (const t of tokenize(sub)) addToken(vec, t, dim, 0.15);
        for (const t of tokenize(sup)) addToken(vec, t, dim, 0.15);
      }
    }
    if (this.config.includeImports) {
      for (const [file, imp] of relations.imports) {
        addRelation(vec, file, imp, dim, 0.6);
      }
    }
    return normalize(vec);
  }
}

export function defaultSymbolicConfig(): SymbolicConfig {
  return {
    dim: 128,
    includeCalls: true,
    includeTypes: true,
    includeImports: true,
  };
}
