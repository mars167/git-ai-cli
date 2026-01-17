export interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'method';
  startLine: number;
  endLine: number;
  signature: string;
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
