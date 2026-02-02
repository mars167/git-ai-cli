import path from 'path';
import { detectRepoGitContext } from '../../core/dsr/gitContext';
import { generateDsrForCommit } from '../../core/dsr/generate';
import { materializeDsrIndex } from '../../core/dsr/indexMaterialize';
import { symbolEvolution } from '../../core/dsr/query';
import { getDsrDirectoryState } from '../../core/dsr/state';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';

export async function handleDsrContext(input: {
  path: string;
  json: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'dsr:context' });
  const startedAt = Date.now();

  try {
    const start = path.resolve(input.path);
    const ctx = await detectRepoGitContext(start);
    const state = await getDsrDirectoryState(ctx.repo_root);

    const out = {
      commit_hash: ctx.head_commit,
      repo_root: ctx.repo_root,
      branch: ctx.branch,
      detached: ctx.detached,
      dsr_directory_state: state,
    };

    log.info('dsr_context', {
      ok: true,
      repoRoot: ctx.repo_root,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot: ctx.repo_root, ...out });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('dsr:context', { ok: false, err: message });
    return error('dsr_context_failed', { message });
  }
}

export async function handleDsrGenerate(input: {
  commit: string;
  path: string;
  json: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'dsr:generate' });
  const startedAt = Date.now();

  try {
    const start = path.resolve(input.path);
    const ctx = await detectRepoGitContext(start);
    const res = await generateDsrForCommit(ctx.repo_root, String(input.commit));

    const out = {
      commit_hash: res.dsr.commit_hash,
      file_path: res.file_path,
      existed: res.existed,
      counts: {
        affected_symbols: res.dsr.affected_symbols.length,
        ast_operations: res.dsr.ast_operations.length,
      },
      semantic_change_type: res.dsr.semantic_change_type,
      risk_level: res.dsr.risk_level,
    };

    log.info('dsr_generate', {
      ok: true,
      repoRoot: ctx.repo_root,
      commit_hash: out.commit_hash,
      existed: res.existed,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot: ctx.repo_root, ...out });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('dsr:generate', { ok: false, err: message });
    return error('dsr_generate_failed', { message });
  }
}

export async function handleDsrRebuildIndex(input: {
  path: string;
  json: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'dsr:rebuild-index' });
  const startedAt = Date.now();

  try {
    const start = path.resolve(input.path);
    const ctx = await detectRepoGitContext(start);
    const res = await materializeDsrIndex(ctx.repo_root);

    log.info('dsr_rebuild_index', {
      ok: res.enabled,
      repoRoot: ctx.repo_root,
      enabled: res.enabled,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot: ctx.repo_root, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('dsr:rebuild-index', { ok: false, err: message });
    return error('dsr_rebuild_index_failed', { message });
  }
}

export async function handleDsrSymbolEvolution(input: {
  symbol: string;
  path: string;
  all: boolean;
  start?: string;
  limit: number;
  contains: boolean;
  json: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'dsr:symbol-evolution' });
  const startedAt = Date.now();

  try {
    const startDir = path.resolve(input.path);
    const ctx = await detectRepoGitContext(startDir);
    const res = await symbolEvolution(ctx.repo_root, String(input.symbol), {
      all: Boolean(input.all),
      start: input.start ? String(input.start) : undefined,
      limit: Number(input.limit),
      contains: Boolean(input.contains),
    });

    log.info('dsr_symbol_evolution', {
      ok: res.ok,
      repoRoot: ctx.repo_root,
      symbol: input.symbol,
      hits: res.hits?.length ?? 0,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot: ctx.repo_root, symbol: input.symbol, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('dsr:symbol-evolution', { ok: false, err: message });
    return error('dsr_symbol_evolution_failed', { message });
  }
}
