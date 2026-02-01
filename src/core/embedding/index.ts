import type Parser from 'tree-sitter';
import type { SymbolInfo } from '../types';
import { OnnxSemanticEmbedder, defaultSemanticConfig } from './semantic';
import { WlStructuralEmbedder, defaultStructuralConfig } from './structural';
import { GraphSymbolicEmbedder, defaultSymbolicConfig } from './symbolic';
import { WeightedEmbeddingFusion, defaultFusionConfig } from './fusion';
import type { HybridEmbeddingConfig } from './types';
import { parseCodeToTree } from './parser';

export class HybridEmbedder {
  private config: HybridEmbeddingConfig;
  private semantic: OnnxSemanticEmbedder;
  private structural: WlStructuralEmbedder;
  private symbolic: GraphSymbolicEmbedder;
  private fusion: WeightedEmbeddingFusion;

  constructor(config: HybridEmbeddingConfig) {
    this.config = config;
    this.semantic = new OnnxSemanticEmbedder(config.semantic);
    this.structural = new WlStructuralEmbedder(config.structural);
    this.symbolic = new GraphSymbolicEmbedder(config.symbolic);
    this.fusion = new WeightedEmbeddingFusion(config.fusion);
  }

  async embed(code: string, symbols?: SymbolInfo[]): Promise<number[]> {
    const [semanticVec] = await this.semantic.embedBatch([code]);
    const structuralVec = this.structural.embed(this.parse(code));
    const symbolicVec = this.symbolic.embedSymbols(symbols ?? []);
    return this.fusion.fuse(semanticVec ?? [], structuralVec, symbolicVec);
  }

  async embedBatch(codes: string[], symbols?: SymbolInfo[][]): Promise<number[][]> {
    const semanticVecs = await this.semantic.embedBatch(codes);
    const structuralVecs = codes.map((code) => this.structural.embed(this.parse(code)));
    const symbolicVecs = (symbols ?? []).map((s) => this.symbolic.embedSymbols(s ?? []));
    const paddedSymbolic = codes.map((_, idx) => symbolicVecs[idx] ?? this.symbolic.embedSymbols([]));
    return this.fusion.fuseBatch(semanticVecs, structuralVecs, paddedSymbolic);
  }

  private parse(code: string): Parser.Tree {
    return parseCodeToTree(code);
  }
}

export function defaultHybridEmbeddingConfig(): HybridEmbeddingConfig {
  return {
    semantic: defaultSemanticConfig(),
    structural: defaultStructuralConfig(),
    symbolic: defaultSymbolicConfig(),
    fusion: defaultFusionConfig(),
  };
}
