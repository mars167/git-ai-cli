import type { EvidenceBundle } from '../../domain/context';
import type { DiffTaskRequest, TaskResult } from '../../domain/tasks';
import type { SearchMatch } from '../../domain/search';
import { lexicalSearch } from '../../retrieval/lexical/lexicalSearch';
import { analyzeDiff } from '../diff/analyzeDiff';
import { findTestsForTask } from '../tests/testContext';

function fileEvidence(path: string): SearchMatch {
  return {
    why_matched: `Touched file from diff: ${path}`,
    match_type: 'path',
    evidence_type: 'path_match',
    score: 0.95,
    path,
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    preview: path,
    confidence: 'high',
  };
}

export async function buildReviewContextForDiff(
  repoRoot: string,
  request: DiffTaskRequest,
): Promise<TaskResult> {
  const diff = analyzeDiff(request.diffText);
  const evidence: SearchMatch[] = diff.touched_files.map((file) => fileEvidence(file.path));

  if (diff.touched_symbols.length > 0) {
    const primary = await lexicalSearch(repoRoot, {
      query: diff.touched_symbols[0]!,
      mode: 'exact',
      pathPattern: diff.touched_files[0]?.path ?? '**/*',
      limit: 10,
    });
    evidence.push(...primary.matches);
  }

  const tests = await findTestsForTask(repoRoot, {
    task: 'find_tests',
    query: diff.touched_symbols[0],
    pathHints: diff.touched_files.map((file) => file.path.replace(/\/[^/]+$/, '')),
    symbolHints: diff.touched_symbols.slice(0, 1),
  });
  evidence.push(...tests.evidence);

  const bundle: EvidenceBundle = {
    task: 'review_pr',
    summary: `Review context for ${diff.touched_files.length} changed file(s)`,
    evidence,
    related_paths: diff.touched_files.map((file) => file.path),
    diagnostics: diff.added_literals.length > 0 ? [`Added literals: ${diff.added_literals.join(', ')}`] : undefined,
  };

  return { bundle, diff };
}
