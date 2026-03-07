import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { createCodeContextEngine } from '../dist/src/index.js';

async function writeFixture(root: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(root, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf-8');
}

async function createFixtureRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-context-engine-'));
  await writeFixture(
    root,
    'src/auth/service.ts',
    [
      'export async function authenticateUser(email: string, password: string) {',
      "  if (!email) throw new Error('missing email');",
      "  return `${email}:${password}`;",
      '}',
      '',
    ].join('\n'),
  );
  await writeFixture(
    root,
    'src/payment/client.ts',
    [
      'export async function retryCharge() {',
      '  return 3;',
      '}',
      '',
      'export function failWithLiteral() {',
      '  throw new Error("boom?");',
      '}',
      '',
    ].join('\n'),
  );
  await writeFixture(
    root,
    'docs/notes.md',
    [
      '# Notes',
      '',
      'authenticateUser is documented here.',
      'retryCharge is mentioned for docs only.',
      '',
    ].join('\n'),
  );
  return root;
}

test('Code Context Engine lexical search returns structured exact-token matches', async () => {
  const repoRoot = await createFixtureRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const result = await engine.search.lexical({
    query: 'authenticateUser',
    mode: 'exact',
    lang: 'ts',
    pathPattern: 'src/auth/**',
    limit: 10,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.path, 'src/auth/service.ts');
  assert.equal(result.matches[0]?.match_type, 'exact_token');
  assert.equal(result.matches[0]?.evidence_type, 'content_match');
  assert.equal(result.matches[0]?.symbol, 'authenticateUser');
  assert.ok(result.matches[0]?.why_matched.includes('exact token'));
  assert.ok(result.matches[0]?.preview.includes('authenticateUser'));
  assert.equal(result.matches[0]?.range.start.line, 1);
  assert.equal(result.matches[0]?.confidence, 'high');
});

test('Code Context Engine lexical search supports regex with path and language filters', async () => {
  const repoRoot = await createFixtureRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const result = await engine.search.lexical({
    query: 'retry[A-Za-z]+',
    mode: 'regex',
    lang: 'ts',
    pathPattern: 'src/**/*.ts',
    limit: 10,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.path, 'src/payment/client.ts');
  assert.equal(result.matches[0]?.match_type, 'regex');
  assert.ok(result.matches[0]?.why_matched.includes('regex'));
  assert.ok(result.matches.every((match: any) => match.path.endsWith('.ts')));
});

test('Code Context Engine lexical search supports literal string matching', async () => {
  const repoRoot = await createFixtureRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const result = await engine.search.lexical({
    query: 'throw new Error("boom?");',
    mode: 'literal',
    pathPattern: 'src/payment/**',
    limit: 10,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.path, 'src/payment/client.ts');
  assert.equal(result.matches[0]?.match_type, 'literal');
  assert.ok(result.matches[0]?.preview.includes('boom?'));
  assert.ok(result.matches[0]?.why_matched.includes('literal'));
});
