import type { RuntimeLanguage } from '../lexical/types';
import type { SearchMatch, SearchResultSet } from '../../domain/search';
import { lexicalSearch } from '../lexical/lexicalSearch';

export interface SymbolNavigationRequest {
  symbol: string;
  lang?: RuntimeLanguage | 'auto';
  limit?: number;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupeMatches(matches: SearchMatch[]): SearchMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = [match.path, match.range.start.line, match.range.start.column, match.symbol, match.why_matched].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function heuristicSearch(
  repoRoot: string,
  request: SymbolNavigationRequest,
  query: string,
  why: string,
  confidence: SearchMatch['confidence'],
): Promise<SearchResultSet> {
  const result = await lexicalSearch(repoRoot, {
    query,
    mode: 'regex',
    lang: request.lang === 'auto' ? 'all' : request.lang,
    limit: request.limit ?? 25,
  });

  return {
    repoRoot,
    query: request.symbol,
    mode: 'heuristic',
    matches: dedupeMatches(
      result.matches.map((match) => ({
        ...match,
        evidence_type: 'graph_match',
        why_matched: why,
        confidence,
      })),
    ),
  };
}

export async function findImplementationsHeuristically(
  repoRoot: string,
  request: SymbolNavigationRequest,
): Promise<SearchResultSet> {
  const symbol = escapeRegex(request.symbol);
  return heuristicSearch(
    repoRoot,
    request,
    `(?:implements|extends)\\s+${symbol}\\b`,
    `Heuristic implementation match for ${request.symbol}`,
    'medium',
  );
}

export async function findImportersHeuristically(
  repoRoot: string,
  request: SymbolNavigationRequest,
): Promise<SearchResultSet> {
  const symbol = escapeRegex(request.symbol);
  return heuristicSearch(
    repoRoot,
    request,
    `(?:import|require).*\\b${symbol}\\b`,
    `Heuristic importer match for ${request.symbol}`,
    'medium',
  );
}

export async function findExportsHeuristically(
  repoRoot: string,
  request: SymbolNavigationRequest,
): Promise<SearchResultSet> {
  const symbol = escapeRegex(request.symbol);
  return heuristicSearch(
    repoRoot,
    request,
    `(?:export\\s+(?:async\\s+)?(?:function|class|const|interface|type|enum)|module\\.exports|exports\\.).*\\b${symbol}\\b`,
    `Heuristic export match for ${request.symbol}`,
    'medium',
  );
}
