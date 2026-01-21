import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { CodeParser } from './parser';
import { defaultDbDir, openTables } from './lancedb';
import { sha256Hex } from './crypto';
import { hashEmbedding } from './embedding';
import { quantizeSQ8 } from './sq8';
import { ChunkRow, RefRow } from './types';

export interface IndexOptions {
  repoRoot: string;
  dim: number;
  overwrite: boolean;
}

async function loadAiIgnorePatterns(repoRoot: string): Promise<string[]> {
  const ignorePath = path.join(repoRoot, '.aiignore');
  if (!await fs.pathExists(ignorePath)) return [];
  const raw = await fs.readFile(ignorePath, 'utf-8');
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !l.startsWith('#'));
}

function buildChunkText(file: string, symbol: { name: string; kind: string; signature: string }): string {
  return `file:${file}\nkind:${symbol.kind}\nname:${symbol.name}\nsignature:${symbol.signature}`;
}

export class IndexerV2 {
  private repoRoot: string;
  private parser: CodeParser;
  private dim: number;
  private overwrite: boolean;

  constructor(options: IndexOptions) {
    this.repoRoot = path.resolve(options.repoRoot);
    this.dim = options.dim;
    this.overwrite = options.overwrite;
    this.parser = new CodeParser();
  }

  async run(): Promise<void> {
    const gitAiDir = path.join(this.repoRoot, '.git-ai');
    await fs.ensureDir(gitAiDir);
    const dbDir = defaultDbDir(this.repoRoot);

    const { chunks, refs } = await openTables({
      dbDir,
      dim: this.dim,
      mode: this.overwrite ? 'overwrite' : 'create_if_missing',
    });

    const existingChunkIds = new Set<string>();
    if (!this.overwrite) {
      const existing = await chunks.query().select(['content_hash']).limit(1_000_000).toArray();
      for (const row of existing as any[]) {
        const id = String(row.content_hash ?? '');
        if (id) existingChunkIds.add(id);
      }
    }

    const aiIgnore = await loadAiIgnorePatterns(this.repoRoot);
    const files = await glob('**/*.{ts,tsx,js,jsx,java}', {
      cwd: this.repoRoot,
      ignore: [
        'node_modules/**',
        '.git/**',
        '.git-ai/**',
        'dist/**',
        'target/**',
        '**/target/**',
        'build/**',
        '**/build/**',
        '.gradle/**',
        '**/.gradle/**',
        ...aiIgnore,
      ],
    });

    const chunkRows: any[] = [];
    const refRows: any[] = [];

    for (const file of files) {
      const fullPath = path.join(this.repoRoot, file);
      const symbols = await this.parser.parseFile(fullPath);
      for (const s of symbols) {
        const text = buildChunkText(file, s);
        const contentHash = sha256Hex(text);
        const refId = sha256Hex(`${file}:${s.name}:${s.kind}:${s.startLine}:${s.endLine}:${contentHash}`);

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
          chunkRows.push(row as any);
          existingChunkIds.add(contentHash);
        }

        const refRow: RefRow = {
          ref_id: refId,
          content_hash: contentHash,
          file,
          symbol: s.name,
          kind: s.kind,
          signature: s.signature,
          start_line: s.startLine,
          end_line: s.endLine,
        };
        refRows.push(refRow as any);
      }
    }

    if (chunkRows.length > 0) await chunks.add(chunkRows);
    if (refRows.length > 0) await refs.add(refRows);

    const meta = {
      version: '2.0',
      dim: this.dim,
      files: files.length,
      chunksAdded: chunkRows.length,
      refsAdded: refRows.length,
      dbDir: path.relative(this.repoRoot, dbDir),
    };
    await fs.writeJSON(path.join(gitAiDir, 'meta.json'), meta, { spaces: 2 });
  }
}
