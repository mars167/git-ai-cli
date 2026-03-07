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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-context-tasks-'));
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
    'src/auth/controller.ts',
    [
      "import { authenticateUser } from './service';",
      '',
      'export async function loginController(email: string, password: string) {',
      '  return authenticateUser(email, password);',
      '}',
      '',
    ].join('\n'),
  );
  await writeFixture(
    root,
    'src/auth/service.test.ts',
    [
      "import { authenticateUser } from './service';",
      '',
      "test('authenticateUser returns credentials shape', async () => {",
      "  const result = await authenticateUser('a@b.com', 'pw');",
      "  expect(result).toContain('a@b.com');",
      '});',
      '',
    ].join('\n'),
  );
  return root;
}

test('Code Context Engine builds implementation context bundles', async () => {
  const repoRoot = await createFixtureRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const bundle = await engine.tasks.implementationContext({
    task: 'implementation_context',
    query: 'authenticateUser',
    pathHints: ['src/auth'],
    symbolHints: ['authenticateUser'],
  });

  assert.equal(bundle.task, 'implementation_context');
  assert.ok(bundle.summary.includes('authenticateUser'));
  assert.ok(bundle.sections.length >= 1);
  assert.ok(bundle.sections.some((section: any) => section.evidence.some((match: any) => match.path === 'src/auth/service.ts')));
});

test('Code Context Engine finds related tests for implementation work', async () => {
  const repoRoot = await createFixtureRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const bundle = await engine.tasks.findTests({
    task: 'find_tests',
    query: 'authenticateUser',
    pathHints: ['src/auth'],
    symbolHints: ['authenticateUser'],
  });

  assert.equal(bundle.task, 'find_tests');
  assert.ok(bundle.evidence.length >= 1);
  assert.ok(bundle.evidence.some((match: any) => match.path === 'src/auth/service.test.ts'));
});
