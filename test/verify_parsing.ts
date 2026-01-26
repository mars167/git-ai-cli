import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { CodeParser } from '../dist/src/core/parser.js';

test('parser can parse polyglot examples', async () => {
  const parser = new CodeParser();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repo = path.join(__dirname, '../examples/polyglot-repo');
  const files = ['main.c', 'main.go', 'main.py', 'main.rs'];
  for (const f of files) {
    const res = await parser.parseFile(path.join(repo, f));
    assert.ok(Array.isArray(res.symbols));
    assert.ok(Array.isArray(res.refs));
  }
});
