import path from 'path';
import fs from 'fs-extra';
import { resolveGitRoot } from '../core/git';
import { checkIndex, resolveLangs, type IndexMetaV21, type IndexCheckResult } from '../core/indexCheck';
import type { CLIError } from './types';

export interface RepoContext {
  repoRoot: string;
  meta: IndexMetaV21 | null;
  indexStatus: IndexCheckResult;
}

/**
 * Resolve repository context from a path
 * 
 * This combines common operations:
 * 1. Resolve git root
 * 2. Check index status
 * 3. Load metadata
 * 
 * @param startPath - Path inside the repository (default: '.')
 * @returns Repository context or error
 */
export async function resolveRepoContext(startPath: string = '.'): Promise<RepoContext | CLIError> {
  try {
    const repoRoot = await resolveGitRoot(path.resolve(startPath));
    const status = await checkIndex(repoRoot);
    
    // Load metadata
    const metaPath = path.join(repoRoot, '.git-ai', 'meta.json');
    const meta = await fs.readJSON(metaPath).catch(() => null);

    return {
      repoRoot,
      meta,
      indexStatus: status,
    };
  } catch (e) {
    return {
      ok: false,
      reason: 'repo_resolution_failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Validate that index exists and is compatible
 * 
 * @param ctx - Repository context
 * @returns null if valid, error object if invalid
 */
export function validateIndex(ctx: RepoContext): CLIError | null {
  if (!ctx.indexStatus.ok) {
    const error: CLIError = {
      ok: false,
      reason: 'index_incompatible',
      message: 'Index is missing or incompatible. Run: git-ai ai index --overwrite',
    };
    return Object.assign(error, ctx.indexStatus);
  }
  return null;
}

/**
 * Resolve language selection from user input
 * 
 * @param meta - Repository metadata
 * @param langInput - User's language selection ('auto', 'all', or specific language)
 * @returns Array of resolved languages
 */
export function resolveLanguages(
  meta: RepoContext['meta'],
  langInput: string = 'auto'
): string[] {
  return resolveLangs(meta, langInput as any);
}

/**
 * Format an error for CLI output
 * 
 * @param error - Error object
 * @param code - Optional error code for categorization
 * @returns Formatted error object
 */
export function formatError(error: Error | unknown, code?: string): CLIError {
  const err = error instanceof Error
    ? { name: error.name, message: error.message }
    : { message: String(error) };

  return {
    ok: false,
    reason: code || 'error',
    ...err,
  };
}

/**
 * Common options shared across multiple commands
 */
export interface CommonOptions {
  path?: string;
  lang?: string;
}

/**
 * Parse and validate common options
 */
export function parseCommonOptions(options: Record<string, unknown>): CommonOptions {
  return {
    path: typeof options.path === 'string' ? options.path : '.',
    lang: typeof options.lang === 'string' ? options.lang : 'auto',
  };
}
