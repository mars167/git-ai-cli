const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', 'dist', 'bin', 'git-ai.js');

test('mcp server exposes set_repo and supports path arg', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

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
    assert.ok(toolNames.has('pack_index'));
    assert.ok(toolNames.has('unpack_index'));
    assert.ok(toolNames.has('list_files'));
    assert.ok(toolNames.has('read_file'));
    assert.ok(toolNames.has('ast_graph_query'));

    const call = await client.callTool({
      name: 'search_symbols',
      arguments: {
        query: 'get*repo',
        mode: 'wildcard',
        case_insensitive: true,
        limit: 5,
        max_candidates: 50,
      },
    });
    const text = String(call?.content?.[0]?.text ?? '');
    const parsed = text ? JSON.parse(text) : null;
    assert.ok(parsed && Array.isArray(parsed.rows));
  } finally {
    await transport.close();
  }
});
