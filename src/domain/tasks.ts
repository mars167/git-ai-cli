import type { ContextBundle, EvidenceBundle } from './context';
import type { DiffInsight } from './diff';

export interface TaskRequest {
  task: string;
  query?: string;
  pathHints?: string[];
  symbolHints?: string[];
}

export interface DiffTaskRequest extends TaskRequest {
  diffText: string;
}

export interface TaskResult {
  bundle?: ContextBundle | EvidenceBundle;
  diff?: DiffInsight;
  diagnostics?: string[];
}
