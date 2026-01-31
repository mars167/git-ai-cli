import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { runParallelIndexing } from '../dist/src/core/indexing/parallel.js';
import { defaultIndexingConfig, defaultErrorHandlingConfig } from '../dist/src/core/indexing/config.js';
import { HNSWIndex } from '../dist/src/core/indexing/hnsw.js';
import { quantizeSQ8 } from '../dist/src/core/sq8.js';

async function createTempDir(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-indexing-'));
  return base;
}

function makeFilesFixture(root: string): { files: string[] } {
  const files: Array<{ rel: string; content: string }> = [
    { rel: 'src/alpha.ts', content: 'export function alpha() { return 1; }' },
    { rel: 'src/bravo.ts', content: 'export class Bravo { run() { return alpha(); } }' },
    { rel: 'docs/readme.md', content: '# Hello\n\nSome docs.' },
  ];
  for (const file of files) {
    const abs = path.join(root, file.rel);
    fs.ensureDirSync(path.dirname(abs));
    fs.writeFileSync(abs, file.content, 'utf-8');
  }
  return { files: files.map((f) => f.rel) };
}

test('parallel indexing collects chunks and refs', async () => {
  const repoRoot = await createTempDir();
  const scanRoot = repoRoot;
  const fixture = makeFilesFixture(repoRoot);
  const indexing = { ...defaultIndexingConfig(), workerCount: 2, batchSize: 2 };
  const errorHandling = defaultErrorHandlingConfig();
  const existingChunkIdsByLang = {};

  const res = await runParallelIndexing({
    repoRoot,
    scanRoot,
    dim: 64,
    files: fixture.files,
    indexing,
    errorHandling,
    existingChunkIdsByLang,
  });

  assert.ok(res.astFiles.length >= 2);
  const tsChunks = res.chunkRowsByLang.ts ?? [];
  const tsRefs = res.refRowsByLang.ts ?? [];
  assert.ok(tsChunks.length > 0);
  assert.ok(tsRefs.length > 0);
});

test('parallel indexing handles parse failures with fallback', async () => {
  const repoRoot = await createTempDir();
  const scanRoot = repoRoot;
  const filePath = path.join(repoRoot, 'broken.ts');
  await fs.writeFile(filePath, 'export function {', 'utf-8');

  const indexing = { ...defaultIndexingConfig(), workerCount: 1, batchSize: 1 };
  const errorHandling = { ...defaultErrorHandlingConfig(), parseFailureFallback: 'text-only' as const };
  const res = await runParallelIndexing({
    repoRoot,
    scanRoot,
    dim: 32,
    files: ['broken.ts'],
    indexing,
    errorHandling,
    existingChunkIdsByLang: {},
  });

  const tsChunks = res.chunkRowsByLang.ts ?? [];
  assert.equal(tsChunks.length, 1);
  assert.ok(tsChunks[0]?.text.includes('file:broken.ts'));
});

test('hnsw index returns nearest results', () => {
  const index = new HNSWIndex({ M: 8, efConstruction: 100, efSearch: 50, quantizationBits: 8 });
  const a = quantizeSQ8([1, 0, 0, 0]);
  const b = quantizeSQ8([0, 1, 0, 0]);
  index.add({ id: 'a', vector: a });
  index.add({ id: 'b', vector: b });

  const hits = index.search(a, 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.id, 'a');
});
