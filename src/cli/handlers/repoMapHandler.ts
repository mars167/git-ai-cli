import path from 'path';
import fs from 'fs-extra';
import type { RepoMapInput } from '../schemas/repoMapSchema';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';
import { resolveRepoContext, validateIndex } from '../helpers';
import { generateRepoMap, formatRepoMap } from '../../core/repoMap';

function resolveWikiDir(repoRoot: string, wikiOpt: string): string {
  const w = String(wikiOpt ?? '').trim();
  if (w) return path.resolve(repoRoot, w);
  const candidates = [path.join(repoRoot, 'docs', 'wiki'), path.join(repoRoot, 'wiki')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

export async function handleRepoMap(input: RepoMapInput): Promise<CLIResult | CLIError> {
  const ctxResult = await resolveRepoContext(input.path);
  
  if (!('indexStatus' in ctxResult)) {
    return error('repo_not_found', { path: input.path });
  }
  
  const ctx = ctxResult as { repoRoot: string; meta: unknown; indexStatus: { ok: boolean } };

  const validationError = validateIndex(ctx as Parameters<typeof validateIndex>[0]);
  if (validationError) {
    return validationError;
  }

  const wikiDir = resolveWikiDir(ctx.repoRoot, input.wiki);

  try {
    const files = await generateRepoMap({
      repoRoot: ctx.repoRoot,
      maxFiles: input.maxFiles,
      maxSymbolsPerFile: input.maxSymbols,
      wikiDir: wikiDir || undefined,
      depth: input.depth,
      maxNodes: input.maxNodes,
    });

    return success({
      repoRoot: ctx.repoRoot,
      files,
      formatted: formatRepoMap(files),
    });
  } catch (e: any) {
    return error('repo_map_failed', { message: String(e?.message ?? e) });
  }
}
