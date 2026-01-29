export type DsrRiskLevel = 'low' | 'medium' | 'high';

export type DsrOperationKind = 'add' | 'modify' | 'delete' | 'rename';

export interface DsrSymbolDescriptor {
  file: string;
  kind: string;
  name: string;
  signature: string;
  start_line: number;
  end_line: number;
  container?: {
    kind: string;
    name: string;
    signature: string;
  };
}

export interface DsrAstOperation {
  op: DsrOperationKind;
  symbol: DsrSymbolDescriptor;
  previous?: {
    name: string;
    signature: string;
  };
  content_hash: string;
}

export type DsrSemanticChangeType = 'no-op' | 'additive' | 'modification' | 'deletion' | 'rename' | 'mixed';

export interface DeterministicSemanticRecord {
  commit_hash: string;
  affected_symbols: DsrSymbolDescriptor[];
  ast_operations: DsrAstOperation[];
  semantic_change_type: DsrSemanticChangeType;
  summary?: string;
  risk_level?: DsrRiskLevel;
}
