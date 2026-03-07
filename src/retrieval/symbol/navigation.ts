import type { SearchMatch, SearchResultSet } from '../../domain/search';
import type { RuntimeLanguage } from '../lexical/types';
import {
  buildContainingScopeQuery,
  buildDefinitionsByNameQuery,
  buildFindReferencesQuery,
  runAstGraphQuery,
} from '../../core/astGraphQuery';
import { checkIndex, resolveLangs } from '../../core/indexCheck';
import {
  findExportsHeuristically,
  findImplementationsHeuristically,
  findImportersHeuristically,
} from './graphCapabilities';

export interface SymbolNavigationRequest {
  symbol: string;
  lang?: RuntimeLanguage | 'auto';
  limit?: number;
}

export interface ContainingScopeRequest {
  file: string;
  line: number;
  lang?: RuntimeLanguage | 'auto';
  limit?: number;
}

function toGraphLangs(lang?: RuntimeLanguage | 'auto'): Array<'ts' | 'java'> {
  if (!lang || lang === 'auto' || lang === 'all') return ['ts', 'java'];
  if (lang === 'ts' || lang === 'java') return [lang];
  return [];
}

function definitionToMatch(row: any[]): SearchMatch {
  const [, file, lang, name, kind, signature, startLine, endLine] = row;
  return {
    why_matched: `AST definition match for ${name}`,
    match_type: 'exact_token',
    evidence_type: 'symbol_match',
    score: 0.99,
    path: String(file),
    range: {
      start: { line: Number(startLine), column: 1 },
      end: { line: Number(endLine), column: 1 },
    },
    symbol: String(name),
    preview: [kind, name, signature].filter(Boolean).join(' '),
    confidence: 'high',
    lang: String(lang),
  };
}

function referenceToMatch(target: string, row: any[]): SearchMatch {
  const [file, line, col, refKind, , fromKind, fromName, fromLang] = row;
  return {
    why_matched: `AST reference match for ${target}`,
    match_type: 'exact_token',
    evidence_type: 'graph_match',
    score: 0.92,
    path: String(file),
    range: {
      start: { line: Number(line), column: Number(col) },
      end: { line: Number(line), column: Number(col) + String(target).length },
    },
    symbol: String(fromName),
    preview: `${String(fromKind)} ${String(fromName)} references ${target} (${String(refKind)})`,
    confidence: 'high',
    lang: String(fromLang),
  };
}

function containingScopeToMatch(row: any[]): SearchMatch {
  const [file, lang, name, kind, signature, startLine, endLine] = row;
  return {
    why_matched: `Containing scope for line ${startLine}-${endLine}`,
    match_type: 'path',
    evidence_type: 'symbol_match',
    score: 0.9,
    path: String(file),
    range: {
      start: { line: Number(startLine), column: 1 },
      end: { line: Number(endLine), column: 1 },
    },
    symbol: String(name),
    preview: [kind, name, signature].filter(Boolean).join(' '),
    confidence: 'high',
    lang: String(lang),
  };
}

function uniqueMatches(matches: SearchMatch[]): SearchMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = [match.path, match.range.start.line, match.range.end.line, match.symbol, match.preview].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function assertGraphReady(repoRoot: string): Promise<void> {
  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    throw new Error('Index incompatible or missing');
  }
}

export async function findDefinition(
  repoRoot: string,
  request: SymbolNavigationRequest,
): Promise<SearchResultSet> {
  await assertGraphReady(repoRoot);
  const langs = toGraphLangs(request.lang);
  const rows: any[] = [];
  for (const lang of langs) {
    const result = await runAstGraphQuery(repoRoot, buildDefinitionsByNameQuery(lang), {
      name: request.symbol,
      lang,
    });
    rows.push(...(((result as any)?.rows ?? []) as any[]));
  }

  return {
    repoRoot,
    query: request.symbol,
    mode: 'definition',
    matches: uniqueMatches(rows.slice(0, request.limit ?? 25).map(definitionToMatch)),
  };
}

export async function findReferences(
  repoRoot: string,
  request: SymbolNavigationRequest,
): Promise<SearchResultSet> {
  await assertGraphReady(repoRoot);
  const langs = toGraphLangs(request.lang);
  const rows: any[] = [];
  for (const lang of langs) {
    const result = await runAstGraphQuery(repoRoot, buildFindReferencesQuery(lang), {
      name: request.symbol,
      lang,
    });
    rows.push(...(((result as any)?.rows ?? []) as any[]));
  }

  return {
    repoRoot,
    query: request.symbol,
    mode: 'references',
    matches: uniqueMatches(rows.slice(0, request.limit ?? 50).map((row) => referenceToMatch(request.symbol, row))),
  };
}

export async function findContainingScope(
  repoRoot: string,
  request: ContainingScopeRequest,
): Promise<SearchResultSet> {
  await assertGraphReady(repoRoot);
  const langs = toGraphLangs(request.lang);
  const rows: any[] = [];
  for (const lang of langs) {
    const result = await runAstGraphQuery(repoRoot, buildContainingScopeQuery(lang), {
      file: request.file,
      line: request.line,
      lang,
    });
    rows.push(...(((result as any)?.rows ?? []) as any[]));
  }

  rows.sort((a, b) => {
    const aStart = Number(a[5]);
    const aEnd = Number(a[6]);
    const bStart = Number(b[5]);
    const bEnd = Number(b[6]);
    const aSpan = aEnd - aStart;
    const bSpan = bEnd - bStart;
    return aSpan - bSpan || bStart - aStart;
  });

  return {
    repoRoot,
    query: `${request.file}:${request.line}`,
    mode: 'containing_scope',
    matches: uniqueMatches(rows.slice(0, request.limit ?? 10).map(containingScopeToMatch)),
  };
}

export async function findImplementations(repoRoot: string, request: SymbolNavigationRequest) {
  return findImplementationsHeuristically(repoRoot, request);
}

export async function findImporters(repoRoot: string, request: SymbolNavigationRequest) {
  return findImportersHeuristically(repoRoot, request);
}

export async function findExports(repoRoot: string, request: SymbolNavigationRequest) {
  return findExportsHeuristically(repoRoot, request);
}
