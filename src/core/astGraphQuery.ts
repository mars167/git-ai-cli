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

export function buildFindSymbolsQuery(): string {
  return `
?[ref_id, file, name, kind, signature, start_line, end_line] :=
  *ast_symbol{ref_id, file, name, kind, signature, start_line, end_line},
  starts_with(lowercase(name), lowercase($prefix))
`;
}

export function buildChildrenQuery(): string {
  return `
?[child_id, file, name, kind, signature, start_line, end_line] :=
  *ast_contains{parent_id: $parent_id, child_id},
  *ast_symbol{ref_id: child_id, file, name, kind, signature, start_line, end_line}
`;
}
