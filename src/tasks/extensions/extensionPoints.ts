import type { ContextBundle } from '../../domain/context';
import type { TaskRequest } from '../../domain/tasks';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';

export async function findExtensionPoints(
  repoRoot: string,
  request: TaskRequest,
): Promise<ContextBundle> {
  const query = request.query ?? request.symbolHints?.[0] ?? 'register';
  const matches = await lexicalSearch(repoRoot, {
    query,
    mode: 'substring',
    limit: 20,
  });

  return {
    task: 'find_extension_points',
    summary: `Candidate extension points for ${query}`,
    sections: [
      {
        title: 'Extension Points',
        summary: `Files that may expose extension hooks for ${query}`,
        evidence: matches.matches,
      },
    ],
  };
}
