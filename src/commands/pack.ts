import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { packLanceDb } from '../core/archive';
import { ensureLfsTracking } from '../core/lfs';
import { createLogger } from '../core/log';

export const packCommand = new Command('pack')
  .description('Pack .git-ai/lancedb into .git-ai/lancedb.tar.gz')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--lfs', 'Run git lfs track for .git-ai/lancedb.tar.gz', false)
  .action(async (options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai pack' });
    const startedAt = Date.now();
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const packed = await packLanceDb(repoRoot);
      const lfs = options.lfs ? ensureLfsTracking(repoRoot, '.git-ai/lancedb.tar.gz') : { tracked: false };
      log.info('pack_index', { ok: true, repoRoot, packed: packed.packed, lfs: Boolean(lfs.tracked), duration_ms: Date.now() - startedAt });
      console.log(JSON.stringify({ repoRoot, ...packed, lfs }, null, 2));
    } catch (e) {
      log.error('pack_index', { ok: false, duration_ms: Date.now() - startedAt, err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } });
      process.exit(1);
    }
  });
