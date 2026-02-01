import test from 'node:test';
import assert from 'node:assert/strict';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { OnnxSemanticEmbedder, defaultSemanticConfig } from '../dist/src/core/embedding/semantic.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { WlStructuralEmbedder } from '../dist/src/core/embedding/structural.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { GraphSymbolicEmbedder } from '../dist/src/core/embedding/symbolic.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { WeightedEmbeddingFusion } from '../dist/src/core/embedding/fusion.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { HybridEmbedder, defaultHybridEmbeddingConfig } from '../dist/src/core/embedding/index.js';
import type { SymbolInfo } from '../src/core/types';

test('semantic embedder returns normalized vector', async () => {
  const config = { ...defaultSemanticConfig(), embeddingDim: 32, batchSize: 2 };
  const embedder = new OnnxSemanticEmbedder(config);
  const vec = await embedder.embed('export function alpha() { return 1; }');
  assert.equal(vec.length, 32);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  assert.ok(norm > 0.9 && norm < 1.1);
});

test('structural embedder produces stable dimension', () => {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse('function alpha() { if (true) { return 1; } }');
  const embedder = new WlStructuralEmbedder({ dim: 64, wlIterations: 2 });
  const vec = embedder.embed(tree);
  assert.equal(vec.length, 64);
});

test('symbolic embedder encodes symbol names and relations', () => {
  const embedder = new GraphSymbolicEmbedder({ dim: 48, includeCalls: true, includeTypes: true, includeImports: true });
  const symbols: SymbolInfo[] = [
    { name: 'alpha', kind: 'function', startLine: 1, endLine: 2, signature: 'function alpha()' },
    { name: 'Bravo', kind: 'class', startLine: 3, endLine: 6, signature: 'class Bravo', extends: ['Base'] },
  ];
  const vec = embedder.embedSymbols(symbols);
  const rel = embedder.embedRelations({
    calls: [['alpha', 'beta']],
    types: [['Bravo', 'Base']],
    imports: [['src/a.ts', 'src/b.ts']],
  });
  assert.equal(vec.length, 48);
  assert.equal(rel.length, 48);
});

test('fusion combines multiple vectors', () => {
  const fusion = new WeightedEmbeddingFusion({
    semanticWeight: 0.5,
    structuralWeight: 0.3,
    symbolicWeight: 0.2,
    normalize: true,
  });
  const vec = fusion.fuse([1, 0], [0, 1], [1, 1]);
  assert.equal(vec.length, 2);
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  assert.ok(norm > 0.9 && norm < 1.1);
});

test('hybrid embedder fuses semantic, structural, and symbolic', async () => {
  const config = defaultHybridEmbeddingConfig();
  config.semantic.embeddingDim = 16;
  config.structural.dim = 16;
  config.symbolic.dim = 16;
  const embedder = new HybridEmbedder(config);
  const symbols: SymbolInfo[] = [
    { name: 'alpha', kind: 'function', startLine: 1, endLine: 2, signature: 'function alpha()' },
  ];
  const vec = await embedder.embed('export function alpha() { return 1; }', symbols);
  assert.equal(vec.length, 16);
});
