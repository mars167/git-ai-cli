import path from 'path';
import { resolveGitRoot } from '../../core/git';
import { packLanceDb } from '../../core/archive';
import { unpackLanceDb } from '../../core/archive';
import { ensureLfsTracking } from '../../core/lfs';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';

export async function handlePackIndex(input: {
  path: string;
  lfs: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'pack' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    const packed = await packLanceDb(repoRoot);
    const lfs = input.lfs ? ensureLfsTracking(repoRoot, '.git-ai/lancedb.tar.gz') : { tracked: false };

    log.info('pack_index', {
      ok: true,
      repoRoot,
      packed: packed.packed,
      lfs: Boolean(lfs.tracked),
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot, ...packed, lfs });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('pack_index', { ok: false, err: message });
    return error('pack_index_failed', { message });
  }
}

export async function handleUnpackIndex(input: {
  path: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'unpack' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    const unpacked = await unpackLanceDb(repoRoot);

    log.info('unpack_index', {
      ok: true,
      repoRoot,
      unpacked: unpacked.unpacked,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot, ...unpacked });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('unpack_index', { ok: false, err: message });
    return error('unpack_index_failed', { message });
  }
}
