import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';
import { sha256Hex } from './crypto';
import { defaultDbDir, IndexLang, openTablesByLang, ALL_INDEX_LANGS } from './lancedb';
import { hashEmbedding } from './embedding';
import { quantizeSQ8 } from './sq8';
import { toPosixPath } from './paths';
import { removeFileFromAstGraph, writeAstGraphToCozo } from './astGraph';
import { ChunkRow, RefRow } from './types';
import { GitDiffPathChange } from './gitDiff';
import { SnapshotCodeParser } from './parser/snapshotParser';
import { getCurrentCommitHash } from './git';
import { IndexingWorkerPool } from './indexing/pool';
import type { WorkerFileResult } from './indexing/worker';
import { defaultIndexingConfig, IndexingConfig } from './indexing/config';

export interface IncrementalIndexOptions {
  repoRoot: string;
  scanRoot?: string;
  dim: number;
  source: 'worktree' | 'staged';
  changes: GitDiffPathChange[];
  onProgress?: (p: { totalFiles: number; processedFiles: number; currentFile?: string }) => void;
  indexingConfig?: Partial<IndexingConfig>;
}

async function loadIgnorePatterns(repoRoot: string, fileName: string): Promise<string[]> {
  const ignorePath = path.join(repoRoot, fileName);
  if (!await fs.pathExists(ignorePath)) return [];
  const raw = await fs.readFile(ignorePath, 'utf-8');
  return raw
    .split('\n')
    .map(l => l.trim())
    .map((l) => {
      if (l.length === 0) return null;
      if (l.startsWith('#')) return null;
      if (l.startsWith('!')) return null;
      const withoutLeadingSlash = l.startsWith('/') ? l.slice(1) : l;
      if (withoutLeadingSlash.endsWith('/')) return `${withoutLeadingSlash}**`;
      return withoutLeadingSlash;
    })
    .filter((l): l is string => Boolean(l));
}

async function loadIncludePatterns(repoRoot: string): Promise<string[]> {
  const includePath = path.join(repoRoot, '.git-ai', 'include.txt');
  if (!await fs.pathExists(includePath)) return [];
  const raw = await fs.readFile(includePath, 'utf-8');
  return raw
    .split('\n')
    .map(l => l.trim())
    .map((l) => {
      if (l.length === 0) return null;
      if (l.startsWith('#')) return null;
      const withoutLeadingSlash = l.startsWith('/') ? l.slice(1) : l;
      if (withoutLeadingSlash.endsWith('/')) return `${withoutLeadingSlash}**`;
      return withoutLeadingSlash;
    })
    .filter((l): l is string => Boolean(l));
}

// Cache for compiled regex patterns
const patternCache = new Map<string, RegExp>();

function matchesPattern(file: string, pattern: string): boolean {
  // Check cache first
  let regex = patternCache.get(pattern);
  if (!regex) {
    // Convert glob pattern to regex by escaping special regex chars first, then handling glob patterns
    const regexPattern = pattern
      // Escape regex special characters except the ones we use for glob
      .replace(/[\\^$+{}[\]|()]/g, '\\$&')
      // Handle glob patterns
      .replace(/\*\*/g, '___GLOBSTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___GLOBSTAR___/g, '.*')
      .replace(/\?/g, '[^/]')
      // Escape dots for literal matching
      .replace(/\./g, '\\.');
    regex = new RegExp(`^${regexPattern}$`);
    patternCache.set(pattern, regex);
  }
  return regex.test(file);
}

function shouldIndexFile(file: string, aiIgnore: string[], gitIgnore: string[], includePatterns: string[]): boolean {
  // Check if file matches aiIgnore patterns (highest priority exclusion)
  if (aiIgnore.some(pattern => matchesPattern(file, pattern))) {
    return false;
  }

  // Check if file matches include patterns (overrides gitIgnore)
  if (includePatterns.some(pattern => matchesPattern(file, pattern))) {
    return true;
  }

  // Check if file matches gitIgnore patterns
  if (gitIgnore.some(pattern => matchesPattern(file, pattern))) {
    return false;
  }

  return true;
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

function isIndexableFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|java|c|h|go|py|rs|md|mdx|yml|yaml)$/i.test(file);
}

function escapeQuotes(s: string): string {
  return s.replace(/'/g, "''");
}

async function readStagedFile(repoRoot: string, filePosix: string): Promise<string | null> {
  const git = simpleGit(repoRoot);
  try {
    return await git.raw(['show', `:${filePosix}`]);
  } catch {
    return null;
  }
}

async function readWorktreeFile(scanRoot: string, filePosix: string): Promise<string | null> {
  const abs = path.join(scanRoot, filePosix);
  try {
    return await fs.readFile(abs, 'utf-8');
  } catch {
    return null;
  }
}

async function deleteRefsForFile(byLang: Partial<Record<IndexLang, { refs: any }>>, filePosix: string): Promise<void> {
  const safe = escapeQuotes(filePosix);
  const pred = `file == '${safe}'`;
  const langs = Object.keys(byLang) as IndexLang[];
  for (const lang of langs) {
    const t = byLang[lang];
    if (!t) continue;
    if (typeof t.refs.delete === 'function') {
      await t.refs.delete(pred);
    }
  }
}

export class IncrementalIndexerV2 {
  private repoRoot: string;
  private scanRoot: string;
  private dim: number;
  private source: IncrementalIndexOptions['source'];
  private changes: GitDiffPathChange[];
  private onProgress?: IncrementalIndexOptions['onProgress'];
  private indexingConfig: IndexingConfig;
  private parser: SnapshotCodeParser;

  constructor(options: IncrementalIndexOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.scanRoot = path.resolve(options.scanRoot ?? options.repoRoot);
    this.dim = options.dim;
    this.source = options.source;
    this.changes = options.changes;
    this.onProgress = options.onProgress;
    this.indexingConfig = { ...defaultIndexingConfig(), ...options.indexingConfig };
    this.parser = new SnapshotCodeParser();
  }

  async run(): Promise<{ processed: number; addedByLang: Record<string, { chunksAdded: number; refsAdded: number }> }> {
    const gitAiDir = path.join(this.repoRoot, '.git-ai');
    await fs.ensureDir(gitAiDir);
    const dbDir = defaultDbDir(this.repoRoot);

    // Load ignore and include patterns
    const aiIgnore = await loadIgnorePatterns(this.repoRoot, '.aiignore');
    const gitIgnore = await loadIgnorePatterns(this.repoRoot, '.gitignore');
    const includePatterns = await loadIncludePatterns(this.repoRoot);

    const { byLang } = await openTablesByLang({
      dbDir,
      dim: this.dim,
      mode: 'create_if_missing',
      languages: ALL_INDEX_LANGS,
    });

    const chunkRowsByLang: Partial<Record<IndexLang, any[]>> = {};
    const refRowsByLang: Partial<Record<IndexLang, any[]>> = {};
    const candidateChunksByLang: Partial<Record<IndexLang, Map<string, string>>> = {};
    const astFiles: Array<[string, string, string]> = [];
    const astSymbols: Array<[string, string, string, string, string, string, number, number]> = [];
    const astContains: Array<[string, string]> = [];
    const astExtendsName: Array<[string, string]> = [];
    const astImplementsName: Array<[string, string]> = [];
    const astRefsName: Array<[string, string, string, string, string, number, number]> = [];
    const astCallsName: Array<[string, string, string, string, number, number]> = [];

    const neededHashByLang: Partial<Record<IndexLang, Set<string>>> = {};

    const totalFiles = this.changes.length;
    this.onProgress?.({ totalFiles, processedFiles: 0 });

    // Phase A: Sequential deletions — DB operations must be serialized for safety
    const filesToIndex: Array<{ filePosix: string; ch: GitDiffPathChange }> = [];
    for (const ch of this.changes) {
      const filePosix = toPosixPath(ch.path);

      if (ch.status === 'R' && ch.oldPath) {
        const oldFile = toPosixPath(ch.oldPath);
        await deleteRefsForFile(byLang as any, oldFile);
        await removeFileFromAstGraph(this.repoRoot, oldFile);
      }
      if (ch.status === 'D') {
        await deleteRefsForFile(byLang as any, filePosix);
        await removeFileFromAstGraph(this.repoRoot, filePosix);
        continue;
      }

      await deleteRefsForFile(byLang as any, filePosix);
      await removeFileFromAstGraph(this.repoRoot, filePosix);

      if (!isIndexableFile(filePosix)) continue;
      if (!shouldIndexFile(filePosix, aiIgnore, gitIgnore, includePatterns)) continue;

      filesToIndex.push({ filePosix, ch });
    }

    // Phase B: Process files — use worker threads when enough files, else single-threaded
    const useWorkerThreads = this.indexingConfig.useWorkerThreads && filesToIndex.length >= this.indexingConfig.workerThreadsMinFiles;
    let pool: IndexingWorkerPool | null = null;

    if (useWorkerThreads) {
      const poolSize = Math.max(1, Math.min(filesToIndex.length, (os.cpus()?.length ?? 2) - 1));
      pool = IndexingWorkerPool.create({ poolSize });
    }

    try {
      if (pool) {
        // ── Worker-thread path: main thread reads, workers parse + embed ──
        const existingChunkIdsByLang: Partial<Record<IndexLang, Set<string>>> = {};
        for (const lang of ALL_INDEX_LANGS) {
          const t = (byLang as any)[lang];
          if (!t) continue;
          const existing = new Set<string>();
          try {
            const rows = await t.chunks.query().select(['content_hash']).toArray();
            for (const row of rows as any[]) {
              const id = String(row.content_hash ?? '');
              if (id) existing.add(id);
            }
          } catch {
            // Table might not exist yet
          }
          existingChunkIdsByLang[lang] = existing;
        }

        await this.processFilesWithPool(pool, filesToIndex, {
          chunkRowsByLang, refRowsByLang,
          astFiles, astSymbols, astContains, astExtendsName, astImplementsName, astRefsName, astCallsName,
          totalFiles,
        }, existingChunkIdsByLang);
      } else {
        // ── Single-threaded fallback ──
        await this.processFilesSingleThreaded(filesToIndex, {
          chunkRowsByLang, refRowsByLang, candidateChunksByLang, neededHashByLang,
          astFiles, astSymbols, astContains, astExtendsName, astImplementsName, astRefsName, astCallsName,
          totalFiles,
        });

        // Check existing chunks and compute embeddings (single-threaded only)
        const existingChunkIdsByLang: Partial<Record<IndexLang, Set<string>>> = {};
        for (const lang of Object.keys(neededHashByLang) as IndexLang[]) {
          const t = (byLang as any)[lang];
          if (!t) continue;
          const needed = Array.from(neededHashByLang[lang] ?? []);
          const existing = new Set<string>();
          for (let i = 0; i < needed.length; i += 400) {
            const chunk = needed.slice(i, i + 400);
            if (chunk.length === 0) continue;
            const pred = `content_hash IN (${chunk.map((h: string) => `'${escapeQuotes(h)}'`).join(',')})`;
            const rows = await t.chunks.query().where(pred).select(['content_hash']).limit(chunk.length).toArray();
            for (const row of rows as any[]) {
              const id = String(row.content_hash ?? '');
              if (id) existing.add(id);
            }
          }
          existingChunkIdsByLang[lang] = existing;
        }

        for (const lang of Object.keys(candidateChunksByLang) as IndexLang[]) {
          const t = (byLang as any)[lang];
          if (!t) continue;
          const existing = existingChunkIdsByLang[lang] ?? new Set<string>();
          const chunkRows: ChunkRow[] = [];
          const candidates = candidateChunksByLang[lang]!;
          for (const [contentHash, text] of candidates.entries()) {
            if (!contentHash || !text) continue;
            if (existing.has(contentHash)) continue;
            const vec = hashEmbedding(text, { dim: this.dim });
            const q = quantizeSQ8(vec);
            chunkRows.push({
              content_hash: contentHash,
              text,
              dim: q.dim,
              scale: q.scale,
              qvec_b64: Buffer.from(q.q).toString('base64'),
            });
            existing.add(contentHash);
          }
          chunkRowsByLang[lang] = chunkRows as any[];
        }
      }
    } finally {
      if (pool) await pool.close();
    }

    const addedByLang: Record<string, { chunksAdded: number; refsAdded: number }> = {};
    // Write to LanceDB tables in parallel — each language table is independent
    await Promise.all(ALL_INDEX_LANGS.map(async (lang) => {
      const t = byLang[lang];
      if (!t) return;
      const chunkRows = chunkRowsByLang[lang] ?? [];
      const refRows = refRowsByLang[lang] ?? [];
      if (chunkRows.length > 0) await t.chunks.add(chunkRows);
      if (refRows.length > 0) await t.refs.add(refRows);
      if (chunkRows.length > 0 || refRows.length > 0) {
        addedByLang[lang] = { chunksAdded: chunkRows.length, refsAdded: refRows.length };
      }
    }));

    const astGraph = await writeAstGraphToCozo(this.repoRoot, {
      files: astFiles,
      symbols: astSymbols,
      contains: astContains,
      extends_name: astExtendsName,
      implements_name: astImplementsName,
      refs_name: astRefsName,
      calls_name: astCallsName,
    }, { mode: 'put' });

    const metaPath = path.join(gitAiDir, 'meta.json');
    const prev = await fs.readJSON(metaPath).catch(() => null);
    const commitHash = await getCurrentCommitHash(this.repoRoot);
    const meta = {
      ...(prev && typeof prev === 'object' ? prev : {}),
      version: '2.1',
      index_schema_version: 3,
      dim: this.dim,
      dbDir: path.relative(this.repoRoot, dbDir),
      scanRoot: path.relative(this.repoRoot, this.scanRoot),
      languages: ALL_INDEX_LANGS,
      byLang: addedByLang,
      ...(commitHash ? { commit_hash: commitHash } : {}),
      astGraph: astGraph.enabled
        ? {
          backend: 'cozo',
          engine: astGraph.engine,
          dbPath: astGraph.dbPath ? path.relative(this.repoRoot, astGraph.dbPath) : undefined,
          counts: astGraph.counts,
        }
        : {
          backend: 'cozo',
          enabled: false,
          skippedReason: astGraph.skippedReason,
        },
    };
    await fs.writeJSON(metaPath, meta, { spaces: 2 });

    return { processed: this.changes.length, addedByLang };
  }

  // ── Worker-thread processing ──────────────────────────────────────────

  private async processFilesWithPool(
    pool: IndexingWorkerPool,
    filesToIndex: Array<{ filePosix: string; ch: GitDiffPathChange }>,
    state: {
      chunkRowsByLang: Partial<Record<IndexLang, any[]>>;
      refRowsByLang: Partial<Record<IndexLang, any[]>>;
      astFiles: Array<[string, string, string]>;
      astSymbols: Array<[string, string, string, string, string, string, number, number]>;
      astContains: Array<[string, string]>;
      astExtendsName: Array<[string, string]>;
      astImplementsName: Array<[string, string]>;
      astRefsName: Array<[string, string, string, string, string, number, number]>;
      astCallsName: Array<[string, string, string, string, number, number]>;
      totalFiles: number;
    },
    existingChunkIdsByLang: Partial<Record<IndexLang, Set<string>>>,
  ): Promise<void> {
    let processed = 0;
    const seenChunkHashes = new Set<string>();

    const mergeResult = (wr: WorkerFileResult): void => {
      const lang = wr.lang as IndexLang;
      if (!state.chunkRowsByLang[lang]) state.chunkRowsByLang[lang] = [];
      if (!state.refRowsByLang[lang]) state.refRowsByLang[lang] = [];

      for (const chunk of wr.chunkRows) {
        if (!seenChunkHashes.has(chunk.content_hash)) {
          state.chunkRowsByLang[lang]!.push(chunk);
          seenChunkHashes.add(chunk.content_hash);
        }
      }

      state.refRowsByLang[lang]!.push(...wr.refRows);
      state.astFiles.push(wr.astFileEntry);
      state.astSymbols.push(...wr.astSymbols);
      state.astContains.push(...wr.astContains);
      state.astExtendsName.push(...wr.astExtendsName);
      state.astImplementsName.push(...wr.astImplementsName);
      state.astRefsName.push(...wr.astRefsName);
      state.astCallsName.push(...wr.astCallsName);
    };

    const tasks: Array<Promise<void>> = [];
    for (const item of filesToIndex) {
      const task = (async () => {
        processed++;
        this.onProgress?.({ totalFiles: state.totalFiles, processedFiles: processed, currentFile: item.filePosix });

        const content = this.source === 'staged'
          ? await readStagedFile(this.repoRoot, item.filePosix)
          : await readWorktreeFile(this.scanRoot, item.filePosix);
        if (content == null) return;

        const lang = inferIndexLang(item.filePosix);
        const existingHashes = Array.from(existingChunkIdsByLang[lang] ?? []);

        const result = await pool.processFile({
          filePath: item.filePosix,
          content,
          dim: this.dim,
          quantizationBits: 8,
          existingChunkHashes: existingHashes,
        });

        if (result) mergeResult(result);
      })();
      tasks.push(task);

      if (tasks.length >= pool.size * 2) {
        await Promise.race(tasks);
      }
    }

    await Promise.all(tasks);
  }

  // ── Single-threaded processing ────────────────────────────────────────

  private async processFilesSingleThreaded(
    filesToIndex: Array<{ filePosix: string; ch: GitDiffPathChange }>,
    state: {
      chunkRowsByLang: Partial<Record<IndexLang, any[]>>;
      refRowsByLang: Partial<Record<IndexLang, any[]>>;
      candidateChunksByLang: Partial<Record<IndexLang, Map<string, string>>>;
      neededHashByLang: Partial<Record<IndexLang, Set<string>>>;
      astFiles: Array<[string, string, string]>;
      astSymbols: Array<[string, string, string, string, string, string, number, number]>;
      astContains: Array<[string, string]>;
      astExtendsName: Array<[string, string]>;
      astImplementsName: Array<[string, string]>;
      astRefsName: Array<[string, string, string, string, string, number, number]>;
      astCallsName: Array<[string, string, string, string, number, number]>;
      totalFiles: number;
    },
  ): Promise<void> {
    let processed = 0;
    const concurrency = Math.max(1, Math.min(8, filesToIndex.length));
    const queue = filesToIndex.slice();
    const active = new Set<Promise<void>>();

    const processOneFile = async (item: { filePosix: string; ch: GitDiffPathChange }): Promise<void> => {
      processed++;
      const { filePosix } = item;
      this.onProgress?.({ totalFiles: state.totalFiles, processedFiles: processed, currentFile: filePosix });

      const lang = inferIndexLang(filePosix);
      if (!state.chunkRowsByLang[lang]) state.chunkRowsByLang[lang] = [];
      if (!state.refRowsByLang[lang]) state.refRowsByLang[lang] = [];
      if (!state.candidateChunksByLang[lang]) state.candidateChunksByLang[lang] = new Map<string, string>();
      if (!state.neededHashByLang[lang]) state.neededHashByLang[lang] = new Set<string>();

      const content = this.source === 'staged'
        ? await readStagedFile(this.repoRoot, filePosix)
        : await readWorktreeFile(this.scanRoot, filePosix);
      if (content == null) return;

      const parsed = this.parser.parseContent(filePosix, content);
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
          if (s.extends) for (const superName of s.extends) state.astExtendsName.push([refId, superName]);
          if (s.implements) for (const ifaceName of s.implements) state.astImplementsName.push([refId, ifaceName]);
        }

        state.neededHashByLang[lang]!.add(contentHash);
        state.candidateChunksByLang[lang]!.set(contentHash, text);

        const refRow: RefRow = {
          ref_id: refId,
          content_hash: contentHash,
          file: filePosix,
          symbol: s.name,
          kind: s.kind,
          signature: s.signature,
          start_line: s.startLine,
          end_line: s.endLine,
        };
        state.refRowsByLang[lang]!.push(refRow as any);
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
    };

    const scheduleNext = (): void => {
      while (active.size < concurrency && queue.length > 0) {
        const item = queue.shift()!;
        const task = processOneFile(item).catch(() => undefined).then(() => {
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
  }
}
