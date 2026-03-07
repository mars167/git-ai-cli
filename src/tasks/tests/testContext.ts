import { glob } from 'glob';
import type { EvidenceBundle } from '../../domain/context';
import type { TaskRequest } from '../../domain/tasks';
import type { SearchMatch } from '../../domain/search';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';

function isTestPath(filePath: string): boolean {
  return /\.(test|spec)\.[^.]+$/i.test(filePath);
}

function filterByPathHints(matches: SearchMatch[], pathHints?: string[]): SearchMatch[] {
  if (!pathHints || pathHints.length === 0) return matches;
  return matches.filter((match) => pathHints.some((hint) => match.path.startsWith(hint)));
}

export async function findTestsForTask(
  repoRoot: string,
  request: TaskRequest,
): Promise<EvidenceBundle> {
  const query = request.symbolHints?.[0] ?? request.query ?? '';
  const lexical = query
    ? await lexicalSearch(repoRoot, {
        query,
        mode: 'exact',
        pathPattern: '**/*',
        limit: 50,
      })
    : { matches: [] };

  let evidence = filterByPathHints(
    lexical.matches.filter((match) => isTestPath(match.path)),
    request.pathHints,
  );

  if (evidence.length === 0 && request.pathHints?.length) {
    const candidates = await glob('**/*', {
      cwd: repoRoot,
      nodir: true,
      posix: true,
      ignore: ['**/.git/**', '**/.git-ai/**', '**/node_modules/**', '**/dist/**'],
    });
    evidence = candidates
      .filter((candidate) => isTestPath(candidate))
      .filter((candidate) => request.pathHints?.some((hint) => candidate.startsWith(hint)))
      .map((candidate) => ({
        why_matched: `Matched test file path for ${query || 'task'}`,
        match_type: 'path' as const,
        evidence_type: 'path_match' as const,
        score: 0.7,
        path: candidate,
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
        preview: candidate,
        confidence: 'medium' as const,
      }));
  }

  return {
    task: 'find_tests',
    summary: query ? `Found tests related to ${query}` : 'Found candidate tests',
    evidence,
    related_paths: evidence.map((match) => match.path),
  };
}
