import fs from 'fs-extra';
import path from 'path';
import simpleGit from 'simple-git';
import { sha256Hex } from './crypto';
import { defaultDbDir, IndexLang, openTablesByLang, ALL_INDEX_LANGS } from './lancedb';
import { hashEmbedding } from './embedding';
import { quantizeSQ8 } from './sq8';
import { toPosixPath } from './paths';
import { removeFileFromAstGraph, writeAstGraphToCozo } from './astGraph';
import { ChunkRow, RefRow } from './types';
import { GitDiffPathChange } from './gitDiff';
import { SnapshotCodeParser } from './dsr/snapshotParser';

export interface IncrementalIndexOptions {
  repoRoot: string;
  scanRoot?: string;
  dim: number;
  source: 'worktree' | 'staged';
  changes: GitDiffPathChange[];
  onProgress?: (p: { totalFiles: number; processedFiles: number; currentFile?: string }) => void;
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
  private parser: SnapshotCodeParser;

  constructor(options: IncrementalIndexOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.scanRoot = path.resolve(options.scanRoot ?? options.repoRoot);
    this.dim = options.dim;
    this.source = options.source;
    this.changes = options.changes;
    this.onProgress = options.onProgress;
    this.parser = new SnapshotCodeParser();
  }

  async run(): Promise<{ processed: number; addedByLang: Record<string, { chunksAdded: number; refsAdded: number }> }> {
    const gitAiDir = path.join(this.repoRoot, '.git-ai');
    await fs.ensureDir(gitAiDir);
    const dbDir = defaultDbDir(this.repoRoot);

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

    let processed = 0;
    for (const ch of this.changes) {
      processed++;
      const filePosix = toPosixPath(ch.path);
      this.onProgress?.({ totalFiles, processedFiles: processed, currentFile: filePosix });

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

      const lang = inferIndexLang(filePosix);
      if (!chunkRowsByLang[lang]) chunkRowsByLang[lang] = [];
      if (!refRowsByLang[lang]) refRowsByLang[lang] = [];
      if (!candidateChunksByLang[lang]) candidateChunksByLang[lang] = new Map<string, string>();
      if (!neededHashByLang[lang]) neededHashByLang[lang] = new Set<string>();

      const content = this.source === 'staged'
        ? await readStagedFile(this.repoRoot, filePosix)
        : await readWorktreeFile(this.scanRoot, filePosix);
      if (content == null) continue;

      const parsed = this.parser.parseContent(filePosix, content);
      const symbols = parsed.symbols;
      const fileRefs = parsed.refs;
      const fileId = sha256Hex(`file:${filePosix}`);
      astFiles.push([fileId, filePosix, lang]);

      const callableScopes: Array<{ refId: string; startLine: number; endLine: number }> = [];
      for (const s of symbols) {
        const text = buildChunkText(filePosix, s);
        const contentHash = sha256Hex(text);
        const refId = sha256Hex(`${filePosix}:${s.name}:${s.kind}:${s.startLine}:${s.endLine}:${contentHash}`);

        astSymbols.push([refId, filePosix, lang, s.name, s.kind, s.signature, s.startLine, s.endLine]);
        if (s.kind === 'function' || s.kind === 'method') {
          callableScopes.push({ refId, startLine: s.startLine, endLine: s.endLine });
        }

        let parentId = fileId;
        if (s.container) {
          const cText = buildChunkText(filePosix, s.container);
          const cHash = sha256Hex(cText);
          parentId = sha256Hex(`${filePosix}:${s.container.name}:${s.container.kind}:${s.container.startLine}:${s.container.endLine}:${cHash}`);
        }
        astContains.push([parentId, refId]);

        if (s.kind === 'class') {
          if (s.extends) for (const superName of s.extends) astExtendsName.push([refId, superName]);
          if (s.implements) for (const ifaceName of s.implements) astImplementsName.push([refId, ifaceName]);
        }

        neededHashByLang[lang]!.add(contentHash);
        candidateChunksByLang[lang]!.set(contentHash, text);

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
        refRowsByLang[lang]!.push(refRow as any);
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
        astRefsName.push([fromId, lang, r.name, r.refKind, filePosix, r.line, r.column]);
        if (r.refKind === 'call' || r.refKind === 'new') {
          astCallsName.push([fromId, lang, r.name, filePosix, r.line, r.column]);
        }
      }
    }

    const existingChunkIdsByLang: Partial<Record<IndexLang, Set<string>>> = {};
    for (const lang of Object.keys(neededHashByLang) as IndexLang[]) {
      const t = (byLang as any)[lang];
      if (!t) continue;
      const needed = Array.from(neededHashByLang[lang] ?? []);
      const existing = new Set<string>();
      for (let i = 0; i < needed.length; i += 400) {
        const chunk = needed.slice(i, i + 400);
        if (chunk.length === 0) continue;
        const pred = `content_hash IN (${chunk.map((h) => `'${escapeQuotes(h)}'`).join(',')})`;
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

    const addedByLang: Record<string, { chunksAdded: number; refsAdded: number }> = {};
    for (const lang of ALL_INDEX_LANGS) {
      const t = byLang[lang];
      if (!t) continue;
      const chunkRows = chunkRowsByLang[lang] ?? [];
      const refRows = refRowsByLang[lang] ?? [];
      if (chunkRows.length > 0) await t.chunks.add(chunkRows);
      if (refRows.length > 0) await t.refs.add(refRows);
      if (chunkRows.length > 0 || refRows.length > 0) {
        addedByLang[lang] = { chunksAdded: chunkRows.length, refsAdded: refRows.length };
      }
    }

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
    const meta = {
      ...(prev && typeof prev === 'object' ? prev : {}),
      version: '2.1',
      index_schema_version: 3,
      dim: this.dim,
      dbDir: path.relative(this.repoRoot, dbDir),
      scanRoot: path.relative(this.repoRoot, this.scanRoot),
      languages: ALL_INDEX_LANGS,
      byLang: addedByLang,
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
}
