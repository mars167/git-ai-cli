export interface DiffFileChange {
  path: string;
  change_type: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface DiffInsight {
  touched_files: DiffFileChange[];
  touched_symbols: string[];
  signature_changes: string[];
  import_changes: string[];
  config_changes: string[];
  added_literals: string[];
  removed_literals: string[];
}
