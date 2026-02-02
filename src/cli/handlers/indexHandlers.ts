import path from 'path';
import fs from 'fs-extra';
import { inferScanRoot, resolveGitRoot } from '../../core/git';
import { IndexerV2 } from '../../core/indexer';
import { IncrementalIndexerV2 } from '../../core/indexerIncremental';
import { getStagedNameStatus, getWorktreeNameStatus } from '../../core/gitDiff';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';

export async function handleIndexRepo(input: {
  path: string;
  dim: number;
  overwrite: boolean;
  incremental: boolean;
  staged: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'index' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    const scanRoot = inferScanRoot(repoRoot);
    const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
    const meta = await fs.readJSON(metaPath).catch(() => null);
    const dim = typeof meta?.dim === 'number' ? meta.dim : input.dim;
    const isTTY = Boolean(process.stderr.isTTY) && !process.env.CI;
    let renderedInTTY = false;
    let finishedInTTY = false;
    const renderProgress = (p: { totalFiles: number; processedFiles: number; currentFile?: string }): void => {
      const total = Math.max(0, p.totalFiles);
      const done = Math.max(0, Math.min(total, p.processedFiles));
      if (!isTTY) {
        if (done === 0) {
          process.stderr.write(`Indexing ${total} files...\n`);
        } else if (done === total || done % 200 === 0) {
          process.stderr.write((`[${done}/${total}] ${p.currentFile ?? ''}`.trim()) + '\n');
        }
        return;
      }
      const columns = Math.max(40, Number(process.stderr.columns ?? 100));
      const prefix = `${done}/${total}`;
      const percent = total > 0 ? Math.floor((done / total) * 100) : 100;
      const reserved = prefix.length + 1 + 6 + 1 + 1;
      const barWidth = Math.max(10, Math.min(30, columns - reserved - 20));
      const filled = total > 0 ? Math.round((done / total) * barWidth) : barWidth;
      const bar = `${'='.repeat(filled)}${'-'.repeat(Math.max(0, barWidth - filled))}`;
      const fileSuffix = p.currentFile ? ` ${p.currentFile}` : '';
      const line = `[${bar}] ${String(percent).padStart(3)}% ${prefix}${fileSuffix}`;
      const clipped = line.length >= columns ? line.slice(0, columns - 1) : line;
      process.stderr.write(`\r${clipped.padEnd(columns - 1, ' ')}`);
      renderedInTTY = true;
      if (done === total && !finishedInTTY) {
        process.stderr.write('\n');
        finishedInTTY = true;
      }
    };

    if (input.incremental) {
      const changes = input.staged ? await getStagedNameStatus(repoRoot) : await getWorktreeNameStatus(repoRoot);
      const indexer = new IncrementalIndexerV2({
        repoRoot,
        scanRoot,
        dim,
        source: input.staged ? 'staged' : 'worktree',
        changes,
        onProgress: renderProgress,
      });
      await indexer.run();
    } else {
      const indexer = new IndexerV2({ repoRoot, scanRoot, dim, overwrite: input.overwrite, onProgress: renderProgress });
      await indexer.run();
    }
    if (renderedInTTY && !finishedInTTY) process.stderr.write('\n');
    log.info('index_repo', {
      ok: true,
      repoRoot,
      scanRoot,
      dim,
      overwrite: input.overwrite,
      duration_ms: Date.now() - startedAt,
    });
    return success({ ok: true, repoRoot, scanRoot, dim, overwrite: input.overwrite, incremental: input.incremental, staged: input.staged });
  } catch (e) {
    log.error('index_repo', {
      ok: false,
      duration_ms: Date.now() - startedAt,
      err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) },
    });
    return error('index_failed', { message: e instanceof Error ? e.message : String(e) });
  }
}
