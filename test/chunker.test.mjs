import { test } from 'node:test';
import assert from 'node:assert';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// Dynamic import of chunker
const chunkerModule = await import('../dist/src/core/parser/chunker.js');
const {
  astAwareChunking,
  countTokens,
  defaultChunkingConfig,
} = chunkerModule;

test('countTokens counts basic words', () => {
  const text = 'function hello world test';
  const count = countTokens(text);
  assert.strictEqual(count, 4);
});

test('countTokens handles code', () => {
  const code = 'const foo: string = "bar";';
  const count = countTokens(code);
  // 'const', 'foo:', 'string', '=', '"bar";' -> 5 tokens by split(/\s+/)
  assert.strictEqual(count, 5);
});

test('astAwareChunking handles simple function', () => {
  const code = `
function hello() {
  return "world";
}
`.trim();
  
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(code);
  
  const result = astAwareChunking(tree, 'test.ts', defaultChunkingConfig);
  
  assert.ok(result.totalChunks > 0);
  assert.strictEqual(result.chunks[0].nodeType, 'function_declaration');
});

test('astAwareChunking handles class with methods', () => {
  const code = `
class User {
  name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  greet(): string {
    return "Hello, " + this.name;
  }
}
`.trim();
  
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(code);
  
  const result = astAwareChunking(tree, 'user.ts', defaultChunkingConfig);
  
  assert.ok(result.totalChunks > 0);
  // Logic: if (tokenCount <= config.maxTokens) return [chunk];
  // So likely 1 chunk 'class_declaration'.
  assert.strictEqual(result.chunks[0].nodeType, 'class_declaration');
});

test('astAwareChunking respects maxTokens', () => {
  const lines = [];
  lines.push('function largeFunction() {');
  for (let i = 0; i < 100; i++) {
    lines.push(`  const item${i} = computeValue(${i});`);
    lines.push(`  const processed${i} = transform(item${i});`);
  }
  lines.push('}');
  const code = lines.join('\n');
  
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(code);
  
  const result = astAwareChunking(tree, 'large.ts', {
    ...defaultChunkingConfig,
    maxTokens: 200,
  });
  
  assert.ok(result.totalChunks > 1, 'Should split large function');
});
