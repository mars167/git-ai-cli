import type { QueryType } from './types';

const ABBREVIATIONS: Record<string, string> = {
  cfg: 'configuration',
  auth: 'authentication',
  repo: 'repository',
  svc: 'service',
  impl: 'implementation',
  dep: 'dependency',
  deps: 'dependencies',
  doc: 'documentation',
  docs: 'documentation',
  api: 'interface',
  ui: 'user interface',
  ux: 'user experience',
};

const SYNONYMS: Record<string, string[]> = {
  bug: ['issue', 'error', 'fault'],
  fix: ['resolve', 'repair', 'patch'],
  config: ['configuration', 'settings'],
  search: ['lookup', 'find', 'query'],
  history: ['timeline', 'evolution', 'past'],
  commit: ['revision', 'changeset'],
  graph: ['relations', 'edges', 'call graph'],
  symbol: ['identifier', 'name'],
};

const DOMAIN_VOCAB: Record<string, string[]> = {
  lancedb: ['vector database', 'lance db'],
  cozo: ['graph database', 'cozodb'],
  ast: ['syntax tree', 'abstract syntax tree'],
};

function tokenize(query: string): string[] {
  return String(query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function expandToken(token: string): string[] {
  const expansions = new Set<string>();
  expansions.add(token);
  const abbr = ABBREVIATIONS[token];
  if (abbr) expansions.add(abbr);
  const syns = SYNONYMS[token];
  if (syns) syns.forEach((s) => expansions.add(s));
  const domain = DOMAIN_VOCAB[token];
  if (domain) domain.forEach((s) => expansions.add(s));
  return Array.from(expansions);
}

function buildExpansion(query: string): string[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [query];
  const expandedTokens = tokens.flatMap((t) => expandToken(t));
  const unique = Array.from(new Set(expandedTokens));
  return unique.length > 0 ? unique : tokens;
}

export function expandQuery(query: string, queryType?: QueryType): string[] {
  const base = String(query ?? '').trim();
  if (!base) return [];
  const expansions = new Set<string>();
  expansions.add(base);
  for (const token of buildExpansion(base)) expansions.add(token);

  if (queryType?.primary === 'historical') {
    expansions.add(`${base} history`);
    expansions.add(`${base} commit`);
  }

  if (queryType?.primary === 'structural') {
    expansions.add(`${base} graph`);
    expansions.add(`${base} references`);
  }

  return Array.from(expansions).slice(0, 12);
}
