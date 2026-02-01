import type Parser from 'tree-sitter';
import type { SymbolInfo } from '../types';

export interface SemanticConfig {
  modelName: string;
  embeddingDim: number;
  device: 'cpu' | 'gpu';
  batchSize: number;
}

export interface SemanticEmbedder {
  embed(code: string): Promise<number[]>;
  embedBatch(codes: string[]): Promise<number[][]>;
}

export interface StructuralConfig {
  dim: number;
  wlIterations: number;
}

export interface StructuralEmbedder {
  embed(tree: Parser.Tree): number[];
  embedNode(node: Parser.SyntaxNode): number[];
  embedSubtree(node: Parser.SyntaxNode): number[];
}

export interface SymbolicConfig {
  dim: number;
  includeCalls: boolean;
  includeTypes: boolean;
  includeImports: boolean;
}

export interface SymbolicEmbedder {
  embedSymbols(symbols: SymbolInfo[]): number[];
  embedRelations(relations: {
    calls: [string, string][];
    types: [string, string][];
    imports: [string, string][];
  }): number[];
}

export interface FusionConfig {
  semanticWeight: number;
  structuralWeight: number;
  symbolicWeight: number;
  normalize: boolean;
}

export interface EmbeddingFusion {
  fuse(semantic: number[], structural: number[], symbolic: number[]): number[];
  fuseBatch(semantic: number[][], structural: number[][], symbolic: number[][]): number[][];
}

export interface HybridEmbeddingConfig {
  semantic: SemanticConfig;
  structural: StructuralConfig;
  symbolic: SymbolicConfig;
  fusion: FusionConfig;
}
