import path from 'path';
import type { ContextBundle, EvidenceBundle } from '../domain/context';
import type { DiffTaskRequest, TaskRequest, TaskResult } from '../domain/tasks';
import type { LexicalSearchRequest, LexicalSearchResponse } from './lexical/types';
import { lexicalSearch } from './lexical/lexicalSearch';
import {
  buildImplementationContext,
  buildImpactContext,
  buildReviewContextForDiff,
  findExtensionPoints as buildExtensionPointsContext,
  findTestsForTask,
} from '../tasks';

export interface CodeContextEngineOptions {
  repoRoot: string;
}

export interface CodeContextEngine {
  repoRoot: string;
  search: {
    lexical(request: LexicalSearchRequest): Promise<LexicalSearchResponse>;
  };
  tasks: {
    implementationContext(request: TaskRequest): Promise<ContextBundle>;
    findTests(request: TaskRequest): Promise<EvidenceBundle>;
    findImpact(request: TaskRequest): Promise<ContextBundle>;
    findExtensionPoints(request: TaskRequest): Promise<ContextBundle>;
    reviewContextForDiff(request: DiffTaskRequest): Promise<TaskResult>;
  };
}

export function createCodeContextEngine(options: CodeContextEngineOptions): CodeContextEngine {
  const repoRoot = path.resolve(options.repoRoot);

  return {
    repoRoot,
    search: {
      lexical(request: LexicalSearchRequest) {
        return lexicalSearch(repoRoot, request);
      },
    },
    tasks: {
      implementationContext(request: TaskRequest) {
        return buildImplementationContext(repoRoot, request);
      },
      findTests(request: TaskRequest) {
        return findTestsForTask(repoRoot, request);
      },
      findImpact(request: TaskRequest) {
        return buildImpactContext(repoRoot, request);
      },
      findExtensionPoints(request: TaskRequest) {
        return buildExtensionPointsContext(repoRoot, request);
      },
      reviewContextForDiff(request: DiffTaskRequest) {
        return buildReviewContextForDiff(repoRoot, request);
      },
    },
  };
}
