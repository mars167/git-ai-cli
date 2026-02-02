import type { ToolHandler } from '../types';
import { successResponse, errorResponse } from '../types';
import type {
  DsrContextArgs,
  DsrGenerateArgs,
  DsrRebuildIndexArgs,
  DsrSymbolEvolutionArgs
} from '../schemas';
import { resolveGitRoot } from '../../core/git';
import { detectRepoGitContext } from '../../core/dsr/gitContext';
import { generateDsrForCommit } from '../../core/dsr/generate';
import { materializeDsrIndex } from '../../core/dsr/indexMaterialize';
import { symbolEvolution } from '../../core/dsr/query';
import { getDsrDirectoryState } from '../../core/dsr/state';
import path from 'path';

export const handleDsrContext: ToolHandler<DsrContextArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const ctx = await detectRepoGitContext(repoRoot);
  const state = await getDsrDirectoryState(ctx.repo_root);

  return successResponse({
    commit_hash: ctx.head_commit,
    repo_root: ctx.repo_root,
    branch: ctx.branch,
    detached: ctx.detached,
    dsr_directory_state: state
  });
};

export const handleDsrGenerate: ToolHandler<DsrGenerateArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const commit = args.commit ?? 'HEAD';
  const res = await generateDsrForCommit(repoRoot, commit);

  return successResponse({
    commit_hash: res.dsr.commit_hash,
    file_path: res.file_path,
    existed: res.existed,
    counts: {
      affected_symbols: res.dsr.affected_symbols.length,
      ast_operations: res.dsr.ast_operations.length
    },
    semantic_change_type: res.dsr.semantic_change_type,
    risk_level: res.dsr.risk_level
  });
};

export const handleDsrRebuildIndex: ToolHandler<DsrRebuildIndexArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const res = await materializeDsrIndex(repoRoot);

  return successResponse({
    repoRoot,
    ...res
  });
};

export const handleDsrSymbolEvolution: ToolHandler<DsrSymbolEvolutionArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const symbol = args.symbol;
  const opts = {
    start: args.start,
    all: args.all ?? false,
    limit: args.limit ?? 200,
    contains: args.contains ?? false
  };
  const res = await symbolEvolution(repoRoot, symbol, opts);

  return successResponse({
    repoRoot,
    symbol,
    ...res
  });
};
