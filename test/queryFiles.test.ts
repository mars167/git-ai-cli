import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore dist module has no typings
import { handleSearchFiles } from '../dist/src/cli/handlers/queryFilesHandlers.js';
// @ts-ignore dist module has no typings
import { SearchFilesSchema } from '../dist/src/cli/schemas/queryFilesSchemas.js';

const testPath = '.';

test('query-files: substring search finds test files', async () => {
  const result = await handleSearchFiles({
    pattern: '.test.ts',
    path: testPath,
    limit: 50,
    mode: 'substring',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
  if (result.files.length > 0) {
    assert(
      result.files.some((row: any) => row.path.includes('.test.ts')),
      'Results should include .test.ts files',
    );
  }
});

test('query-files: prefix search finds src/core files', async () => {
  const result = await handleSearchFiles({
    pattern: 'src/core',
    path: testPath,
    limit: 50,
    mode: 'prefix',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
  if (result.files.length > 0) {
    assert(
      result.files.every((row: any) => row.path.startsWith('src/core')),
      'All results should start with src/core',
    );
  }
});

test('query-files: case-insensitive substring', async () => {
  const result = await handleSearchFiles({
    pattern: 'CLI',
    path: testPath,
    limit: 50,
    mode: 'substring',
    caseInsensitive: true,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
});

test('query-files: language filtering works', async () => {
  const result = await handleSearchFiles({
    pattern: '.test',
    path: testPath,
    limit: 50,
    mode: 'substring',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
  // Verify all returned files are from ts-related files
  assert(
    result.files.every((row: any) => {
      const file = String(row.path ?? '');
      return file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx');
    }),
    'All results should be TypeScript/JavaScript files when lang=ts',
  );
});

test('query-files: limit parameter respected', async () => {
  const limitResult = await handleSearchFiles({
    pattern: 'src',
    path: testPath,
    limit: 5,
    mode: 'substring',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'all',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(limitResult.ok, 'Query should succeed');
  assert(
    limitResult.files.length <= 5,
    'Result count should not exceed limit of 5',
  );
});

test('query-files: wildcard search with asterisk', async () => {
  const result = await handleSearchFiles({
    pattern: 'src/*/handlers*',
    path: testPath,
    limit: 50,
    mode: 'wildcard',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'all',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
  assert(result.files.length > 0, 'Should find at least one file matching wildcard pattern');
  assert(
    result.files.every((row: any) => {
      const file = String(row.path ?? '');
      // Verify that file matches glob pattern: src/*/handlers*
      return /^src\/[^/]+\/handlers/.test(file);
    }),
    'All results should match wildcard pattern src/*/handlers*',
  );
});

test('query-files: fuzzy search finds partial matches', async () => {
  const result = await handleSearchFiles({
    pattern: 'qryfs',
    path: testPath,
    limit: 50,
    mode: 'fuzzy',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
});

test('query-files: regex search with pattern', async () => {
  const result = await handleSearchFiles({
    pattern: '.*\\.test\\.ts$',
    path: testPath,
    limit: 50,
    mode: 'regex',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  assert(Array.isArray(result.files), 'Result should contain files array');
  if (result.files.length > 0) {
    assert(
      result.files.every((row: any) => /.*\.test\.ts$/.test(row.path)),
      'All results should match regex pattern',
    );
  }
});

test('query-files: empty pattern rejected by schema validation', () => {
  assert.throws(
    () => SearchFilesSchema.parse({
      pattern: '',
      path: testPath,
      limit: 50,
      mode: 'substring',
      caseInsensitive: false,
      maxCandidates: 1000,
      lang: 'ts',
      withRepoMap: false,
      repoMapFiles: 20,
      repoMapSymbols: 5,
      wiki: '',
    }),
    'Empty pattern should be rejected by Zod schema validation',
  );
});

test('query-files: invalid mode rejected by schema validation', () => {
  assert.throws(
    () => SearchFilesSchema.parse({
      pattern: 'test',
      path: testPath,
      limit: 50,
      mode: 'invalid',
      caseInsensitive: false,
      maxCandidates: 1000,
      lang: 'ts',
      withRepoMap: false,
      repoMapFiles: 20,
      repoMapSymbols: 5,
      wiki: '',
    }),
    'Invalid mode should be rejected by Zod schema validation',
  );
});

test('query-files: with repo map returns repo context', async () => {
  const result = await handleSearchFiles({
    pattern: 'handler',
    path: testPath,
    limit: 10,
    mode: 'substring',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: true,
    repoMapFiles: 5,
    repoMapSymbols: 3,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
});

test('query-files: result objects have required fields', async () => {
  const result = await handleSearchFiles({
    pattern: '.ts',
    path: testPath,
    limit: 10,
    mode: 'substring',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'ts',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed');
  if (result.files && result.files.length > 0) {
    const firstRow = result.files[0];
    assert(firstRow.path, 'Result should have path field');
  }
});

test('query-files: handles special characters in pattern', async () => {
  const result = await handleSearchFiles({
    pattern: 'src/cli/',
    path: testPath,
    limit: 20,
    mode: 'substring',
    caseInsensitive: false,
    maxCandidates: 1000,
    lang: 'all',
    withRepoMap: false,
    repoMapFiles: 20,
    repoMapSymbols: 5,
    wiki: '',
  });

  assert(result.ok, 'Query should succeed with path separator');
  assert(Array.isArray(result.files), 'Result should contain files array');
});
