import fs from 'fs/promises';
import path from 'path';
import type { MatchConfidence, MatchType, SearchMatch } from '../../domain/search';
import type { LexicalSearchRequest, LexicalSearchResponse, LexicalSearchMode } from './types';
import { inferRuntimeLanguage, scanFiles } from './fileScanner';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(query: string, mode: LexicalSearchMode): RegExp {
  if (mode === 'regex') {
    return new RegExp(query, 'g');
  }

  if (mode === 'literal' || mode === 'substring') {
    return new RegExp(escapeRegex(query), 'g');
  }

  return new RegExp(`(^|[^A-Za-z0-9_$])(${escapeRegex(query)})(?=$|[^A-Za-z0-9_$])`, 'g');
}

function normalizeMode(mode?: LexicalSearchMode): LexicalSearchMode {
  return mode ?? 'substring';
}

function inferConfidence(mode: LexicalSearchMode): MatchConfidence {
  if (mode === 'exact' || mode === 'literal') return 'high';
  if (mode === 'regex') return 'medium';
  return 'medium';
}

function inferScore(mode: LexicalSearchMode): number {
  if (mode === 'exact') return 1;
  if (mode === 'literal') return 0.98;
  if (mode === 'regex') return 0.9;
  return 0.8;
}

function inferMatchType(mode: LexicalSearchMode): MatchType {
  if (mode === 'exact') return 'exact_token';
  if (mode === 'literal') return 'literal';
  if (mode === 'regex') return 'regex';
  return 'substring';
}

function inferWhyMatched(mode: LexicalSearchMode, filePath: string): string {
  if (mode === 'exact') return `Matched exact token in ${filePath}`;
  if (mode === 'literal') return `Matched literal string in ${filePath}`;
  if (mode === 'regex') return `Matched regex in ${filePath}`;
  return `Matched substring in ${filePath}`;
}

function inferSymbol(candidate: string): string | undefined {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate) ? candidate : undefined;
}

export async function lexicalSearch(
  repoRoot: string,
  request: LexicalSearchRequest,
): Promise<LexicalSearchResponse> {
  const mode = normalizeMode(request.mode);
  const limit = Math.max(1, request.limit ?? 20);
  const files = await scanFiles(repoRoot, request.lang ?? 'all', request.pathPattern ?? '**/*');
  const matcher = buildMatcher(request.query, mode);
  const matches: SearchMatch[] = [];

  for (const relPath of files) {
    if (matches.length >= limit) break;
    const absPath = path.join(repoRoot, relPath);
    let content = '';
    try {
      content = await fs.readFile(absPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length && matches.length < limit; lineIndex++) {
      const line = lines[lineIndex] ?? '';
      const lineMatches = Array.from(line.matchAll(matcher));
      if (lineMatches.length === 0) continue;

      const found = lineMatches[0]!;
      const fullMatch = mode === 'exact' ? (found[2] ?? request.query) : found[0];
      const column = (found.index ?? 0) + 1;
      matches.push({
        why_matched: inferWhyMatched(mode, relPath),
        match_type: inferMatchType(mode),
        evidence_type: 'content_match',
        score: inferScore(mode),
        path: relPath,
        range: {
          start: { line: lineIndex + 1, column },
          end: { line: lineIndex + 1, column: column + fullMatch.length - 1 },
        },
        symbol: inferSymbol(fullMatch),
        preview: line.trim(),
        confidence: inferConfidence(mode),
        lang: inferRuntimeLanguage(relPath) ?? undefined,
      });
    }
  }

  return {
    repoRoot: path.resolve(repoRoot),
    query: request.query,
    mode,
    matches,
    scannedFiles: files.length,
  };
}
