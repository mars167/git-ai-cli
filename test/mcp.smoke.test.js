const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'dist', 'bin', 'code-context-engine.js');

function runOk(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${out}`);
  }
  return res;
}

async function writeFile(p, content) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
}

async function createRepo(baseDir, name, files) {
  const repoDir = path.join(baseDir, name);
  await fs.mkdir(repoDir, { recursive: true });
  runOk('git', ['init', '-b', 'main'], repoDir);
  runOk('git', ['config', 'user.email', 'test@example.com'], repoDir);
  runOk('git', ['config', 'user.name', 'Test User'], repoDir);
  await writeFile(path.join(repoDir, '.gitignore'), '.git-ai/lancedb/\n');
  for (const [rel, content] of Object.entries(files)) {
    await writeFile(path.join(repoDir, rel), content);
  }
  runOk('git', ['add', '-A'], repoDir);
  runOk('git', ['commit', '-m', 'init'], repoDir);
  return repoDir;
}

test('Code Context Engine MCP exposes thin runtime-centric tools', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cce-mcp-'));
  const repoDir = await createRepo(tmp, 'repo', {
    'src/foo.ts': [
      'export interface FooHandler {',
      '  handle(name: string): string;',
      '}',
      '',
      'export function helloWorld() {',
      '  return "hello world";',
      '}',
      '',
      'export function run() {',
      '  return helloWorld();',
      '}',
      '',
    ].join('\n'),
    'test/foo.test.ts': [
      "import { helloWorld } from '../src/foo';",
      '',
      "test('helloWorld', () => {",
      "  expect(helloWorld()).toContain('hello');",
      '});',
      '',
    ].join('\n'),
  });

  runOk('node', [CLI, 'ai', 'index', '--dim', '64', '--overwrite'], repoDir);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [CLI, 'ai', 'serve'],
    stderr: 'ignore',
  });

  const client = new Client({ name: 'cce-test', version: '0.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const res = await client.listTools();
    const toolNames = new Set((res.tools ?? []).map((tool) => tool.name));
    assert.deepEqual(
      [...toolNames].sort(),
      [
        'check_index',
        'find_extension_points',
        'find_impact',
        'find_tests',
        'implementation_context',
        'lexical_search',
        'read_file',
        'rebuild_index',
        'repo_map',
        'review_context_for_diff',
      ].sort(),
    );
  } finally {
    await client.close().catch(() => {});
  }
});
