import type { ToolHandler } from '../types';
import { successResponse, errorResponse } from '../types';
import type {
  AstGraphQueryArgs,
  AstGraphFindArgs,
  AstGraphChildrenArgs,
  AstGraphRefsArgs,
  AstGraphCallersArgs,
  AstGraphCalleesArgs,
  AstGraphChainArgs
} from '../schemas';
import { resolveGitRoot } from '../../core/git';
import {
  runAstGraphQuery,
  buildFindSymbolsQuery,
  buildChildrenQuery,
  buildFindReferencesQuery,
  buildCallersByNameQuery,
  buildCalleesByNameQuery,
  buildCallChainDownstreamByNameQuery,
  buildCallChainUpstreamByNameQuery
} from '../../core/astGraphQuery';
import { checkIndex, resolveLangs } from '../../core/indexCheck';
import { sha256Hex } from '../../core/crypto';
import { toPosixPath } from '../../core/paths';
import path from 'path';

export const handleAstGraphQuery: ToolHandler<AstGraphQueryArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const query = args.query;
  const params = args.params ?? {};
  const result = await runAstGraphQuery(repoRoot, query, params);

  return successResponse({
    repoRoot,
    result
  });
};

export const handleAstGraphFind: ToolHandler<AstGraphFindArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const prefix = args.prefix;
  const limit = args.limit ?? 50;
  const langSel = args.lang ?? 'auto';

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const allRows: any[] = [];

  for (const lang of langs) {
    const result = await runAstGraphQuery(
      repoRoot,
      buildFindSymbolsQuery(lang),
      { prefix, lang }
    );
    const rows = Array.isArray((result as any)?.rows)
      ? (result as any).rows
      : [];
    for (const r of rows) {
      allRows.push(r);
    }
  }

  return successResponse({
    repoRoot,
    lang: langSel,
    result: {
      headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'],
      rows: allRows.slice(0, limit)
    }
  });
};

export const handleAstGraphChildren: ToolHandler<AstGraphChildrenArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const id = args.id;
  const asFile = args.as_file ?? false;
  const parent_id = asFile
    ? sha256Hex(`file:${toPosixPath(id)}`)
    : id;
  const result = await runAstGraphQuery(repoRoot, buildChildrenQuery(), {
    parent_id
  });

  return successResponse({
    repoRoot,
    parent_id,
    result
  });
};

export const handleAstGraphRefs: ToolHandler<AstGraphRefsArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const target = args.name;
  const limit = args.limit ?? 200;
  const langSel = args.lang ?? 'auto';

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const allRows: any[] = [];

  for (const lang of langs) {
    const result = await runAstGraphQuery(
      repoRoot,
      buildFindReferencesQuery(lang),
      { name: target, lang }
    );
    const rows = Array.isArray((result as any)?.rows)
      ? (result as any).rows
      : [];
    for (const r of rows) {
      allRows.push(r);
    }
  }

  return successResponse({
    repoRoot,
    name: target,
    lang: langSel,
    result: {
      headers: ['file', 'line', 'col', 'ref_kind', 'from_id', 'from_kind', 'from_name', 'from_lang'],
      rows: allRows.slice(0, limit)
    }
  });
};

export const handleAstGraphCallers: ToolHandler<AstGraphCallersArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const target = args.name;
  const limit = args.limit ?? 200;
  const langSel = args.lang ?? 'auto';

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const allRows: any[] = [];

  for (const lang of langs) {
    const result = await runAstGraphQuery(
      repoRoot,
      buildCallersByNameQuery(lang),
      { name: target, lang }
    );
    const rows = Array.isArray((result as any)?.rows)
      ? (result as any).rows
      : [];
    for (const r of rows) {
      allRows.push(r);
    }
  }

  return successResponse({
    repoRoot,
    name: target,
    lang: langSel,
    result: {
      headers: ['caller_id', 'caller_kind', 'caller_name', 'file', 'line', 'col', 'caller_lang'],
      rows: allRows.slice(0, limit)
    }
  });
};

export const handleAstGraphCallees: ToolHandler<AstGraphCalleesArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const target = args.name;
  const limit = args.limit ?? 200;
  const langSel = args.lang ?? 'auto';

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const allRows: any[] = [];

  for (const lang of langs) {
    const result = await runAstGraphQuery(
      repoRoot,
      buildCalleesByNameQuery(lang),
      { name: target, lang }
    );
    const rows = Array.isArray((result as any)?.rows)
      ? (result as any).rows
      : [];
    for (const r of rows) {
      allRows.push(r);
    }
  }

  return successResponse({
    repoRoot,
    name: target,
    lang: langSel,
    result: {
      headers: ['caller_id', 'caller_lang', 'callee_id', 'callee_file', 'callee_name', 'callee_kind', 'file', 'line', 'col'],
      rows: allRows.slice(0, limit)
    }
  });
};

export const handleAstGraphChain: ToolHandler<AstGraphChainArgs> = async (args) => {
  const repoRoot = await resolveGitRoot(path.resolve(args.path));
  const target = args.name;
  const direction = args.direction ?? 'downstream';
  const maxDepth = args.max_depth ?? 3;
  const limit = args.limit ?? 500;
  const minNameLen = Math.max(1, args.min_name_len ?? 1);
  const langSel = args.lang ?? 'auto';

  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return errorResponse(
      new Error('Index incompatible or missing'),
      'index_incompatible'
    );
  }

  const langs = resolveLangs(status.found.meta ?? null, langSel as any);
  const query =
    direction === 'upstream'
      ? buildCallChainUpstreamByNameQuery()
      : buildCallChainDownstreamByNameQuery();
  const rawRows: any[] = [];

  for (const lang of langs) {
    const result = await runAstGraphQuery(repoRoot, query, {
      name: target,
      max_depth: maxDepth,
      lang
    });
    const rows = Array.isArray((result as any)?.rows)
      ? (result as any).rows
      : [];
    for (const r of rows) {
      rawRows.push(r);
    }
  }

  const filtered =
    minNameLen > 1
      ? rawRows.filter(
          (r: any[]) =>
            String(r?.[3] ?? '').length >= minNameLen &&
            String(r?.[4] ?? '').length >= minNameLen
        )
      : rawRows;
  const rows = filtered.slice(0, limit);

  return successResponse({
    repoRoot,
    name: target,
    lang: langSel,
    direction,
    max_depth: maxDepth,
    min_name_len: minNameLen,
    result: {
      headers: ['caller_id', 'callee_id', 'depth', 'caller_name', 'callee_name', 'lang'],
      rows
    }
  });
};
