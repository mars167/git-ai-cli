import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { CrossEncoderReranker, LruCache } from '../dist/src/core/retrieval/index.js';
import type { Candidate } from '../src/core/retrieval/reranker';

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

test('reranker uses cached scores for ranking quality', async () => {
  const cache = new LruCache(8);
  const reranker = new CrossEncoderReranker({
    modelName: 'non-existent-model.onnx',
    device: 'cpu',
    batchSize: 2,
    topK: 5,
    scoreWeights: { original: 0.3, crossEncoder: 0.7 },
  }, cache);
  const candidates: Candidate[] = [
    { id: 'a', content: 'authentication service', filePath: 'src/auth.ts', score: 0.5 },
    { id: 'b', content: 'database connection pool', filePath: 'src/db.ts', score: 0.5 },
  ];
  const cacheKey = sha256Hex(JSON.stringify([
    ['authentication flow', 'authentication service'],
    ['authentication flow', 'database connection pool'],
  ]));
  cache.set(cacheKey, [0.9, 0.1]);
  const results = await reranker.rerank('authentication flow', candidates);
  assert.equal(results[0]?.id, 'a');
  reranker.dispose();
});

test('reranker batch preserves ordering per query', async () => {
  const cache = new LruCache(8);
  const reranker = new CrossEncoderReranker({
    modelName: 'non-existent-model.onnx',
    device: 'cpu',
    batchSize: 2,
    topK: 3,
    scoreWeights: { original: 0.3, crossEncoder: 0.7 },
  }, cache);
  const batch: Candidate[][] = [
    [
      { id: 'a', content: 'auth helper', filePath: 'src/auth.ts', score: 0.2 },
      { id: 'b', content: 'cache helper', filePath: 'src/cache.ts', score: 0.2 },
    ],
    [
      { id: 'x', content: 'graph query', filePath: 'src/graph.ts', score: 0.5 },
      { id: 'y', content: 'semantic search', filePath: 'src/search.ts', score: 0.5 },
    ],
  ];
  const keyOne = sha256Hex(JSON.stringify([
    ['auth', 'auth helper'],
    ['auth', 'cache helper'],
  ]));
  const keyTwo = sha256Hex(JSON.stringify([
    ['semantic', 'graph query'],
    ['semantic', 'semantic search'],
  ]));
  cache.set(keyOne, [0.8, 0.2]);
  cache.set(keyTwo, [0.1, 0.9]);
  const results = await reranker.rerankBatch(['auth', 'semantic'], batch);
  assert.equal(results.length, 2);
  assert.equal(results[0]?.[0]?.id, 'a');
  assert.equal(results[1]?.[0]?.id, 'y');
  reranker.dispose();
});

test('reranker uses cache for repeated calls', async () => {
  let setCount = 0;
  const store = new Map<string, number[]>();
  const cache = {
    get: (key: string) => store.get(key),
    set: (key: string, value: number[]) => {
      setCount += 1;
      store.set(key, value);
    },
    clear: () => store.clear(),
  };
  const reranker = new CrossEncoderReranker({
    modelName: 'non-existent-model.onnx',
    device: 'cpu',
    batchSize: 2,
    topK: 2,
    scoreWeights: { original: 0.3, crossEncoder: 0.7 },
  }, cache);
  const candidates: Candidate[] = [
    { id: 'a', content: 'auth helper', filePath: 'src/auth.ts', score: 0.2 },
    { id: 'b', content: 'auth module', filePath: 'src/mod.ts', score: 0.2 },
  ];
  const first = await reranker.rerank('auth', candidates);
  const second = await reranker.rerank('auth', candidates);
  assert.deepEqual(first, second);
  assert.equal(setCount, 1);
  reranker.dispose();
});
