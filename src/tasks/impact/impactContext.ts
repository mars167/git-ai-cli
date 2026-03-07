import type { ContextBundle } from '../../domain/context';
import type { TaskRequest } from '../../domain/tasks';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';

export async function buildImpactContext(
  repoRoot: string,
  request: TaskRequest,
): Promise<ContextBundle> {
  const query = request.symbolHints?.[0] ?? request.query ?? '';
  const matches = await lexicalSearch(repoRoot, {
    query,
    mode: 'exact',
    limit: 20,
  });

  return {
    task: 'find_impact',
    summary: `Potential impact surface for ${query}`,
    sections: [
      {
        title: 'Candidate References',
        summary: `Potential references for ${query}`,
        evidence: matches.matches,
      },
    ],
  };
}
