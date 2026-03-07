import type { ContextBundle, ContextSection } from '../../domain/context';
import type { TaskRequest } from '../../domain/tasks';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';
import { findDefinition, findExports } from '../../retrieval/symbol/navigation';
import { findTestsForTask } from '../tests/testContext';

function toPathPattern(pathHints?: string[]): string {
  if (!pathHints || pathHints.length === 0) return '**/*';
  return `${pathHints[0]}/**/*`;
}

export async function buildImplementationContext(
  repoRoot: string,
  request: TaskRequest,
): Promise<ContextBundle> {
  const query = request.symbolHints?.[0] ?? request.query ?? '';
  const primary = await lexicalSearch(repoRoot, {
    query,
    mode: 'exact',
    pathPattern: toPathPattern(request.pathHints),
    limit: 20,
  });
  const definitions = query
    ? await findDefinition(repoRoot, { symbol: query, lang: 'auto', limit: 10 }).catch(() => ({
        repoRoot,
        query,
        mode: 'definition',
        matches: [],
      }))
    : { repoRoot, query, mode: 'definition', matches: [] };
  const exports = query
    ? await findExports(repoRoot, { symbol: query, lang: 'auto', limit: 10 }).catch(() => ({
        repoRoot,
        query,
        mode: 'exports',
        matches: [],
      }))
    : { repoRoot, query, mode: 'exports', matches: [] };
  const tests = await findTestsForTask(repoRoot, request);

  const sections: ContextSection[] = [
    {
      title: 'Primary Matches',
      summary: `Primary implementation matches for ${query}`,
      evidence: primary.matches,
    },
  ];

  if (tests.evidence.length > 0) {
    sections.push({
      title: 'Related Tests',
      summary: `Related tests for ${query}`,
      evidence: tests.evidence,
    });
  }

  if (definitions.matches.length > 0) {
    sections.push({
      title: 'Definitions',
      summary: `Definitions for ${query}`,
      evidence: definitions.matches,
    });
  }

  if (exports.matches.length > 0) {
    sections.push({
      title: 'Exports',
      summary: `Exports related to ${query}`,
      evidence: exports.matches,
    });
  }

  return {
    task: 'implementation_context',
    summary: `Implementation context for ${query}`,
    sections,
  };
}
