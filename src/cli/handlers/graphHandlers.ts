import path from 'path';
import { resolveGitRoot } from '../../core/git';
import { sha256Hex } from '../../core/crypto';
import {
  buildCallChainDownstreamByNameQuery,
  buildCallChainUpstreamByNameQuery,
  buildCalleesByNameQuery,
  buildCallersByNameQuery,
  buildChildrenQuery,
  buildFindReferencesQuery,
  buildFindSymbolsQuery,
  runAstGraphQuery,
} from '../../core/astGraphQuery';
import { toPosixPath } from '../../core/paths';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';
import { resolveRepoContext, validateIndex, resolveLanguages, type RepoContext } from '../helpers';

function isCLIError(value: unknown): value is CLIError {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as any).ok === false;
}

export async function handleGraphQuery(input: {
  scriptParts: string[];
  path: string;
  params: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:query' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    const query = input.scriptParts.join(' ');
    const params = JSON.parse(input.params);
    const result = await runAstGraphQuery(repoRoot, query, params);

    log.info('ast_graph_query', {
      ok: true,
      repoRoot,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:query', { ok: false, err: message });
    return error('query_execution_failed', { message });
  }
}

export async function handleFindSymbols(input: {
  prefix: string;
  path: string;
  lang: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:find' });
  const startedAt = Date.now();

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  if (!ctx.indexStatus.ok) {
    return error('index_incompatible', {
      message: 'Index is missing or incompatible. Run: git-ai ai index --overwrite',
      ...ctx.indexStatus,
    });
  }

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  try {
    const langs = resolveLanguages(ctx.meta, input.lang);
    const allRows: any[] = [];

    for (const lang of langs) {
      const result = await runAstGraphQuery(
        ctx.repoRoot,
        buildFindSymbolsQuery(lang),
        { prefix: input.prefix, lang }
      );
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      for (const r of rows) allRows.push(r);
    }

    const result = {
      headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'],
      rows: allRows,
    };

    log.info('ast_graph_find', {
      ok: true,
      repoRoot: ctx.repoRoot,
      prefix: input.prefix,
      lang: input.lang,
      langs,
      rows: allRows.length,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot: ctx.repoRoot, lang: input.lang, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:find', { ok: false, err: message });
    return error('find_symbols_failed', { message });
  }
}

export async function handleGraphChildren(input: {
  id: string;
  path: string;
  asFile: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:children' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    const parentId = input.asFile ? sha256Hex(`file:${toPosixPath(input.id)}`) : input.id;
    const result = await runAstGraphQuery(repoRoot, buildChildrenQuery(), { parent_id: parentId });

    log.info('ast_graph_children', {
      ok: true,
      repoRoot,
      parent_id: parentId,
      rows: Array.isArray((result as any)?.rows) ? (result as any).rows.length : 0,
      duration_ms: Date.now() - startedAt,
    });

    return success({ repoRoot, parent_id: parentId, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:children', { ok: false, err: message });
    return error('graph_children_failed', { message });
  }
}

export async function handleGraphRefs(input: {
  name: string;
  path: string;
  limit: number;
  lang: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:refs' });
  const startedAt = Date.now();

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  if (!ctx.indexStatus.ok) {
    return error('index_incompatible', {
      message: 'Index is missing or incompatible. Run: git-ai ai index --overwrite',
      ...ctx.indexStatus,
    });
  }

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  try {
    const langs = resolveLanguages(ctx.meta, input.lang);
    const allRows: any[] = [];

    for (const lang of langs) {
      const result = await runAstGraphQuery(
        ctx.repoRoot,
        buildFindReferencesQuery(lang),
        { name: input.name, lang }
      );
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      for (const r of rows) allRows.push(r);
    }

    const rows = allRows.slice(0, input.limit);

    log.info('ast_graph_refs', {
      ok: true,
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      langs,
      rows: rows.length,
      duration_ms: Date.now() - startedAt,
    });

    return success({
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      result: {
        headers: ['file', 'line', 'col', 'ref_kind', 'from_id', 'from_kind', 'from_name', 'from_lang'],
        rows,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:refs', { ok: false, err: message });
    return error('graph_refs_failed', { message });
  }
}

export async function handleGraphCallers(input: {
  name: string;
  path: string;
  limit: number;
  lang: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:callers' });
  const startedAt = Date.now();

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  if (!ctx.indexStatus.ok) {
    return error('index_incompatible', {
      message: 'Index is missing or incompatible. Run: git-ai ai index --overwrite',
      ...ctx.indexStatus,
    });
  }

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  try {
    const langs = resolveLanguages(ctx.meta, input.lang);
    const allRows: any[] = [];

    for (const lang of langs) {
      const result = await runAstGraphQuery(
        ctx.repoRoot,
        buildCallersByNameQuery(lang),
        { name: input.name, lang }
      );
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      for (const r of rows) allRows.push(r);
    }

    const rows = allRows.slice(0, input.limit);

    log.info('ast_graph_callers', {
      ok: true,
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      langs,
      rows: rows.length,
      duration_ms: Date.now() - startedAt,
    });

    return success({
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      result: {
        headers: ['caller_id', 'caller_kind', 'caller_name', 'file', 'line', 'col', 'caller_lang'],
        rows,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:callers', { ok: false, err: message });
    return error('graph_callers_failed', { message });
  }
}

export async function handleGraphCallees(input: {
  name: string;
  path: string;
  limit: number;
  lang: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:callees' });
  const startedAt = Date.now();

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  if (!ctx.indexStatus.ok) {
    return error('index_incompatible', {
      message: 'Index is missing or incompatible. Run: git-ai ai index --overwrite',
      ...ctx.indexStatus,
    });
  }

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  try {
    const langs = resolveLanguages(ctx.meta, input.lang);
    const allRows: any[] = [];

    for (const lang of langs) {
      const result = await runAstGraphQuery(
        ctx.repoRoot,
        buildCalleesByNameQuery(lang),
        { name: input.name, lang }
      );
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      for (const r of rows) allRows.push(r);
    }

    const rows = allRows.slice(0, input.limit);

    log.info('ast_graph_callees', {
      ok: true,
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      langs,
      rows: rows.length,
      duration_ms: Date.now() - startedAt,
    });

    return success({
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      result: {
        headers: [
          'caller_id',
          'caller_lang',
          'callee_id',
          'callee_file',
          'callee_name',
          'callee_kind',
          'file',
          'line',
          'col',
        ],
        rows,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:callees', { ok: false, err: message });
    return error('graph_callees_failed', { message });
  }
}

export async function handleGraphChain(input: {
  name: string;
  path: string;
  direction: 'downstream' | 'upstream';
  depth: number;
  limit: number;
  minNameLen: number;
  lang: string;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'graph:chain' });
  const startedAt = Date.now();

  const ctxOrError = await resolveRepoContext(input.path);

  if (isCLIError(ctxOrError)) {
    return ctxOrError;
  }

  const ctx = ctxOrError as RepoContext;

  if (!ctx.indexStatus.ok) {
    return error('index_incompatible', {
      message: 'Index is missing or incompatible. Run: git-ai ai index --overwrite',
      ...ctx.indexStatus,
    });
  }

  const validationError = validateIndex(ctx);
  if (validationError) {
    return validationError;
  }

  try {
    const langs = resolveLanguages(ctx.meta, input.lang);
    const query =
      input.direction === 'upstream'
        ? buildCallChainUpstreamByNameQuery()
        : buildCallChainDownstreamByNameQuery();
    const allRows: any[] = [];

    for (const lang of langs) {
      const result = await runAstGraphQuery(ctx.repoRoot, query, {
        name: input.name,
        max_depth: input.depth,
        lang,
      });
      const rawRows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      for (const r of rawRows) allRows.push(r);
    }

    const filtered =
      input.minNameLen > 1
        ? allRows.filter((r: any[]) => String(r?.[3] ?? '').length >= input.minNameLen && String(r?.[4] ?? '').length >= input.minNameLen)
        : allRows;
    const rows = filtered.slice(0, input.limit);

    log.info('ast_graph_chain', {
      ok: true,
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      langs,
      direction: input.direction,
      max_depth: input.depth,
      rows: rows.length,
      min_name_len: input.minNameLen,
      duration_ms: Date.now() - startedAt,
    });

    return success({
      repoRoot: ctx.repoRoot,
      name: input.name,
      lang: input.lang,
      direction: input.direction,
      max_depth: input.depth,
      min_name_len: input.minNameLen,
      result: {
        headers: ['caller_id', 'callee_id', 'depth', 'caller_name', 'callee_name', 'lang'],
        rows,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('graph:chain', { ok: false, err: message });
    return error('graph_chain_failed', { message });
  }
}
