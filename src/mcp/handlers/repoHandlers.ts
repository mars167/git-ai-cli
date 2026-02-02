import type { ToolHandler, ToolContext, RepoContext } from '../types';
import { successResponse, errorResponse } from '../types';
import type {
  GetRepoArgs,
  CheckIndexArgs,
  RebuildIndexArgs,
  PackIndexArgs,
  UnpackIndexArgs,
} from '../schemas';
import { resolveGitRoot, inferScanRoot } from '../../core/git';
import { packLanceDb, unpackLanceDb } from '../../core/archive';
import { checkIndex } from '../../core/indexCheck';
import { IndexerV2 } from '../../core/indexer';
import { ensureLfsTracking } from '../../core/lfs';
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

export const handleGetRepo: ToolHandler<GetRepoArgs> = async (args, context) => {
  const ctx = await openRepoContext(args.path);
  return successResponse({
    startDir: context.startDir,
    repoRoot: ctx.repoRoot,
    scanRoot: ctx.scanRoot,
  });
};

export const handleCheckIndex: ToolHandler<CheckIndexArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const res = await checkIndex(repoRoot);
  return successResponse({ repoRoot, ...res });
};

export const handleRebuildIndex: ToolHandler<RebuildIndexArgs> = async (args, context) => {
  const ctx = await openRepoContext(args.path);
  const dimOpt = args.dim ?? 256;
  const dim = typeof ctx.meta?.dim === 'number' ? ctx.meta.dim : dimOpt;
  const indexer = new IndexerV2({
    repoRoot: ctx.repoRoot,
    scanRoot: ctx.scanRoot,
    dim,
    overwrite: args.overwrite,
  });
  await indexer.run();
  return successResponse({
    repoRoot: ctx.repoRoot,
    scanRoot: ctx.scanRoot,
    dim,
    overwrite: args.overwrite,
  });
};

export const handlePackIndex: ToolHandler<PackIndexArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const packed = await packLanceDb(repoRoot);
  const lfs = args.lfs
    ? await ensureLfsTracking(repoRoot, '.git-ai/lancedb.tar.gz')
    : { tracked: false };
  return successResponse({ repoRoot, ...packed, lfs });
};

export const handleUnpackIndex: ToolHandler<UnpackIndexArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const unpacked = await unpackLanceDb(repoRoot);
  return successResponse({ repoRoot, ...unpacked });
};
