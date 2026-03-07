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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-context-diff-'));
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
    'src/auth/service.test.ts',
    [
      "import { authenticateUser } from './service';",
      '',
      "test('authenticateUser rejects empty email', async () => {",
      "  await expect(authenticateUser('', 'pw')).rejects.toThrow('missing email');",
      '});',
      '',
    ].join('\n'),
  );
  return root;
}

test('Code Context Engine builds review context from a diff', async () => {
  const repoRoot = await createFixtureRepo();
  const engine = createCodeContextEngine({ repoRoot });
  const diffText = [
    'diff --git a/src/auth/service.ts b/src/auth/service.ts',
    '--- a/src/auth/service.ts',
    '+++ b/src/auth/service.ts',
    '@@ -1,4 +1,5 @@',
    ' export async function authenticateUser(email: string, password: string) {',
    "   if (!email) throw new Error('missing email');",
    '+  if (!password) throw new Error(\"missing password\");',
    '   return `${email}:${password}`;',
    ' }',
    '',
  ].join('\n');

  const result = await engine.tasks.reviewContextForDiff({
    task: 'review_pr',
    diffText,
  });

  assert.equal(result.bundle.task, 'review_pr');
  assert.equal(result.diff.touched_files[0]?.path, 'src/auth/service.ts');
  assert.ok(result.diff.touched_symbols.includes('authenticateUser'));
  assert.ok(result.diff.added_literals.includes('missing password'));
  assert.ok(result.bundle.evidence.some((match: any) => match.path === 'src/auth/service.ts'));
  assert.ok(result.bundle.evidence.some((match: any) => match.path === 'src/auth/service.test.ts'));
});
