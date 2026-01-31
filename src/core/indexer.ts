import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { IndexingRuntimeConfig, mergeRuntimeConfig } from './indexing/config';
import { runParallelIndexing } from './indexing/parallel';
import { defaultDbDir, IndexLang, openTablesByLang } from './lancedb';
import { writeAstGraphToCozo } from './astGraph';

export interface IndexOptions {
  repoRoot: string;
  scanRoot?: string;
  dim: number;
  overwrite: boolean;
  onProgress?: (p: { totalFiles: number; processedFiles: number; currentFile?: string }) => void;
  config?: Partial<IndexingRuntimeConfig>;
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
  private dim: number;
  private overwrite: boolean;
  private onProgress?: IndexOptions['onProgress'];
  private config: IndexingRuntimeConfig;

  constructor(options: IndexOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.scanRoot = path.resolve(options.scanRoot ?? options.repoRoot);
    this.dim = options.dim;
    this.overwrite = options.overwrite;
    this.onProgress = options.onProgress;
    this.config = mergeRuntimeConfig(options.config);
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

    const parallelResult = await runParallelIndexing({
      repoRoot: this.repoRoot,
      scanRoot: this.scanRoot,
      dim: this.dim,
      files,
      indexing: this.config.indexing,
      errorHandling: this.config.errorHandling,
      existingChunkIdsByLang,
      onProgress: this.onProgress,
    });

    const chunkRowsByLang = parallelResult.chunkRowsByLang;
    const refRowsByLang = parallelResult.refRowsByLang;
    const astFiles = parallelResult.astFiles;
    const astSymbols = parallelResult.astSymbols;
    const astContains = parallelResult.astContains;
    const astExtendsName = parallelResult.astExtendsName;
    const astImplementsName = parallelResult.astImplementsName;
    const astRefsName = parallelResult.astRefsName;
    const astCallsName = parallelResult.astCallsName;

    const addedByLang: Record<string, { chunksAdded: number; refsAdded: number }> = {};
    for (const lang of languages) {
      const t = byLang[lang];
      if (!t) continue;
      const chunkRows = chunkRowsByLang[lang] ?? [];
      const refRows = refRowsByLang[lang] ?? [];
      if (chunkRows.length > 0) await t.chunks.add(chunkRows as unknown as Record<string, unknown>[]);
      if (refRows.length > 0) await t.refs.add(refRows as unknown as Record<string, unknown>[]);
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
