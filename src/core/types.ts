export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'method';
  startLine: number;
  endLine: number;
  signature: string;
  container?: {
    name: string;
    kind: 'function' | 'class' | 'method';
    startLine: number;
    endLine: number;
    signature: string;
  };
  extends?: string[];
  implements?: string[];
}

export type AstRefKind = 'call' | 'new' | 'type';

export interface AstReference {
  name: string;
  refKind: AstRefKind;
  line: number;
  column: number;
}

export interface ParseResult {
  symbols: SymbolInfo[];
  refs: AstReference[];
}

export interface RefRow {
  ref_id: string;
  content_hash: string;
  file: string;
  symbol: string;
  kind: string;
  signature: string;
  start_line: number;
  end_line: number;
}

export interface ChunkRow {
  content_hash: string;
  text: string;
  dim: number;
  scale: number;
  qvec_b64: string;
}
