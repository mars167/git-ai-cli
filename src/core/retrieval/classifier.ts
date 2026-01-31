import type { ExtractedEntity, QueryPrimaryType, QueryType } from './types';

const STRUCTURAL_HINTS = ['callers', 'callees', 'call chain', 'inherit', 'extends', 'implements', 'graph', 'references', 'refs', 'ast'];
const HISTORICAL_HINTS = ['history', 'commit', 'diff', 'changed', 'evolution', 'dsr', 'timeline', 'version', 'previous'];
const SYMBOL_HINTS = ['function', 'class', 'method', 'symbol', 'identifier'];

const FILE_PATTERN = /(\S+\.(?:ts|tsx|js|jsx|java|py|go|rs|c|h|md|mdx|yaml|yml))/i;
const SYMBOL_PATTERN = /\b([A-Za-z_][A-Za-z0-9_$.]*)\b/g;

function scoreHints(query: string, hints: string[]): number {
  const q = query.toLowerCase();
  let score = 0;
  for (const h of hints) {
    if (q.includes(h)) score += 1;
  }
  return score;
}

function extractEntities(query: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const fileMatch = query.match(FILE_PATTERN);
  if (fileMatch?.[1]) {
    entities.push({ type: 'file', value: fileMatch[1], confidence: 0.8 });
  }

  const symbols = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = SYMBOL_PATTERN.exec(query)) !== null) {
    const token = m[1];
    if (!token) continue;
    if (token.length < 3) continue;
    if (/^(the|and|for|with|from|into|over|when|where|what|show)$/i.test(token)) continue;
    symbols.add(token);
  }
  for (const s of symbols) entities.push({ type: 'symbol', value: s, confidence: 0.5 });

  if (symbols.size === 0 && query.trim()) {
    entities.push({ type: 'keyword', value: query.trim(), confidence: 0.3 });
  }

  return entities;
}

function pickPrimary(scores: Record<QueryPrimaryType, number>): { primary: QueryPrimaryType; confidence: number } {
  const entries = Object.entries(scores) as Array<[QueryPrimaryType, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const second = entries[1];
  if (!top) return { primary: 'semantic', confidence: 0.25 };
  const confidence = top[1] <= 0 ? 0.25 : Math.min(0.95, 0.4 + top[1] * 0.2 - (second?.[1] ?? 0) * 0.1);
  return { primary: top[0], confidence };
}

export function classifyQuery(query: string): QueryType {
  const q = String(query ?? '').trim();
  const scores: Record<QueryPrimaryType, number> = {
    semantic: 0.5,
    structural: scoreHints(q, STRUCTURAL_HINTS),
    historical: scoreHints(q, HISTORICAL_HINTS),
    hybrid: 0,
  };

  const hasSymbols = scoreHints(q, SYMBOL_HINTS) > 0 || FILE_PATTERN.test(q);
  if (hasSymbols) scores.structural += 1;

  if (scores.structural > 0 && scores.historical > 0) {
    scores.hybrid = Math.max(scores.structural, scores.historical) + 1;
  }

  const primary = pickPrimary(scores);
  return {
    primary: primary.primary,
    confidence: primary.confidence,
    entities: extractEntities(q),
  };
}
