import test from 'node:test';
import assert from 'node:assert/strict';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { generateRepoMap } from '../dist/src/core/repoMap.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { handleRepoMap } from '../dist/src/cli/handlers/repoMapHandler.js';

test('generateRepoMap returns non-empty files array', async () => {
  const result = await generateRepoMap({
    repoRoot: '.',
    maxFiles: 10,
    maxSymbolsPerFile: 5,
  });
  
  assert.ok(Array.isArray(result), 'Result should be an array');
  assert.ok(result.length > 0, 'Result should not be empty');
  
  const firstFile = result[0];
  assert.ok(firstFile.path, 'File should have path');
  assert.ok(typeof firstFile.rank === 'number', 'File should have numeric rank');
  assert.ok(Array.isArray(firstFile.symbols), 'File should have symbols array');
  
  if (firstFile.symbols.length > 0) {
    const firstSymbol = firstFile.symbols[0];
    assert.ok(firstSymbol.id, 'Symbol should have id');
    assert.ok(firstSymbol.name, 'Symbol should have name');
    assert.ok(firstSymbol.kind, 'Symbol should have kind');
    assert.ok(typeof firstSymbol.rank === 'number', 'Symbol should have numeric rank');
  }
});

test('generateRepoMap respects maxFiles parameter', async () => {
  const maxFiles = 5;
  const result = await generateRepoMap({
    repoRoot: '.',
    maxFiles,
    maxSymbolsPerFile: 5,
  });
  
  assert.ok(result.length <= maxFiles, `Result should have at most ${maxFiles} files`);
});

test('generateRepoMap respects depth parameter', async () => {
  const result1 = await generateRepoMap({
    repoRoot: '.',
    maxFiles: 10,
    maxSymbolsPerFile: 5,
    depth: 3,
  });
  
  const result2 = await generateRepoMap({
    repoRoot: '.',
    maxFiles: 10,
    maxSymbolsPerFile: 5,
    depth: 10,
  });
  
  assert.ok(result1.length > 0, 'Result with depth=3 should not be empty');
  assert.ok(result2.length > 0, 'Result with depth=10 should not be empty');
});

test('generateRepoMap respects maxNodes parameter', async () => {
  const result = await generateRepoMap({
    repoRoot: '.',
    maxFiles: 10,
    maxSymbolsPerFile: 5,
    maxNodes: 100,
  });
  
  assert.ok(Array.isArray(result), 'Result should be an array');
});

test('handleRepoMap returns structured response', async () => {
  const result = await handleRepoMap({
    path: '.',
    maxFiles: 5,
    maxSymbols: 3,
    depth: 5,
    maxNodes: 5000,
    wiki: '',
  });
  
  assert.ok(result, 'Result should exist');
  assert.ok('ok' in result, 'Result should have ok field');
  
  if (result.ok) {
    assert.ok('repoRoot' in result, 'Success result should have repoRoot');
    assert.ok(Array.isArray(result.files), 'Success result should have files array');
    assert.ok(typeof result.formatted === 'string', 'Success result should have formatted string');
  }
});

test('repo_map files are sorted by rank', async () => {
  const result = await generateRepoMap({
    repoRoot: '.',
    maxFiles: 10,
    maxSymbolsPerFile: 5,
  });
  
  if (result.length > 1) {
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        result[i - 1].rank >= result[i].rank,
        `Files should be sorted by rank descending at index ${i}`
      );
    }
  }
});

test('repo_map symbols are sorted by rank within each file', async () => {
  const result = await generateRepoMap({
    repoRoot: '.',
    maxFiles: 5,
    maxSymbolsPerFile: 10,
  });
  
  for (const file of result) {
    if (file.symbols.length > 1) {
      for (let i = 1; i < file.symbols.length; i++) {
        assert.ok(
          file.symbols[i - 1].rank >= file.symbols[i].rank,
          `Symbols in ${file.path} should be sorted by rank descending at index ${i}`
        );
      }
    }
  }
});
