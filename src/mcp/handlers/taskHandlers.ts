import path from 'path';
import { createCodeContextEngine } from '../../retrieval/runtime';
import type { ToolHandler } from '../types';
import { errorResponse, successResponse } from '../types';
import { resolveGitRoot } from '../../core/git';
import type {
  FindExtensionPointsArgs,
  FindImpactArgs,
  FindTestsArgs,
  ImplementationContextArgs,
  LexicalSearchArgs,
  ReviewContextForDiffArgs,
} from '../schemas/taskSchemas';

async function resolveEngine(startDir: string) {
  const repoRoot = await resolveGitRoot(path.resolve(startDir));
  return createCodeContextEngine({ repoRoot });
}

export const handleLexicalSearch: ToolHandler<LexicalSearchArgs> = async (args) => {
  try {
    const engine = await resolveEngine(args.path);
    const result = await engine.search.lexical({
      query: args.query,
      mode: args.mode,
      lang: args.lang,
      pathPattern: args.path_pattern,
      limit: args.limit,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
};

export const handleImplementationContext: ToolHandler<ImplementationContextArgs> = async (args) => {
  try {
    const engine = await resolveEngine(args.path);
    const result = await engine.tasks.implementationContext({
      task: 'implementation_context',
      query: args.query,
      pathHints: args.path_hints,
      symbolHints: args.symbol_hints,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
};

export const handleFindTests: ToolHandler<FindTestsArgs> = async (args) => {
  try {
    const engine = await resolveEngine(args.path);
    const result = await engine.tasks.findTests({
      task: 'find_tests',
      query: args.query,
      pathHints: args.path_hints,
      symbolHints: args.symbol_hints,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
};

export const handleFindImpact: ToolHandler<FindImpactArgs> = async (args) => {
  try {
    const engine = await resolveEngine(args.path);
    const result = await engine.tasks.findImpact({
      task: 'find_impact',
      query: args.query,
      pathHints: args.path_hints,
      symbolHints: args.symbol_hints,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
};

export const handleFindExtensionPoints: ToolHandler<FindExtensionPointsArgs> = async (args) => {
  try {
    const engine = await resolveEngine(args.path);
    const result = await engine.tasks.findExtensionPoints({
      task: 'find_extension_points',
      query: args.query,
      pathHints: args.path_hints,
      symbolHints: args.symbol_hints,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
};

export const handleReviewContextForDiff: ToolHandler<ReviewContextForDiffArgs> = async (args) => {
  try {
    const engine = await resolveEngine(args.path);
    const result = await engine.tasks.reviewContextForDiff({
      task: 'review_pr',
      query: args.query,
      diffText: args.diff_text,
      pathHints: args.path_hints,
      symbolHints: args.symbol_hints,
    });
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
};
