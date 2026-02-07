/**
 * Worker thread pool for CPU-bound indexing operations.
 *
 * Manages a fixed pool of worker_threads, distributes file processing tasks,
 * and collects results. Supports graceful shutdown and automatic fallback
 * when worker_threads cannot be initialised.
 */
import path from 'path';
import { Worker } from 'worker_threads';
import type { WorkerRequest, WorkerResponse, WorkerFileResult } from './worker';

// ── Public types ───────────────────────────────────────────────────────────

export interface PoolOptions {
  /** Number of worker threads to spawn. */
  poolSize: number;
  /** Absolute path to the compiled worker entry JS file. When omitted the
   *  pool resolves it relative to this module (works for both src/ and dist/). */
  workerPath?: string;
}

export interface FileTask {
  filePath: string;
  content: string;
  dim: number;
  quantizationBits: number;
  existingChunkHashes: string[];
}

// ── Pool implementation ────────────────────────────────────────────────────

export class IndexingWorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private pendingTasks: Array<{
    task: FileTask;
    resolve: (result: WorkerFileResult | null) => void;
    reject: (err: Error) => void;
  }> = [];
  private nextId = 0;
  private resolvers = new Map<number, {
    resolve: (result: WorkerFileResult | null) => void;
    reject: (err: Error) => void;
  }>();
  private workerTaskIds = new Map<Worker, number>();
  private closed = false;

  private constructor(private readonly poolSize: number) {}

  /**
   * Create and start a pool of worker threads.
   * Returns `null` if worker_threads cannot be initialised (caller should
   * fall back to single-threaded processing).
   */
  static create(options: PoolOptions): IndexingWorkerPool | null {
    try {
      const pool = new IndexingWorkerPool(options.poolSize);
      const workerPath = options.workerPath ?? resolveWorkerPath();
      for (let i = 0; i < options.poolSize; i++) {
        const w = new Worker(workerPath);
        w.on('message', (msg: WorkerResponse) => pool.handleMessage(w, msg));
        w.on('error', (err: Error) => pool.handleWorkerError(w, err));
        pool.workers.push(w);
        pool.idleWorkers.push(w);
      }
      return pool;
    } catch {
      // worker_threads unavailable or worker file not found — graceful fallback
      return null;
    }
  }

  /** Submit a file for processing. Returns the result or null on error. */
  async processFile(task: FileTask): Promise<WorkerFileResult | null> {
    if (this.closed) throw new Error('Pool is closed');

    return new Promise<WorkerFileResult | null>((resolve, reject) => {
      const idleWorker = this.idleWorkers.pop();
      if (idleWorker) {
        this.dispatch(idleWorker, task, resolve, reject);
      } else {
        // All workers busy — queue the task
        this.pendingTasks.push({ task, resolve, reject });
      }
    });
  }

  /** Gracefully terminate all worker threads. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Reject any queued tasks
    for (const pending of this.pendingTasks) {
      pending.reject(new Error('Pool closed before task could be dispatched'));
    }
    this.pendingTasks = [];
    // Reject all in-flight tasks before terminating workers
    for (const [id, entry] of this.resolvers.entries()) {
      entry.reject(new Error('Pool closed while task was in progress'));
      this.resolvers.delete(id);
    }
    this.workerTaskIds.clear();
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idleWorkers = [];
  }

  get size(): number {
    return this.workers.length;
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private dispatch(
    worker: Worker,
    task: FileTask,
    resolve: (result: WorkerFileResult | null) => void,
    reject: (err: Error) => void,
  ): void {
    const id = this.nextId++;
    this.resolvers.set(id, { resolve, reject });
    this.workerTaskIds.set(worker, id);
    const msg: WorkerRequest = {
      id,
      filePath: task.filePath,
      content: task.content,
      dim: task.dim,
      quantizationBits: task.quantizationBits,
      existingChunkHashes: task.existingChunkHashes,
    };
    worker.postMessage(msg);
  }

  private handleMessage(worker: Worker, msg: WorkerResponse): void {
    this.workerTaskIds.delete(worker);
    const entry = this.resolvers.get(msg.id);
    if (entry) {
      this.resolvers.delete(msg.id);
      if (msg.error) {
        // Resolve with null on worker-side errors (non-fatal, file is skipped)
        entry.resolve(null);
      } else {
        entry.resolve(msg.result);
      }
    }

    // Worker is now idle — pick up next queued task or return to idle pool
    const next = this.pendingTasks.shift();
    if (next) {
      this.dispatch(worker, next.task, next.resolve, next.reject);
    } else {
      this.idleWorkers.push(worker);
    }
  }

  private handleWorkerError(worker: Worker, err: Error): void {
    const idx = this.workers.indexOf(worker);
    if (idx !== -1) {
      this.workers.splice(idx, 1);
    }
    const idleIdx = this.idleWorkers.indexOf(worker);
    if (idleIdx !== -1) {
      this.idleWorkers.splice(idleIdx, 1);
    }

    const taskId = this.workerTaskIds.get(worker);
    this.workerTaskIds.delete(worker);
    if (taskId !== undefined) {
      const entry = this.resolvers.get(taskId);
      if (entry) {
        entry.reject(err);
        this.resolvers.delete(taskId);
      }
    }
  }
}

export type { WorkerFileResult };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Resolve the compiled worker.js path relative to this module. */
function resolveWorkerPath(): string {
  // In compiled output (dist/), both pool.js and worker.js sit in the same directory.
  // In ts-node / tsx dev, __filename points to the .ts source which also works.
  return path.join(path.dirname(__filename), 'worker.js');
}
