import os from 'os';
import { clampHnswParameters } from './hnsw';

export interface HNSWParameters {
  M: number;
  efConstruction: number;
  efSearch: number;
  quantizationBits: number;
}

export interface IndexingConfig {
  workerCount: number;
  batchSize: number;
  memoryBudgetMb: number;
  hnswConfig: HNSWParameters;
  /** Enable true multi-threading via worker_threads for CPU-bound operations. */
  useWorkerThreads: boolean;
  /** Minimum number of files before enabling worker threads (avoid startup overhead for small repos). */
  workerThreadsMinFiles: number;
}

export type ParseFailureFallback = 'skip' | 'line-chunk' | 'text-only';

export interface ErrorHandlingConfig {
  parseFailureFallback: ParseFailureFallback;
  largeFileThreshold: number;
  maxChunkSize: number;
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
}

export interface IndexingRuntimeConfig {
  indexing: IndexingConfig;
  errorHandling: ErrorHandlingConfig;
}

export function defaultIndexingConfig(): IndexingConfig {
  const cpuCount = Math.max(1, os.cpus()?.length ?? 1);
  return {
    workerCount: Math.max(1, cpuCount - 1),
    batchSize: 32,
    memoryBudgetMb: 4096,
    hnswConfig: clampHnswParameters({
      M: 16,
      efConstruction: 200,
      efSearch: 100,
      quantizationBits: 8,
    }),
    useWorkerThreads: true,
    workerThreadsMinFiles: 50,
  };
}

export function defaultErrorHandlingConfig(): ErrorHandlingConfig {
  return {
    parseFailureFallback: 'text-only',
    largeFileThreshold: 1_000_000,
    maxChunkSize: 10_000,
    memoryWarningThreshold: 0.8,
    memoryCriticalThreshold: 0.95,
  };
}

export function defaultIndexingRuntimeConfig(): IndexingRuntimeConfig {
  return {
    indexing: defaultIndexingConfig(),
    errorHandling: defaultErrorHandlingConfig(),
  };
}

export function mergeRuntimeConfig(overrides?: Partial<IndexingRuntimeConfig>): IndexingRuntimeConfig {
  const defaults = defaultIndexingRuntimeConfig();
  if (!overrides) return defaults;
  const merged: IndexingRuntimeConfig = {
    indexing: { ...defaults.indexing, ...overrides.indexing },
    errorHandling: { ...defaults.errorHandling, ...overrides.errorHandling },
  };
  merged.indexing.hnswConfig = clampHnswParameters(merged.indexing.hnswConfig);
  return merged;
}
