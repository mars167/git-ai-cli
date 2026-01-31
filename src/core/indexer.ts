import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { CodeParser } from './parser';
import { defaultDbDir, IndexLang, openTablesByLang } from './lancedb';
import { sha256Hex } from './crypto';
import { hashEmbedding } from './embedding';
import { quantizeSQ8 } from './sq8';
import { writeAstGraphToCozo } from './astGraph';
import { ChunkRow, RefRow } from './types';
import { toPosixPath } from './paths';
import { getCurrentCommitHash } from './git';

export interface IndexOptions {
  repoRoot: string;
  scanRoot?: string;
  dim: number;
  overwrite: boolean;
  onProgress?: (p: { totalFiles: number; processedFiles: number; currentFile?: string }) => void;
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

export class IndexerV2 {
  private repoRoot: string;
  private scanRoot: string;
  private parser: CodeParser;
  private dim: number;
  private overwrite: boolean;
  private onProgress?: IndexOptions['onProgress'];

  constructor(options: IndexOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.scanRoot = path.resolve(options.scanRoot ?? options.repoRoot);
    this.dim = options.dim;
    this.overwrite = options.overwrite;
    this.onProgress = options.onProgress;
    this.parser = new CodeParser();
  }

  async run(): Promise<void> {
    const gitAiDir = path.join(this.repoRoot, '.git-ai');
    await fs.ensureDir(gitAiDir);
    const dbDir = defaultDbDir(this.repoRoot);

    const aiIgnore = await loadIgnorePatterns(this.repoRoot, '.aiignore');
    const gitIgnore = await loadIgnorePatterns(this.repoRoot, '.gitignore');
    const files = await glob('**/*.{ts,tsx,js,jsx,java,c,h,go,py,rs,md,mdx,yml,yaml}', {
      cwd: this.scanRoot,
      nodir: true,
      ignore: [
        'node_modules/**',
        '**/node_modules/**',
        '.git/**',
        '**/.git/**',
        '.git-ai/**',
        '**/.git-ai/**',
        '.repo/**',
        '**/.repo/**',
        'dist/**',
        'target/**',
        '**/target/**',
        'build/**',
        '**/build/**',
        '.gradle/**',
        '**/.gradle/**',
        ...aiIgnore,
        ...gitIgnore,
      ],
    });

    const languages = Array.from(new Set(files.map(inferIndexLang)));
    const { byLang } = await openTablesByLang({
      dbDir,
      dim: this.dim,
      mode: this.overwrite ? 'overwrite' : 'create_if_missing',
      languages,
    });

    const existingChunkIdsByLang: Partial<Record<IndexLang, Set<string>>> = {};
    if (!this.overwrite) {
      for (const lang of languages) {
        const t = byLang[lang];
        if (!t) continue;
        const set = new Set<string>();
        const existing = await t.chunks.query().select(['content_hash']).limit(1_000_000).toArray();
        for (const row of existing as any[]) {
          const id = String(row.content_hash ?? '');
          if (id) set.add(id);
        }
        existingChunkIdsByLang[lang] = set;
      }
    }

    const chunkRowsByLang: Partial<Record<IndexLang, any[]>> = {};
    const refRowsByLang: Partial<Record<IndexLang, any[]>> = {};
    const astFiles: Array<[string, string, string]> = [];
    const astSymbols: Array<[string, string, string, string, string, string, number, number]> = [];
    const astContains: Array<[string, string]> = [];
    const astExtendsName: Array<[string, string]> = [];
    const astImplementsName: Array<[string, string]> = [];
    const astRefsName: Array<[string, string, string, string, string, number, number]> = [];
    const astCallsName: Array<[string, string, string, string, number, number]> = [];

    const totalFiles = files.length;
    this.onProgress?.({ totalFiles, processedFiles: 0 });

    let processedFiles = 0;
    for (const file of files) {
      processedFiles++;
      const fullPath = path.join(this.scanRoot, file);
      const filePosix = toPosixPath(file);
      this.onProgress?.({ totalFiles, processedFiles, currentFile: filePosix });
      const lang = inferIndexLang(filePosix);
      if (!chunkRowsByLang[lang]) chunkRowsByLang[lang] = [];
      if (!refRowsByLang[lang]) refRowsByLang[lang] = [];
      if (!existingChunkIdsByLang[lang]) existingChunkIdsByLang[lang] = new Set<string>();

      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;

      const parsed = await this.parser.parseFile(fullPath);
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
          if (s.extends) {
            for (const superName of s.extends) astExtendsName.push([refId, superName]);
          }
          if (s.implements) {
            for (const ifaceName of s.implements) astImplementsName.push([refId, ifaceName]);
          }
        }

        const existingChunkIds = existingChunkIdsByLang[lang]!;
        if (!existingChunkIds.has(contentHash)) {
          const vec = hashEmbedding(text, { dim: this.dim });
          const q = quantizeSQ8(vec);
          const row: ChunkRow = {
            content_hash: contentHash,
            text,
            dim: q.dim,
            scale: q.scale,
            qvec_b64: Buffer.from(q.q).toString('base64'),
          };
          chunkRowsByLang[lang]!.push(row as any);
          existingChunkIds.add(contentHash);
        }

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

    const addedByLang: Record<string, { chunksAdded: number; refsAdded: number }> = {};
    for (const lang of languages) {
      const t = byLang[lang];
      if (!t) continue;
      const chunkRows = chunkRowsByLang[lang] ?? [];
      const refRows = refRowsByLang[lang] ?? [];
      if (chunkRows.length > 0) await t.chunks.add(chunkRows);
      if (refRows.length > 0) await t.refs.add(refRows);
      addedByLang[lang] = { chunksAdded: chunkRows.length, refsAdded: refRows.length };
    }

    const astGraph = await writeAstGraphToCozo(this.repoRoot, {
      files: astFiles,
      symbols: astSymbols,
      contains: astContains,
      extends_name: astExtendsName,
      implements_name: astImplementsName,
      refs_name: astRefsName,
      calls_name: astCallsName,
    });

    const commitHash = await getCurrentCommitHash(this.repoRoot);

    const meta = {
      version: '2.1',
      index_schema_version: 3,
      dim: this.dim,
      files: files.length,
      chunksAdded: Object.values(addedByLang).reduce((a, b) => a + b.chunksAdded, 0),
      refsAdded: Object.values(addedByLang).reduce((a, b) => a + b.refsAdded, 0),
      byLang: addedByLang,
      languages,
      dbDir: path.relative(this.repoRoot, dbDir),
      scanRoot: path.relative(this.repoRoot, this.scanRoot),
      commit_hash: commitHash ?? undefined,
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
    await fs.writeJSON(path.join(gitAiDir, 'meta.json'), meta, { spaces: 2 });
  }
}
