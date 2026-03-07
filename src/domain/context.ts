import type { SearchMatch } from './search';

export interface EvidenceBundle {
  task: string;
  summary: string;
  evidence: SearchMatch[];
  related_paths?: string[];
  diagnostics?: string[];
}

export interface ContextSection {
  title: string;
  summary: string;
  evidence: SearchMatch[];
}

export interface ContextBundle {
  task: string;
  summary: string;
  sections: ContextSection[];
  diagnostics?: string[];
}
