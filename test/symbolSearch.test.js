const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inferSymbolSearchMode,
  filterAndRankSymbolRows,
} = require('../dist/src/core/symbolSearch.js');

test('inferSymbolSearchMode auto-detects wildcard', () => {
  assert.equal(inferSymbolSearchMode('get*repo'), 'wildcard');
  assert.equal(inferSymbolSearchMode('getRepo'), 'substring');
});

test('wildcard mode supports * and ? with case-insensitive', () => {
  const rows = [
    { symbol: 'get_repo' },
    { symbol: 'getRepo' },
    { symbol: 'set_repo' },
  ];
  const out = filterAndRankSymbolRows(rows, { query: 'get*repo', mode: 'wildcard', caseInsensitive: true, limit: 50 });
  const syms = out.map(r => r.symbol);
  assert.deepEqual(syms.sort(), ['getRepo', 'get_repo'].sort());
});

test('prefix mode matches only prefix', () => {
  const rows = [
    { symbol: 'get_repo' },
    { symbol: 'forget_repo' },
  ];
  const out = filterAndRankSymbolRows(rows, { query: 'get_', mode: 'prefix', limit: 50 });
  assert.deepEqual(out.map(r => r.symbol), ['get_repo']);
});

test('regex mode filters by regex', () => {
  const rows = [
    { symbol: 'get_repo' },
    { symbol: 'getRepo' },
    { symbol: 'set_repo' },
  ];
  const out = filterAndRankSymbolRows(rows, { query: '^get.*repo$', mode: 'regex', caseInsensitive: true, limit: 50 });
  const syms = out.map(r => r.symbol);
  assert.deepEqual(syms.sort(), ['getRepo', 'get_repo'].sort());
});

test('fuzzy mode matches subsequence', () => {
  const rows = [
    { symbol: 'get_repo' },
    { symbol: 'set_repo' },
  ];
  const out = filterAndRankSymbolRows(rows, { query: 'gtrp', mode: 'fuzzy', limit: 50 });
  assert.deepEqual(out.map(r => r.symbol), ['get_repo']);
});

