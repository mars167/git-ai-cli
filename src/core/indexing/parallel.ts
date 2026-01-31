import fs from 'fs-extra';
import path from 'path';
import { SnapshotCodeParser } from '../dsr/snapshotParser';
import { AstReference, ChunkRow, RefRow, SymbolInfo } from '../types';
import { IndexLang } from '../lancedb';
import { hashEmbedding } from '../embedding';
import { quantizeSQ8 } from '../sq8';
import { sha256Hex } from '../crypto';
import { toPosixPath } from '../paths';
import { ErrorHandlingConfig, IndexingConfig } from './config';
import { MemoryMonitor } from './monitor';

export interface ParallelIndexOptions {
  repoRoot: string;
  scanRoot: string;
  dim: number;
  files: string[];
  indexing: IndexingConfig;
  errorHandling: ErrorHandlingConfig;
  existingChunkIdsByLang: Partial<Record<IndexLang, Set<string>>>;
  onProgress?: (p: { totalFiles: number; processedFiles: number; currentFile?: string }) => void;
  onThrottle?: (snapshot: { rssMb: number; usageRatio: number }) => void;
}

export interface ParallelIndexResult {
  chunkRowsByLang: Partial<Record<IndexLang, ChunkRow[]>>;
  refRowsByLang: Partial<Record<IndexLang, RefRow[]>>;
  astFiles: Array<[string, string, string]>;
  astSymbols: Array<[string, string, string, string, string, string, number, number]>;
  astContains: Array<[string, string]>;
  astExtendsName: Array<[string, string]>;
  astImplementsName: Array<[string, string]>;
  astRefsName: Array<[string, string, string, string, string, number, number]>;
  astCallsName: Array<[string, string, string, string, number, number]>;
}

export async function runParallelIndexing(options: ParallelIndexOptions): Promise<ParallelIndexResult> {
  const parser = new SnapshotCodeParser();
  const monitor = MemoryMonitor.fromErrorConfig(options.errorHandling, options.indexing.memoryBudgetMb);
  const pendingFiles = options.files.slice();
  const totalFiles = pendingFiles.length;
  let processedFiles = 0;
  let workerCount = Math.max(1, options.indexing.workerCount);
  const batchSize = Math.max(1, options.indexing.batchSize);

  const state: ParallelIndexResult = {
    chunkRowsByLang: {},
    refRowsByLang: {},
    astFiles: [],
    astSymbols: [],
    astContains: [],
    astExtendsName: [],
    astImplementsName: [],
    astRefsName: [],
    astCallsName: [],
  };

  const runBatch = async (batchFiles: string[]): Promise<void> => {
    const queue = batchFiles.slice();
    const active = new Set<Promise<void>>();
    const scheduleNext = (): void => {
      while (active.size < workerCount && queue.length > 0) {
        const file = queue.shift();
        if (!file) break;
        const task = processFile(file).catch(() => undefined).then(() => {
          active.delete(task);
        });
        active.add(task);
      }
    };

    scheduleNext();
    while (active.size > 0) {
      await Promise.race(active);
      scheduleNext();
    }
  };

  const processFile = async (file: string): Promise<void> => {
    processedFiles++;
    const filePosix = toPosixPath(file);
    options.onProgress?.({ totalFiles, processedFiles, currentFile: filePosix });

    await monitor.throttleIfNeeded();

    const lang = inferIndexLang(filePosix);
    if (!state.chunkRowsByLang[lang]) state.chunkRowsByLang[lang] = [];
    if (!state.refRowsByLang[lang]) state.refRowsByLang[lang] = [];
    if (!options.existingChunkIdsByLang[lang]) options.existingChunkIdsByLang[lang] = new Set<string>();

    const fullPath = path.join(options.scanRoot, file);
    const stat = await safeStat(fullPath);
    if (!stat?.isFile()) return;

    const content = await readFileWithGate(fullPath, options.errorHandling);
    if (content == null) return;

    const parsed = parseWithFallback(parser, content, fullPath, options.errorHandling);
    const symbols = parsed.symbols;
    const fileRefs = parsed.refs;
    const fileId = sha256Hex(`file:${filePosix}`);
    state.astFiles.push([fileId, filePosix, lang]);

    const callableScopes: Array<{ refId: string; startLine: number; endLine: number }> = [];
    for (const s of symbols) {
      const text = buildChunkText(filePosix, s);
      const contentHash = sha256Hex(text);
      const refId = sha256Hex(`${filePosix}:${s.name}:${s.kind}:${s.startLine}:${s.endLine}:${contentHash}`);

      state.astSymbols.push([refId, filePosix, lang, s.name, s.kind, s.signature, s.startLine, s.endLine]);
      if (s.kind === 'function' || s.kind === 'method') {
        callableScopes.push({ refId, startLine: s.startLine, endLine: s.endLine });
      }
      let parentId = fileId;
      if (s.container) {
        const cText = buildChunkText(filePosix, s.container);
        const cHash = sha256Hex(cText);
        parentId = sha256Hex(`${filePosix}:${s.container.name}:${s.container.kind}:${s.container.startLine}:${s.container.endLine}:${cHash}`);
      }
      state.astContains.push([parentId, refId]);

      if (s.kind === 'class') {
        if (s.extends) {
          for (const superName of s.extends) state.astExtendsName.push([refId, superName]);
        }
        if (s.implements) {
          for (const ifaceName of s.implements) state.astImplementsName.push([refId, ifaceName]);
        }
      }

      const existingChunkIds = options.existingChunkIdsByLang[lang]!;
      if (!existingChunkIds.has(contentHash)) {
        const vec = hashEmbedding(text, { dim: options.dim });
        const q = quantizeSQ8(vec, options.indexing.hnswConfig.quantizationBits);
        state.chunkRowsByLang[lang]!.push({
          content_hash: contentHash,
          text,
          dim: q.dim,
          scale: q.scale,
          qvec_b64: Buffer.from(q.q).toString('base64'),
        });
        existingChunkIds.add(contentHash);
      }

      state.refRowsByLang[lang]!.push({
        ref_id: refId,
        content_hash: contentHash,
        file: filePosix,
        symbol: s.name,
        kind: s.kind,
        signature: s.signature,
        start_line: s.startLine,
        end_line: s.endLine,
      });
    }

    const pickScope = (line: number): string => {
      let best: { refId: string; span: number } | null = null;
      for (const s of callableScopes) {
        if (line < s.startLine || line > s.endLine) continue;
        const span = s.endLine - s.startLine;
        if (!best || span < best.span) best = { refId: s.refId, span };
      }
      return best ? best.refId : fileId;
    };

    for (const r of fileRefs) {
      const fromId = pickScope(r.line);
      state.astRefsName.push([fromId, lang, r.name, r.refKind, filePosix, r.line, r.column]);
      if (r.refKind === 'call' || r.refKind === 'new') {
        state.astCallsName.push([fromId, lang, r.name, filePosix, r.line, r.column]);
      }
    }

    const snapshot = monitor.sample();
    workerCount = monitor.adaptWorkerCount(workerCount);
    if (snapshot.critical && workerCount <= 1) {
      options.onThrottle?.({ rssMb: snapshot.rssMb, usageRatio: snapshot.usageRatio });
      await monitor.throttleIfNeeded();
    }
  };

  options.onProgress?.({ totalFiles, processedFiles: 0 });

  while (pendingFiles.length > 0) {
    const batch = pendingFiles.splice(0, batchSize);
    await runBatch(batch);
  }

  return state;
}

async function safeStat(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function readFileWithGate(filePath: string, config: ErrorHandlingConfig): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > config.largeFileThreshold) {
      return readLargeFile(filePath, config.maxChunkSize);
    }
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function readLargeFile(filePath: string, maxChars: number): Promise<string> {
  const buf = await fs.readFile(filePath, 'utf-8');
  if (buf.length <= maxChars) return buf;
  return buf.slice(0, maxChars);
}

function parseWithFallback(parser: SnapshotCodeParser, content: string, filePath: string, config: ErrorHandlingConfig): { symbols: SymbolInfo[]; refs: AstReference[] } {
  try {
    return parser.parseContent(filePath, content);
  } catch {
    return fallbackParse(content, filePath, config);
  }
}

function fallbackParse(content: string, filePath: string, config: ErrorHandlingConfig): { symbols: SymbolInfo[]; refs: AstReference[] } {
  if (config.parseFailureFallback === 'skip') return { symbols: [], refs: [] };
  if (config.parseFailureFallback === 'text-only') {
    return { symbols: buildTextOnlySymbols(content, filePath), refs: [] };
  }
  if (config.parseFailureFallback === 'line-chunk') {
    return { symbols: buildLineChunkSymbols(content, filePath, config.maxChunkSize), refs: [] };
  }
  return { symbols: [], refs: [] };
}

function buildTextOnlySymbols(content: string, filePath: string): SymbolInfo[] {
  const lines = content.split(/\r?\n/);
  const name = path.basename(filePath);
  return [{ name, kind: 'document', startLine: 1, endLine: Math.max(1, lines.length), signature: name }];
}

function buildLineChunkSymbols(content: string, filePath: string, maxChunkSize: number): SymbolInfo[] {
  const lines = content.split(/\r?\n/);
  const chunkSize = Math.max(50, Math.min(Math.floor(maxChunkSize / 10), 500));
  const out: SymbolInfo[] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    const start = i + 1;
    const end = Math.min(lines.length, i + chunkSize);
    const name = `${path.basename(filePath)}:${start}-${end}`;
    out.push({ name, kind: 'document', startLine: start, endLine: end, signature: name });
  }
  if (out.length === 0) {
    const name = path.basename(filePath);
    out.push({ name, kind: 'document', startLine: 1, endLine: Math.max(1, lines.length), signature: name });
  }
  return out;
}

function buildChunkText(file: string, symbol: { name: string; kind: string; signature: string }): string {
  return `file:${file}\nkind:${symbol.kind}\nname:${symbol.name}\nsignature:${symbol.signature}`;
}

function inferIndexLang(file: string): IndexLang {
  if (file.endsWith('.md') || file.endsWith('.mdx')) return 'markdown';
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return 'yaml';
  if (file.endsWith('.java')) return 'java';
  if (file.endsWith('.c') || file.endsWith('.h')) return 'c';
  if (file.endsWith('.go')) return 'go';
  if (file.endsWith('.py')) return 'python';
  if (file.endsWith('.rs')) return 'rust';
  return 'ts';
}
