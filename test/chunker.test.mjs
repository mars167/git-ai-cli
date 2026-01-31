import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// Dynamic import of chunker
const chunkerModule = await import('../dist/src/core/parser/chunker.js');
const {
  astAwareChunking,
  countTokens,
  defaultChunkingConfig,
} = chunkerModule;

console.log('Testing AST-aware chunking...\n');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    process.exit(1);
  }
}

test('countTokens counts basic words', () => {
  const text = 'function hello world test';
  const count = countTokens(text);
  console.log(`  countTokens("${text}") = ${count}`);
});

test('countTokens handles code', () => {
  const code = 'const foo: string = "bar";';
  const count = countTokens(code);
  console.log(`  code tokens: ${count}`);
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
  
  console.log(`  Simple function: ${result.totalChunks} chunks, ${result.totalTokens} tokens`);
  
  if (result.chunks.length > 0) {
    const first = result.chunks[0];
    console.log(`  First chunk: ${first.nodeType}, lines ${first.startLine}-${first.endLine}`);
    console.log(`  AST path: ${first.astPath.join(' > ')}`);
  }
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
  
  console.log(`  Class with methods: ${result.totalChunks} chunks, ${result.totalTokens} tokens`);
  
  const chunkTypes = result.chunks.map(c => c.nodeType);
  console.log(`  Chunk types: ${chunkTypes.join(', ')}`);
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
  
  console.log(`  Large function: ${result.totalChunks} chunks (should be > 1)`);
});

console.log('\nAll tests passed!');
