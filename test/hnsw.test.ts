import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { HNSWIndex } from '../dist/src/core/indexing/hnsw.js';
import { quantizeSQ8 } from '../dist/src/core/sq8.js';

function makeVector(dim: number, seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < dim; i++) {
    const v = Math.sin(seed * 31 + i * 17) + Math.cos(seed * 11 + i * 13);
    out.push(v);
  }
  return out;
}

async function makeTempFile(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(dir, 'hnsw.idx');
}

function topHitIds(results: Array<{ id: string }>): string[] {
  return results.map((r) => r.id);
}

test('hnsw index add/search returns nearest', () => {
  const index = new HNSWIndex({ M: 8, efConstruction: 100, efSearch: 50, quantizationBits: 8, dim: 4 });
  const a = quantizeSQ8([1, 0, 0, 0]);
  const b = quantizeSQ8([0, 1, 0, 0]);
  index.add({ id: 'a', vector: a });
  index.add({ id: 'b', vector: b });

  const hits = index.search(a, 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.id, 'a');
});

test('hnsw index supports batch insert and search batch', () => {
  const index = new HNSWIndex({ M: 8, efConstruction: 100, efSearch: 50, quantizationBits: 8, dim: 3 });
  const vectors = [
    { id: 'a', vector: quantizeSQ8([1, 0, 0]) },
    { id: 'b', vector: quantizeSQ8([0, 1, 0]) },
    { id: 'c', vector: quantizeSQ8([0, 0, 1]) },
  ];
  index.addBatch(vectors);
  assert.equal(index.getCount(), 3);

  const queries = vectors.map((v) => v.vector);
  const results = index.searchBatch(queries, 1);
  assert.equal(results.length, 3);
  assert.equal(results[0]?.[0]?.id, 'a');
  assert.equal(results[1]?.[0]?.id, 'b');
  assert.equal(results[2]?.[0]?.id, 'c');
});

test('hnsw index respects clear and stats', () => {
  const index = new HNSWIndex({ M: 8, efConstruction: 100, efSearch: 50, quantizationBits: 8, dim: 2 });
  index.add({ id: 'a', vector: quantizeSQ8([1, 0]) });
  index.add({ id: 'b', vector: quantizeSQ8([0, 1]) });
  const stats = index.stats();
  assert.equal(stats.nodeCount, 2);
  assert.ok(stats.edgeCount >= 0);
  assert.ok(stats.maxLevel >= 0);

  index.clear();
  assert.equal(index.getCount(), 0);
  const emptyStats = index.stats();
  assert.equal(emptyStats.nodeCount, 0);
});

test('hnsw persistence round trip', async () => {
  const filePath = await makeTempFile('git-ai-hnsw-');
  const index = new HNSWIndex({ M: 8, efConstruction: 100, efSearch: 50, quantizationBits: 8, dim: 4 });
  const entries = [
    { id: 'a', vector: quantizeSQ8([1, 0, 0, 0]) },
    { id: 'b', vector: quantizeSQ8([0, 1, 0, 0]) },
    { id: 'c', vector: quantizeSQ8([0, 0, 1, 0]) },
  ];
  index.addBatch(entries);
  await index.save(filePath);

  const loaded = new HNSWIndex({ M: 8, efConstruction: 100, efSearch: 50, quantizationBits: 8, dim: 4 });
  await loaded.load(filePath);
  assert.equal(loaded.getCount(), 3);

  const hits = loaded.search(entries[1]!.vector, 1);
  assert.equal(hits[0]?.id, 'b');
});

test('hnsw index approximate search scales', () => {
  const dim = 8;
  const count = 200;
  const index = new HNSWIndex({ M: 12, efConstruction: 120, efSearch: 64, quantizationBits: 8, dim });
  const entries = Array.from({ length: count }, (_, i) => {
    const vec = makeVector(dim, i);
    return { id: `v${i}`, vector: quantizeSQ8(vec) };
  });
  index.addBatch(entries);

  const target = entries[120]!;
  const results = index.search(target.vector, 5);
  const ids = topHitIds(results);
  assert.ok(ids.includes(target.id));
  assert.ok(results.length <= 5);
});
