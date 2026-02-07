/**
 * Worker thread entry point for CPU-bound indexing operations.
 *
 * Each worker initialises its own SnapshotCodeParser (and therefore its own
 * tree-sitter Parser instance) so that parsing can happen truly in parallel
 * across multiple OS threads.
 *
 * Protocol:
 *   Main  → Worker : WorkerRequest  (file path + content + config)
 *   Worker → Main  : WorkerResponse (parsed symbols, refs, chunks, AST data)
 */
import { parentPort } from 'worker_threads';
import { SnapshotCodeParser } from '../parser/snapshotParser';
import { hashEmbedding } from '../embedding';
import { quantizeSQ8 } from '../sq8';
import { sha256Hex } from '../crypto';
import { ChunkRow, RefRow, SymbolInfo, AstReference } from '../types';

// ── Message types ──────────────────────────────────────────────────────────

export interface WorkerRequest {
  id: number;
  filePath: string;   // POSIX path relative to scan root
  content: string;
  dim: number;
  quantizationBits: number;
  /** Set of content hashes already indexed (serialised as array for transfer). */
  existingChunkHashes: string[];
}

export interface WorkerFileResult {
  lang: string;
  chunkRows: ChunkRow[];
  refRows: RefRow[];
  astFileEntry: [string, string, string];
  astSymbols: Array<[string, string, string, string, string, string, number, number]>;
  astContains: Array<[string, string]>;
  astExtendsName: Array<[string, string]>;
  astImplementsName: Array<[string, string]>;
  astRefsName: Array<[string, string, string, string, string, number, number]>;
  astCallsName: Array<[string, string, string, string, number, number]>;
  /** New content hashes added during this file processing (caller must merge). */
  newChunkHashes: string[];
}

export interface WorkerResponse {
  id: number;
  result: WorkerFileResult | null;
  error?: string;
}

// ── Shared helpers (duplicated from parallel.ts to avoid import issues in worker) ──

function inferIndexLang(file: string): string {
  if (file.endsWith('.md') || file.endsWith('.mdx')) return 'markdown';
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return 'yaml';
  if (file.endsWith('.java')) return 'java';
  if (file.endsWith('.c') || file.endsWith('.h')) return 'c';
  if (file.endsWith('.go')) return 'go';
  if (file.endsWith('.py')) return 'python';
  if (file.endsWith('.rs')) return 'rust';
  return 'ts';
}

function buildChunkText(file: string, symbol: { name: string; kind: string; signature: string }): string {
  return `file:${file}\nkind:${symbol.kind}\nname:${symbol.name}\nsignature:${symbol.signature}`;
}

// ── Worker logic ───────────────────────────────────────────────────────────

function processFile(
  parser: SnapshotCodeParser,
  req: WorkerRequest,
): WorkerFileResult {
  const { filePath, content, dim, quantizationBits, existingChunkHashes } = req;
  const lang = inferIndexLang(filePath);
  const existingSet = new Set(existingChunkHashes);

  // Parse with fallback: on failure, degrade gracefully to empty symbols/refs
  // instead of throwing, ensuring consistent behavior with single-threaded path
  let symbols: SymbolInfo[] = [];
  let fileRefs: AstReference[] = [];
  try {
    const parsed = parser.parseContent(filePath, content);
    symbols = parsed.symbols ?? [];
    fileRefs = parsed.refs ?? [];
  } catch {
    // On parse failure, fall back to empty symbol/ref set.
    // This mirrors single-threaded behavior where parse failures don't skip the file.
    symbols = [];
    fileRefs = [];
  }
  const fileId = sha256Hex(`file:${filePath}`);

  const chunkRows: ChunkRow[] = [];
  const refRows: RefRow[] = [];
  const astSymbols: WorkerFileResult['astSymbols'] = [];
  const astContains: WorkerFileResult['astContains'] = [];
  const astExtendsName: WorkerFileResult['astExtendsName'] = [];
  const astImplementsName: WorkerFileResult['astImplementsName'] = [];
  const astRefsName: WorkerFileResult['astRefsName'] = [];
  const astCallsName: WorkerFileResult['astCallsName'] = [];
  const newChunkHashes: string[] = [];

  const callableScopes: Array<{ refId: string; startLine: number; endLine: number }> = [];

  for (const s of symbols) {
    const text = buildChunkText(filePath, s);
    const contentHash = sha256Hex(text);
    const refId = sha256Hex(`${filePath}:${s.name}:${s.kind}:${s.startLine}:${s.endLine}:${contentHash}`);

    astSymbols.push([refId, filePath, lang, s.name, s.kind, s.signature, s.startLine, s.endLine]);
    if (s.kind === 'function' || s.kind === 'method') {
      callableScopes.push({ refId, startLine: s.startLine, endLine: s.endLine });
    }

    let parentId = fileId;
    if (s.container) {
      const cText = buildChunkText(filePath, s.container);
      const cHash = sha256Hex(cText);
      parentId = sha256Hex(`${filePath}:${s.container.name}:${s.container.kind}:${s.container.startLine}:${s.container.endLine}:${cHash}`);
    }
    astContains.push([parentId, refId]);

    if (s.kind === 'class') {
      if (s.extends) {
        for (const superName of s.extends) astExtendsName.push([refId, superName]);
      }
      if (s.implements) {
        for (const ifaceName of s.implements) astImplementsName.push([refId, ifaceName]);
      }
    }

    if (!existingSet.has(contentHash)) {
      const vec = hashEmbedding(text, { dim });
      const q = quantizeSQ8(vec, quantizationBits);
      chunkRows.push({
        content_hash: contentHash,
        text,
        dim: q.dim,
        scale: q.scale,
        qvec_b64: Buffer.from(q.q).toString('base64'),
      });
      existingSet.add(contentHash);
      newChunkHashes.push(contentHash);
    }

    refRows.push({
      ref_id: refId,
      content_hash: contentHash,
      file: filePath,
      symbol: s.name,
      kind: s.kind,
      signature: s.signature,
      start_line: s.startLine,
      end_line: s.endLine,
    });
  }

  const pickScope = (line: number): string => {
    let best: { refId: string; span: number } | null = null;
    for (const scope of callableScopes) {
      if (line < scope.startLine || line > scope.endLine) continue;
      const span = scope.endLine - scope.startLine;
      if (!best || span < best.span) best = { refId: scope.refId, span };
    }
    return best ? best.refId : fileId;
  };

  for (const r of fileRefs) {
    const fromId = pickScope(r.line);
    astRefsName.push([fromId, lang, r.name, r.refKind, filePath, r.line, r.column]);
    if (r.refKind === 'call' || r.refKind === 'new') {
      astCallsName.push([fromId, lang, r.name, filePath, r.line, r.column]);
    }
  }

  return {
    lang,
    chunkRows,
    refRows,
    astFileEntry: [fileId, filePath, lang],
    astSymbols,
    astContains,
    astExtendsName,
    astImplementsName,
    astRefsName,
    astCallsName,
    newChunkHashes,
  };
}

// ── Bootstrap (only runs when loaded as a worker thread) ───────────────────

if (parentPort) {
  const parser = new SnapshotCodeParser();

  parentPort.on('message', (msg: WorkerRequest) => {
    try {
      const result = processFile(parser, msg);
      const response: WorkerResponse = { id: msg.id, result };
      parentPort!.postMessage(response);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      const response: WorkerResponse = { id: msg.id, result: null, error };
      parentPort!.postMessage(response);
    }
  });
}
