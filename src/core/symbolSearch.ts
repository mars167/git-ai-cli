export type SymbolSearchMode = 'substring' | 'prefix' | 'wildcard' | 'regex' | 'fuzzy';

export interface SymbolSearchParams {
  query: string;
  mode?: SymbolSearchMode;
  caseInsensitive?: boolean;
  limit?: number;
  maxCandidates?: number;
}

export function inferSymbolSearchMode(query: string, mode?: SymbolSearchMode): SymbolSearchMode {
  if (mode) return mode;
  if (query.includes('*') || query.includes('?')) return 'wildcard';
  return 'substring';
}

function escapeQuotes(s: string): string {
  return s.replace(/'/g, "''");
}

function extractTokens(s: string): string[] {
  const tokens = s.match(/[A-Za-z0-9_$.]+/g) ?? [];
  return tokens.map(t => t.trim()).filter(Boolean);
}

export function pickCoarseToken(query: string): string {
  const tokens = extractTokens(query);
  if (tokens.length === 0) return '';
  let best = tokens[0]!;
  for (const t of tokens) if (t.length > best.length) best = t;
  return best;
}

/**
 * Strip common language keywords from queries to improve search results.
 * Examples: "class Project" -> "Project", "function handleAuth" -> "handleAuth"
 */
const KEYWORD_PATTERNS = [
  // Type declarations
  /^(?:class|interface|type|enum|struct|trait)\s+/i,
  // Function declarations
  /^(?:function|method|def|func|fn|async\s+function|export\s+function|export\s+async\s+function)\s+/i,
  // Variable declarations
  /^(?:const|let|var|val|export\s+const|export\s+let|export\s+var)\s+/i,
  // Modifiers
  /^(?:public|private|protected|static|readonly|abstract)\s+/i,
];

export function stripLanguageKeywords(query: string): string {
  let q = query.trim();
  
  // Apply patterns iteratively to handle multiple keywords
  // e.g., "export const MY_VAR" -> "MY_VAR"
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    for (const pattern of KEYWORD_PATTERNS) {
      const newQ = q.replace(pattern, '');
      if (newQ !== q) {
        q = newQ.trim();
        changed = true;
        break;
      }
    }
    iterations++;
  }
  
  return q;
}

export function buildCoarseWhere(params: SymbolSearchParams): string | null {
  const q = String(params.query ?? '');
  const mode = inferSymbolSearchMode(q, params.mode);
  const safe = escapeQuotes(q);
  const likeOp = params.caseInsensitive ? 'ILIKE' : 'LIKE';

  if (mode === 'prefix') {
    if (!safe) return null;
    return `symbol ${likeOp} '${safe}%'`;
  }

  if (mode === 'substring') {
    if (!safe) return null;
    return `symbol ${likeOp} '%${safe}%'`;
  }

  const token = pickCoarseToken(q);
  if (!token) return null;
  const tokenSafe = escapeQuotes(token);
  return `symbol ${likeOp} '%${tokenSafe}%'`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(pattern: string, caseInsensitive: boolean): RegExp | null {
  try {
    const body = pattern
      .split('')
      .map(ch => {
        if (ch === '*') return '.*';
        if (ch === '?') return '.';
        return escapeRegex(ch);
      })
      .join('');
    const flags = caseInsensitive ? 'i' : '';
    return new RegExp(`^${body}$`, flags);
  } catch {
    return null;
  }
}

function buildRegex(pattern: string, caseInsensitive: boolean): RegExp | null {
  try {
    const flags = caseInsensitive ? 'i' : '';
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function normalizeForFuzzy(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_$.]+/g, '');
}

function fuzzySubsequenceScore(needle: string, haystack: string): number {
  if (!needle) return 0;
  let i = 0;
  let score = 0;
  let lastMatch = -2;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) {
      score += (j === lastMatch + 1) ? 2 : 1;
      lastMatch = j;
      i++;
    }
  }
  if (i < needle.length) return -1;
  return score;
}

export function filterAndRankSymbolRows<T extends Record<string, any>>(rows: T[], params: SymbolSearchParams): T[] {
  // Strip language keywords from query for better matching
  // e.g., "class Project" -> "Project", "function handleAuth" -> "handleAuth"
  const qRaw = stripLanguageKeywords(String(params.query ?? ''));
  const mode = inferSymbolSearchMode(qRaw, params.mode);
  const limit = Math.max(1, Number(params.limit ?? 50));
  const caseInsensitive = Boolean(params.caseInsensitive);

  const getSymbol = (r: any) => String(r?.symbol ?? r?.name ?? '');

  if (mode === 'substring' || mode === 'prefix') {
    const q = caseInsensitive ? qRaw.toLowerCase() : qRaw;
    const out = rows.filter(r => {
      const s = getSymbol(r);
      const ss = caseInsensitive ? s.toLowerCase() : s;
      return mode === 'prefix' ? ss.startsWith(q) : ss.includes(q);
    });
    return out.slice(0, limit);
  }

  if (mode === 'wildcard') {
    const re = globToRegex(qRaw, caseInsensitive);
    if (!re) return [];
    const out = rows.filter(r => re.test(getSymbol(r)));
    return out.slice(0, limit);
  }

  if (mode === 'regex') {
    const re = buildRegex(qRaw, caseInsensitive);
    if (!re) return [];
    const out = rows.filter(r => re.test(getSymbol(r)));
    return out.slice(0, limit);
  }

  const q = normalizeForFuzzy(qRaw);
  const scored = rows
    .map(r => {
      const s = normalizeForFuzzy(getSymbol(r));
      const score = fuzzySubsequenceScore(q, s);
      return { r, score };
    })
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(x => x.r);
}
