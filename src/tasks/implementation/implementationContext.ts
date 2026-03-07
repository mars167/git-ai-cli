import type { ContextBundle, ContextSection } from '../../domain/context';
import type { TaskRequest } from '../../domain/tasks';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';
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

  return {
    task: 'implementation_context',
    summary: `Implementation context for ${query}`,
    sections,
  };
}
