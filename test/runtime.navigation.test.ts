import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { createCodeContextEngine } from '../dist/src/index.js';

const CLI = path.resolve(process.cwd(), 'dist', 'bin', 'code-context-engine.js');

function runOk(cmd: string, args: string[], cwd: string) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed\n${res.stdout}\n${res.stderr}`);
  }
}

async function writeFixture(root: string, relPath: string, content: string): Promise<void> {
  const absPath = path.join(root, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf-8');
}

async function createIndexedRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-context-nav-'));
  runOk('git', ['init', '-b', 'main'], root);
  runOk('git', ['config', 'user.email', 'test@example.com'], root);
  runOk('git', ['config', 'user.name', 'Test User'], root);

  await writeFixture(root, 'src/auth/provider.ts', [
    'export interface AuthProvider {',
    '  authenticate(token: string): Promise<boolean>;',
    '}',
    '',
    'export class EmailAuthProvider implements AuthProvider {',
    '  async authenticate(token: string): Promise<boolean> {',
    '    return token.length > 0;',
    '  }',
    '}',
    '',
    'export function createProvider(): AuthProvider {',
    '  return new EmailAuthProvider();',
    '}',
    '',
  ].join('\n'));

  await writeFixture(root, 'src/auth/service.ts', [
    "import { AuthProvider, createProvider } from './provider';",
    '',
    'export async function authenticateUser(provider: AuthProvider, token: string) {',
    '  return provider.authenticate(token);',
    '}',
    '',
    'export async function loginWithDefaultProvider(token: string) {',
    '  const provider = createProvider();',
    '  return authenticateUser(provider, token);',
    '}',
    '',
  ].join('\n'));

  runOk('git', ['add', '.'], root);
  runOk('git', ['commit', '-m', 'init'], root);
  runOk('node', [CLI, 'ai', 'index', '--overwrite'], root);
  return root;
}

test('Code Context Engine navigation finds definitions, references, and scopes', async () => {
  const repoRoot = await createIndexedRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const definitions = await engine.navigation.findDefinition({ symbol: 'authenticateUser', lang: 'ts' });
  assert.ok(definitions.matches.some((match) => match.path === 'src/auth/service.ts'));

  const references = await engine.navigation.findReferences({ symbol: 'authenticateUser', lang: 'ts' });
  assert.ok(references.matches.some((match) => match.path === 'src/auth/service.ts'));

  const containingScope = await engine.navigation.findContainingScope({
    file: 'src/auth/service.ts',
    line: 7,
    lang: 'ts',
  });
  assert.ok(containingScope.matches.some((match) => match.symbol === 'loginWithDefaultProvider'));
});

test('Code Context Engine navigation finds implementations, importers, and exports', async () => {
  const repoRoot = await createIndexedRepo();
  const engine = createCodeContextEngine({ repoRoot });

  const implementations = await engine.navigation.findImplementations({ symbol: 'AuthProvider', lang: 'ts' });
  assert.ok(implementations.matches.some((match) => match.path === 'src/auth/provider.ts'));

  const importers = await engine.navigation.findImporters({ symbol: 'AuthProvider', lang: 'ts' });
  assert.ok(importers.matches.some((match) => match.path === 'src/auth/service.ts'));

  const exports = await engine.navigation.findExports({ symbol: 'createProvider', lang: 'ts' });
  assert.ok(exports.matches.some((match) => match.path === 'src/auth/provider.ts'));
});
