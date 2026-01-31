import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore dist module has no typings
import { CodeParser } from '../dist/src/core/parser.js';

test('parser can parse polyglot examples', async () => {
  const parser = new CodeParser();
  const repo = path.resolve('examples/polyglot-repo');
  const files = ['main.c', 'main.go', 'main.py', 'main.rs'];
  for (const f of files) {
    const res = await parser.parseFile(path.join(repo, f));
    assert.ok(Array.isArray(res.symbols));
    assert.ok(Array.isArray(res.refs));
  }
});
