import type { ContextBundle } from '../../domain/context';
import type { TaskRequest } from '../../domain/tasks';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';
import {
  findImplementations,
  findImporters,
  findReferences,
} from '../../retrieval/symbol/navigation';

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
  const references = query
    ? await findReferences(repoRoot, { symbol: query, lang: 'auto', limit: 20 }).catch(() => ({
        repoRoot,
        query,
        mode: 'references',
        matches: [],
      }))
    : { repoRoot, query, mode: 'references', matches: [] };
  const importers = query
    ? await findImporters(repoRoot, { symbol: query, lang: 'auto', limit: 20 }).catch(() => ({
        repoRoot,
        query,
        mode: 'importers',
        matches: [],
      }))
    : { repoRoot, query, mode: 'importers', matches: [] };
  const implementations = query
    ? await findImplementations(repoRoot, { symbol: query, lang: 'auto', limit: 20 }).catch(() => ({
        repoRoot,
        query,
        mode: 'implementations',
        matches: [],
      }))
    : { repoRoot, query, mode: 'implementations', matches: [] };

  return {
    task: 'find_impact',
    summary: `Potential impact surface for ${query}`,
    sections: [
      {
        title: 'Candidate References',
        summary: `Potential references for ${query}`,
        evidence: matches.matches,
      },
      {
        title: 'Graph References',
        summary: `Reference matches for ${query}`,
        evidence: references.matches,
      },
      {
        title: 'Importers',
        summary: `Importer matches for ${query}`,
        evidence: importers.matches,
      },
      {
        title: 'Implementations',
        summary: `Implementation matches for ${query}`,
        evidence: implementations.matches,
      },
    ],
  };
}
