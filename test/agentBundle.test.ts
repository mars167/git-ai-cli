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

async function createProjectFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-bundle-'));
  await writeFixture(root, 'src/user/repository.ts', [
    'export interface UserRepository {',
    '  findById(id: string): Promise<User | null>;',
    '  save(user: User): Promise<void>;',
    '}',
    '',
    'export interface User {',
    '  id: string;',
    '  email: string;',
    '  name: string;',
    '}',
    '',
  ].join('\n'));
  await writeFixture(root, 'src/user/service.ts', [
    "import { UserRepository, User } from './repository';",
    '',
    'export class UserService {',
    '  constructor(private repo: UserRepository) {}',
    '',
    '  async getUser(id: string): Promise<User | null> {',
    '    return this.repo.findById(id);',
    '  }',
    '',
    '  async updateEmail(id: string, email: string): Promise<void> {',
    '    const user = await this.repo.findById(id);',
    "    if (!user) throw new Error('user not found');",
    '    user.email = email;',
    '    await this.repo.save(user);',
    '  }',
    '}',
    '',
  ].join('\n'));
  await writeFixture(root, 'src/user/controller.ts', [
    "import { UserService } from './service';",
    '',
    'export class UserController {',
    '  constructor(private svc: UserService) {}',
    '',
    '  async handleGetUser(id: string) {',
    '    return this.svc.getUser(id);',
    '  }',
    '}',
    '',
  ].join('\n'));
  await writeFixture(root, 'test/user/service.test.ts', [
    "import { UserService } from '../../src/user/service';",
    '',
    "test('getUser delegates to repository', async () => {",
    "  const mockRepo = { findById: async () => ({ id: '1', email: 'a@b.com', name: 'Alice' }), save: async () => {} };",
    '  const svc = new UserService(mockRepo as any);',
    "  const user = await svc.getUser('1');",
    "  expect(user?.email).toBe('a@b.com');",
    '});',
    '',
  ].join('\n'));
  return root;
}

test('Agent scenario: review agent builds context from a PR diff', async () => {
  const repoRoot = await createProjectFixture();
  const engine = createCodeContextEngine({ repoRoot });
  const diff = [
    'diff --git a/src/user/service.ts b/src/user/service.ts',
    '--- a/src/user/service.ts',
    '+++ b/src/user/service.ts',
    '@@ -9,6 +9,11 @@ export class UserService {',
    '     return this.repo.findById(id);',
    '   }',
    ' ',
    '+  async deleteUser(id: string): Promise<void> {',
    '+    const user = await this.repo.findById(id);',
    "+    if (!user) throw new Error('user not found');",
    '+    // TODO: implement delete logic',
    '+  }',
    '+',
    '   async updateEmail(id: string, email: string): Promise<void> {',
  ].join('\n');

  const result = await engine.tasks.reviewContextForDiff({ task: 'review_pr', diffText: diff });
  assert.ok(result.diff);
  assert.ok(result.bundle);
  assert.equal(result.bundle?.task, 'review_pr');
});

test('Agent scenario: coding agent builds implementation context', async () => {
  const repoRoot = await createProjectFixture();
  const engine = createCodeContextEngine({ repoRoot });
  const bundle = await engine.tasks.implementationContext({
    task: 'implementation_context',
    query: 'UserRepository',
    symbolHints: ['UserRepository', 'findById'],
    pathHints: ['src/user'],
  });
  const allEvidence = bundle.sections.flatMap((section) => section.evidence);
  assert.ok(allEvidence.some((match) => match.path === 'src/user/repository.ts'));
  assert.ok(allEvidence.some((match) => match.path === 'src/user/service.ts'));
});
