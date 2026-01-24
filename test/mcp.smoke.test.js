const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'dist', 'bin', 'git-ai.js');

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

test('mcp server exposes set_repo and supports path arg', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-mcp-'));
  const repoDir = await createRepo(tmp, 'repo', {
    'src/foo.ts': [
      'export class Foo {',
      '  hello(name: string) {',
      '    return `hello ${name}`;',
      '  }',
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
    'README.md': '# test repo\n',
  });
  const repoRootReal = await fs.realpath(repoDir);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [CLI, 'ai', 'serve'],
    stderr: 'ignore',
  });

  const client = new Client({ name: 'git-ai-test', version: '0.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const res = await client.listTools();
    const toolNames = new Set((res.tools ?? []).map(t => t.name));

    assert.ok(toolNames.has('search_symbols'));
    assert.ok(toolNames.has('semantic_search'));
    assert.ok(toolNames.has('set_repo'));
    assert.ok(toolNames.has('get_repo'));
    assert.ok(toolNames.has('index_repo'));
    assert.ok(toolNames.has('check_index'));
    assert.ok(toolNames.has('pack_index'));
    assert.ok(toolNames.has('unpack_index'));
    assert.ok(toolNames.has('list_files'));
    assert.ok(toolNames.has('read_file'));
    assert.ok(toolNames.has('ast_graph_query'));
    assert.ok(toolNames.has('ast_graph_find'));
    assert.ok(toolNames.has('ast_graph_children'));
    assert.ok(toolNames.has('ast_graph_refs'));
    assert.ok(toolNames.has('ast_graph_callers'));
    assert.ok(toolNames.has('ast_graph_callees'));
    assert.ok(toolNames.has('ast_graph_chain'));

    {
      const call = await client.callTool({ name: 'set_repo', arguments: { path: repoDir } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.equal(parsed.ok, true);
      assert.equal(await fs.realpath(parsed.repoRoot), repoRootReal);
    }

    {
      const call = await client.callTool({ name: 'get_repo', arguments: {} });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.equal(parsed.ok, true);
      assert.equal(await fs.realpath(parsed.repoRoot), repoRootReal);
    }

    {
      const call = await client.callTool({ name: 'index_repo', arguments: { overwrite: true, dim: 64 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.equal(parsed.ok, true);
      assert.equal(await fs.realpath(parsed.repoRoot), repoRootReal);
    }

    {
      const call = await client.callTool({ name: 'check_index', arguments: {} });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.equal(parsed.ok, true);
      assert.ok(parsed.expected && parsed.expected.index_schema_version);
    }

    {
      const call = await client.callTool({
        name: 'search_symbols',
        arguments: {
          query: 'hello',
          mode: 'substring',
          case_insensitive: true,
          limit: 10,
        },
      });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && Array.isArray(parsed.rows));
      assert.ok(parsed.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'semantic_search', arguments: { query: 'hello world', topk: 3 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && Array.isArray(parsed.rows));
      assert.ok(parsed.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'list_files', arguments: { pattern: 'src/**/*', limit: 50 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && Array.isArray(parsed.files));
      assert.ok(parsed.files.includes('src/foo.ts'));
    }

    {
      const call = await client.callTool({ name: 'read_file', arguments: { file: 'src/foo.ts', start_line: 1, end_line: 20 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && typeof parsed.text === 'string');
      assert.ok(parsed.text.includes('export class Foo'));
    }

    {
      const call = await client.callTool({ name: 'ast_graph_query', arguments: { query: "?[file] := *ast_symbol{ref_id, file, lang, name: 'Foo', kind, signature, start_line, end_line}" } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && parsed.result && Array.isArray(parsed.result.rows));
      assert.ok(parsed.result.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'ast_graph_find', arguments: { prefix: 'Fo', limit: 10 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && parsed.result && Array.isArray(parsed.result.rows));
      assert.ok(parsed.result.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'ast_graph_children', arguments: { id: 'src/foo.ts', as_file: true } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && parsed.result && Array.isArray(parsed.result.rows));
      assert.ok(parsed.result.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'ast_graph_refs', arguments: { name: 'helloWorld', limit: 50 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && parsed.result && Array.isArray(parsed.result.rows));
      assert.ok(parsed.result.rows.some(r => String(r[3] ?? '') === 'call'));
    }

    {
      const call = await client.callTool({ name: 'ast_graph_callers', arguments: { name: 'helloWorld', limit: 50 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && parsed.result && Array.isArray(parsed.result.rows));
      assert.ok(parsed.result.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'ast_graph_chain', arguments: { name: 'run', direction: 'downstream', max_depth: 2, limit: 200 } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.ok(parsed && parsed.result && Array.isArray(parsed.result.rows));
      assert.ok(parsed.result.rows.length > 0);
    }

    {
      const call = await client.callTool({ name: 'pack_index', arguments: { lfs: true } });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.equal(parsed.ok, true);
      const stat = await fs.stat(parsed.archivePath);
      assert.ok(stat.size > 0);
    }

    {
      await fs.rm(path.join(repoDir, '.git-ai', 'lancedb'), { recursive: true, force: true });
      const call = await client.callTool({ name: 'unpack_index', arguments: {} });
      const text = String(call?.content?.[0]?.text ?? '');
      const parsed = text ? JSON.parse(text) : null;
      assert.equal(parsed.ok, true);
      const stat = await fs.stat(path.join(repoDir, '.git-ai', 'lancedb'));
      assert.ok(stat.isDirectory());
    }
  } finally {
    await transport.close();
  }
});

test('mcp server supports --path on serve', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-mcp-'));
  const repoDir = await createRepo(tmp, 'repo', {
    'src/foo.ts': 'export function foo() { return 1; }\n',
  });
  const repoRootReal = await fs.realpath(repoDir);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [CLI, 'ai', 'serve', '--path', repoDir],
    stderr: 'ignore',
  });

  const client = new Client({ name: 'git-ai-test', version: '0.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const call = await client.callTool({ name: 'get_repo', arguments: {} });
    const text = String(call?.content?.[0]?.text ?? '');
    const parsed = text ? JSON.parse(text) : null;
    assert.equal(parsed.ok, true);
    assert.equal(await fs.realpath(parsed.repoRoot), repoRootReal);
  } finally {
    await transport.close();
  }
});
