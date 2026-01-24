import { openRepoCozoDb } from './cozo';

export async function runAstGraphQuery(repoRoot: string, query: string, params?: Record<string, any>): Promise<any> {
  const db = await openRepoCozoDb(repoRoot);
  if (!db) {
    throw new Error('AST graph is not available: Cozo backend not available (see .git-ai/cozo.error.json)');
  }
  try {
    return await db.run(query, params ?? {});
  } finally {
    if (db.close) await db.close();
  }
}

export function buildFindSymbolsQuery(lang?: string): string {
  return `
?[ref_id, file, lang, name, kind, signature, start_line, end_line] :=
  *ast_symbol{ref_id, file, lang, name, kind, signature, start_line, end_line},
  starts_with(lowercase(name), lowercase($prefix))${lang ? `,
  lowercase(lang) == lowercase($lang)` : ''}
`;
}

export function buildChildrenQuery(): string {
  return `
?[child_id, file, lang, name, kind, signature, start_line, end_line] :=
  *ast_contains{parent_id: $parent_id, child_id},
  *ast_symbol{ref_id: child_id, file, lang, name, kind, signature, start_line, end_line}
`;
}

export function buildFindReferencesQuery(lang?: string): string {
  return `
?[file, line, col, ref_kind, from_id, from_kind, from_name, from_lang] :=
  *ast_ref_name{from_id, from_lang, name, ref_kind, file, line, col},
  lowercase(name) == lowercase($name),
  *ast_symbol{ref_id: from_id, name: from_name, kind: from_kind, lang: from_lang}${lang ? `,
  lowercase(from_lang) == lowercase($lang)` : ''}

?[file, line, col, ref_kind, from_id, from_kind, from_name, from_lang] :=
  *ast_ref_name{from_id, from_lang, name, ref_kind, file, line, col},
  lowercase(name) == lowercase($name),
  *ast_file{file_id: from_id, file: from_name, lang: from_lang},
  from_kind = 'file'${lang ? `,
  lowercase(from_lang) == lowercase($lang)` : ''}
`;
}

export function buildCallersByNameQuery(lang?: string): string {
  return `
?[caller_id, caller_kind, caller_name, file, line, col, caller_lang] :=
  *ast_call_name{caller_id, caller_lang, callee_name, file, line, col},
  lowercase(callee_name) == lowercase($name),
  *ast_symbol{ref_id: caller_id, name: caller_name, kind: caller_kind, lang: caller_lang}${lang ? `,
  lowercase(caller_lang) == lowercase($lang)` : ''}

?[caller_id, caller_kind, caller_name, file, line, col, caller_lang] :=
  *ast_call_name{caller_id, caller_lang, callee_name, file, line, col},
  lowercase(callee_name) == lowercase($name),
  *ast_file{file_id: caller_id, file: caller_name, lang: caller_lang},
  caller_kind = 'file'${lang ? `,
  lowercase(caller_lang) == lowercase($lang)` : ''}
`;
}

export function buildCalleesByNameQuery(lang?: string): string {
  return `
?[caller_id, caller_lang, callee_id, callee_file, callee_name, callee_kind, file, line, col] :=
  *ast_symbol{ref_id: caller_id, name: caller_name, lang: caller_lang},
  lowercase(caller_name) == lowercase($name)${lang ? `, lowercase(caller_lang) == lowercase($lang)` : ''},
  *ast_call_name{caller_id, caller_lang, callee_name, file, line, col},
  *ast_symbol{ref_id: callee_id, file: callee_file, name: callee_name, kind: callee_kind, lang: caller_lang}
`;
}

export function buildCallChainByNameQuery(): string {
  throw new Error('Deprecated: use buildCallChainDownstreamByNameQuery or buildCallChainUpstreamByNameQuery');
}

export function buildCallChainDownstreamByNameQuery(): string {
  return `
start_ids[ref_id] :=
  *ast_symbol{ref_id, name, lang},
  lowercase(name) == lowercase($name),
  lowercase(lang) == lowercase($lang)

step[caller_id, callee_id, depth, lang] :=
  start_ids[caller_id],
  *ast_call_name{caller_id, caller_lang: lang, callee_name},
  *ast_symbol{ref_id: callee_id, name: callee_name, lang},
  depth = 1,
  lowercase(lang) == lowercase($lang)

step[caller_id, callee_id, depth, lang] :=
  step[prev_caller_id, prev_callee_id, d1, lang],
  *ast_call_name{caller_id: prev_callee_id, caller_lang: lang, callee_name},
  *ast_symbol{ref_id: callee_id, name: callee_name, lang},
  caller_id = prev_callee_id,
  depth = d1 + 1,
  depth <= $max_depth,
  lowercase(lang) == lowercase($lang)

?[caller_id, callee_id, depth, caller_name, callee_name, lang] :=
  step[caller_id, callee_id, depth, lang],
  *ast_symbol{ref_id: caller_id, name: caller_name, lang},
  *ast_symbol{ref_id: callee_id, name: callee_name, lang}
`;
}

export function buildCallChainUpstreamByNameQuery(): string {
  return `
start_ids[ref_id] :=
  *ast_symbol{ref_id, name, lang},
  lowercase(name) == lowercase($name),
  lowercase(lang) == lowercase($lang)

step[caller_id, callee_id, depth, lang] :=
  start_ids[callee_id],
  *ast_symbol{ref_id: callee_id, name: callee_name, lang},
  *ast_call_name{caller_id, caller_lang: lang, callee_name},
  depth = 1,
  lowercase(lang) == lowercase($lang)

step[caller_id, callee_id, depth, lang] :=
  step[prev_caller_id, prev_callee_id, d1, lang],
  *ast_symbol{ref_id: prev_caller_id, name: prev_name, lang},
  *ast_call_name{caller_id, caller_lang: lang, callee_name: prev_name},
  callee_id = prev_caller_id,
  depth = d1 + 1,
  depth <= $max_depth,
  lowercase(lang) == lowercase($lang)

?[caller_id, callee_id, depth, caller_name, callee_name, lang] :=
  step[caller_id, callee_id, depth, lang],
  *ast_symbol{ref_id: caller_id, name: caller_name, lang},
  *ast_symbol{ref_id: callee_id, name: callee_name, lang}
`;
}
