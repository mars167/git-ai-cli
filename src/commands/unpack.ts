import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { unpackLanceDb } from '../core/archive';
import { createLogger } from '../core/log';

export const unpackCommand = new Command('unpack')
  .description('Unpack .git-ai/lancedb.tar.gz into .git-ai/lancedb')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai unpack' });
    const startedAt = Date.now();
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const unpacked = await unpackLanceDb(repoRoot);
      log.info('unpack_index', { ok: true, repoRoot, unpacked: unpacked.unpacked, duration_ms: Date.now() - startedAt });
      console.log(JSON.stringify({ repoRoot, ...unpacked }, null, 2));
    } catch (e) {
      log.error('unpack_index', { ok: false, duration_ms: Date.now() - startedAt, err: e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) } });
      process.exit(1);
    }
  });
