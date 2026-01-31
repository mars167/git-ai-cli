import test from 'node:test';
import assert from 'node:assert/strict';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { classifyQuery } from '../dist/src/core/retrieval/classifier.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { expandQuery } from '../dist/src/core/retrieval/expander.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { computeWeights } from '../dist/src/core/retrieval/weights.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { fuseResults } from '../dist/src/core/retrieval/fuser.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { rerank } from '../dist/src/core/retrieval/reranker.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { runAdaptiveRetrieval } from '../dist/src/core/search.js';
import type { QueryType, RetrievalResult } from '../src/core/retrieval/types';

test('classifyQuery identifies historical intent', () => {
  const res = classifyQuery('commit history for parseFile');
  assert.equal(res.primary, 'historical');
  assert.ok(res.confidence > 0.3);
  assert.ok(res.entities.length > 0);
});

test('classifyQuery identifies structural intent', () => {
  const res = classifyQuery('callers of authenticateUser');
  assert.equal(res.primary, 'structural');
});

test('expandQuery resolves abbreviations and synonyms', () => {
  const expanded = expandQuery('auth cfg');
  assert.ok(expanded.some((e) => e.includes('authentication')));
  assert.ok(expanded.some((e) => e.includes('configuration')));
});

test('computeWeights emphasizes historical queries', () => {
  const queryType: QueryType = { primary: 'historical', confidence: 0.8, entities: [] };
  const weights = computeWeights(queryType);
  assert.ok(weights.dsrWeight > weights.graphWeight);
  const sum = weights.vectorWeight + weights.graphWeight + weights.dsrWeight + weights.symbolWeight;
  assert.ok(Math.abs(sum - 1) < 1e-6);
});

test('fuseResults ranks by weighted source', () => {
  const candidates: RetrievalResult[] = [
    { source: 'vector', id: 'v1', score: 0.9, text: 'vector result' },
    { source: 'graph', id: 'g1', score: 0.4, text: 'graph result' },
    { source: 'dsr', id: 'd1', score: 0.7, text: 'dsr result' },
  ];
  const weights = { vectorWeight: 0.2, graphWeight: 0.5, dsrWeight: 0.2, symbolWeight: 0.1 };
  const fused = fuseResults(candidates, weights, 3);
  assert.equal(fused[0]?.source, 'graph');
});

test('rerank boosts lexical overlap', () => {
  const candidates: RetrievalResult[] = [
    { source: 'vector', id: 'a', score: 0.5, text: 'auth service' },
    { source: 'vector', id: 'b', score: 0.5, text: 'database pool' },
  ];
  const ranked = rerank('auth', candidates, { query: 'auth', limit: 2 });
  assert.equal(ranked[0]?.id, 'a');
});

test('runAdaptiveRetrieval produces fused and reranked results', () => {
  const candidates: RetrievalResult[] = [
    { source: 'vector', id: 'vec', score: 0.8, text: 'semantic auth flow' },
    { source: 'graph', id: 'graph', score: 0.7, text: 'callers of auth' },
  ];
  const out = runAdaptiveRetrieval('auth flow', candidates, { limit: 2 });
  assert.equal(out.query, 'auth flow');
  assert.ok(out.weights.vectorWeight > 0);
  assert.equal(out.results.length, 2);
});
