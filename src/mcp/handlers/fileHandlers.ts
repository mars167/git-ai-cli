import type { ToolHandler, RepoContext } from '../types';
import { successResponse, errorResponse } from '../types';
import type { ListFilesArgs, ReadFileArgs } from '../schemas';
import { resolveGitRoot, inferScanRoot } from '../../core/git';
import { glob } from 'glob';
import fs from 'fs-extra';
import path from 'path';

async function openRepoContext(startDir: string): Promise<RepoContext> {
  const repoRoot = await resolveGitRoot(path.resolve(startDir));
  const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
  const meta = await fs.pathExists(metaPath)
    ? await fs.readJSON(metaPath).catch(() => null)
    : null;
  const dim = typeof meta?.dim === 'number' ? meta.dim : 256;
  const scanRoot = path.resolve(
    repoRoot,
    typeof meta?.scanRoot === 'string'
      ? meta.scanRoot
      : path.relative(repoRoot, inferScanRoot(repoRoot))
  );
  return { repoRoot, scanRoot, dim, meta };
}

function assertPathInsideRoot(rootDir: string, file: string): string {
  const abs = path.resolve(rootDir, file);
  const rel = path.relative(path.resolve(rootDir), abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes repository root');
  }
  return abs;
}

export const handleListFiles: ToolHandler<ListFilesArgs> = async (args) => {
  const ctx = await openRepoContext(args.path);
  const pattern = args.pattern ?? '**/*';
  const limit = args.limit ?? 500;
  const files = await glob(pattern, {
    cwd: ctx.scanRoot,
    dot: true,
    nodir: true,
    ignore: [
      'node_modules/**',
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
      '**/.gradle/**'
    ]
  });

  return successResponse({
    repoRoot: ctx.repoRoot,
    scanRoot: ctx.scanRoot,
    files: files.slice(0, limit)
  });
};

export const handleReadFile: ToolHandler<ReadFileArgs> = async (args) => {
  const ctx = await openRepoContext(args.path);
  const file = args.file ?? '';
  const startLine = Math.max(1, args.start_line ?? 1);
  const endLine = Math.max(startLine, args.end_line ?? startLine + 199);
  const abs = assertPathInsideRoot(ctx.scanRoot, file);
  const raw = await fs.readFile(abs, 'utf-8');
  const lines = raw.split(/\r?\n/);
  const slice = lines.slice(startLine - 1, endLine);
  const numbered = slice.map((l, idx) => `${String(startLine + idx).padStart(6, ' ')}→${l}`).join('\n');

  return successResponse({
    repoRoot: ctx.repoRoot,
    scanRoot: ctx.scanRoot,
    file,
    start_line: startLine,
    end_line: endLine,
    text: numbered
  });
};
