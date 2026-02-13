const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'dist', 'bin', 'git-ai.js');

function run(cmd, args, cwd, options = {}) {
  const res = spawnSync(cmd, args, { 
    cwd, 
    encoding: 'utf-8',
    timeout: options.timeout || 60000,
    env: { ...process.env, ...options.env }
  });
  if (res.error) throw res.error;
  return res;
}

function runOk(cmd, args, cwd, options = {}) {
  const res = run(cmd, args, cwd, options);
  if (res.status !== 0) {
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${out}`);
  }
  return res;
}

function runJson(cmd, args, cwd) {
  const res = runOk(cmd, args, cwd);
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`Failed to parse JSON output: ${res.stdout}\nstderr: ${res.stderr}`);
  }
}

function assertAgentReadableStructure(result, commandName) {
  assert.equal(typeof result.ok, 'boolean', `${commandName}: result should have ok field (boolean)`);
  assert.equal(typeof result.command, 'string', `${commandName}: result should have command field (string)`);
  assert.equal(typeof result.timestamp, 'string', `${commandName}: result should have timestamp field (ISO 8601)`);
  assert.equal(typeof result.duration_ms, 'number', `${commandName}: result should have duration_ms field (number)`);
  
  const timestamp = new Date(result.timestamp);
  assert.ok(!isNaN(timestamp.getTime()), `${commandName}: timestamp should be valid ISO 8601`);
  
  if (result.ok) {
    assert.equal(typeof result.repoRoot, 'string', `${commandName}: successful result should have repoRoot`);
  } else {
    assert.equal(typeof result.reason, 'string', `${commandName}: error result should have reason field`);
    assert.ok(result.message || result.hint, `${commandName}: error result should have message or hint`);
  }
}

async function writeFile(p, content) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
}

async function createTestRepo(baseDir, name, files) {
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

let tmpDir = null;
let testRepo = null;

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-cli-test-'));
  testRepo = await createTestRepo(tmpDir, 'test-repo', {
    'src/index.ts': `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}

export class UserService {
  private users: Map<string, User> = new Map();
  
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }
  
  setUser(id: string, user: User): void {
    this.users.set(id, user);
  }
}

interface User {
  id: string;
  name: string;
  email: string;
}
`,
    'src/utils.ts': `
import { greet } from './index';

export function formatGreeting(name: string): string {
  return greet(name).toUpperCase();
}

export function validateEmail(email: string): boolean {
  return email.includes('@');
}
`,
    'src/handler.ts': `
import { UserService } from './index';
import { formatGreeting } from './utils';

export async function handleUserRequest(userId: string): Promise<string> {
  const service = new UserService();
  const user = service.getUser(userId);
  if (user) {
    return formatGreeting(user.name);
  }
  return 'User not found';
}
`,
    'README.md': `# Test Repository\n\nThis is a test repository for git-ai CLI testing.`,
  });
  
  runOk('node', [CLI, 'ai', 'index', '--overwrite'], testRepo);
});

test.after(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('git-ai ai status - returns agent-readable structure', () => {
  const result = runJson('node', [CLI, 'ai', 'status', '--json'], testRepo);
  
  assertAgentReadableStructure(result, 'status');
  assert.equal(result.ok, true, 'status should be ok');
  assert.ok(result.repoRoot, 'should have repoRoot');
  assert.ok(result.expected, 'should have expected schema info');
  assert.ok(result.found, 'should have found index info');
});

test('git-ai ai check-index - validates index integrity', () => {
  const result = runJson('node', [CLI, 'ai', 'check-index'], testRepo);
  
  assertAgentReadableStructure(result, 'check-index');
  assert.equal(result.ok, true, 'check-index should pass');
  assert.ok(result.repoRoot, 'should have repoRoot');
});

test('git-ai ai semantic - returns semantic search results', () => {
  const result = runJson('node', [CLI, 'ai', 'semantic', 'greet user', '--topk', '5'], testRepo);
  
  assertAgentReadableStructure(result, 'semantic');
  assert.ok(Array.isArray(result.hits), 'should have hits array');
  assert.ok(result.hits.length > 0, 'should have at least one hit');
  
  const firstHit = result.hits[0];
  assert.ok(firstHit.score !== undefined, 'hit should have score');
  assert.ok(firstHit.text !== undefined, 'hit should have text');
  assert.ok(Array.isArray(firstHit.refs), 'hit should have refs array');
});

test('git-ai ai semantic with repo-map - includes repo context', () => {
  const result = runJson('node', [
    CLI, 'ai', 'semantic', 'user service', 
    '--topk', '5', 
    '--with-repo-map', 
    '--repo-map-files', '3',
    '--repo-map-symbols', '2'
  ], testRepo);
  
  assertAgentReadableStructure(result, 'semantic with repo-map');
  assert.ok(result.repo_map, 'should have repo_map');
  assert.equal(result.repo_map.enabled, true, 'repo_map should be enabled');
  assert.ok(Array.isArray(result.repo_map.files), 'repo_map should have files array');
});

test('git-ai ai query - searches symbols by name', () => {
  const result = runJson('node', [CLI, 'ai', 'query', 'greet', '--limit', '10'], testRepo);
  
  assertAgentReadableStructure(result, 'query');
  assert.ok(typeof result.count === 'number', 'should have count');
  assert.ok(Array.isArray(result.rows), 'should have rows array');
  assert.ok(result.rows.length > 0, 'should have at least one result');
  
  const firstRow = result.rows[0];
  assert.ok(firstRow.symbol !== undefined, 'row should have symbol');
  assert.ok(firstRow.file !== undefined, 'row should have file');
});

test('git-ai ai query with different modes', () => {
  const modes = ['substring', 'prefix', 'wildcard', 'fuzzy', 'regex'];
  
  for (const mode of modes) {
    const args = mode === 'regex' 
      ? [CLI, 'ai', 'query', '^get.*r$', '--mode', mode, '--limit', '5']
      : [CLI, 'ai', 'query', 'get*', '--mode', mode, '--limit', '5'];
    
    const result = runJson('node', args, testRepo);
    assertAgentReadableStructure(result, `query mode=${mode}`);
  }
});

test('git-ai ai query-files - searches files by pattern', () => {
  const result = runJson('node', [CLI, 'ai', 'query-files', 'src', '--limit', '10'], testRepo);
  
  assertAgentReadableStructure(result, 'query-files');
  assert.ok(Array.isArray(result.files), 'should have files array');
  
  if (result.files.length > 0) {
    const firstFile = result.files[0];
    assert.ok(firstFile.path !== undefined, 'file should have path');
  }
});

test('git-ai ai repo-map - generates repository overview', () => {
  const result = runJson('node', [
    CLI, 'ai', 'repo-map', 
    '--max-files', '5', 
    '--max-symbols', '3',
    '--depth', '5'
  ], testRepo);
  
  assertAgentReadableStructure(result, 'repo-map');
  assert.ok(Array.isArray(result.files), 'should have files array');
  assert.ok(typeof result.formatted === 'string', 'should have formatted string');
  
  if (result.files.length > 0) {
    const firstFile = result.files[0];
    assert.ok(firstFile.path, 'file should have path');
    assert.ok(typeof firstFile.rank === 'number', 'file should have rank');
    assert.ok(Array.isArray(firstFile.symbols), 'file should have symbols');
  }
});

test('git-ai ai graph find - finds symbols by prefix', () => {
  const result = runJson('node', [CLI, 'ai', 'graph', 'find', 'greet'], testRepo);
  
  assertAgentReadableStructure(result, 'graph:find');
  assert.ok(result.result, 'should have result');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
  assert.ok(result.result.rows.length > 0, 'should find at least one symbol');
  
  const headers = result.result.headers;
  assert.ok(headers.includes('name'), 'headers should include name');
  assert.ok(headers.includes('kind'), 'headers should include kind');
  assert.ok(headers.includes('file'), 'headers should include file');
});

test('git-ai ai graph callers - finds callers of a function', () => {
  const result = runJson('node', [CLI, 'ai', 'graph', 'callers', 'greet', '--limit', '50'], testRepo);
  
  assertAgentReadableStructure(result, 'graph:callers');
  assert.ok(result.result, 'should have result');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
  
  if (result.result.rows.length > 0) {
    const headers = result.result.headers;
    assert.ok(headers.includes('caller_name'), 'headers should include caller_name');
    assert.ok(headers.includes('file'), 'headers should include file');
  }
});

test('git-ai ai graph callees - finds functions called by a function', () => {
  const result = runJson('node', [CLI, 'ai', 'graph', 'callees', 'formatGreeting', '--limit', '50'], testRepo);
  
  assertAgentReadableStructure(result, 'graph:callees');
  assert.ok(result.result, 'should have result');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
});

test('git-ai ai graph refs - finds references to a symbol', () => {
  const result = runJson('node', [CLI, 'ai', 'graph', 'refs', 'greet', '--limit', '50'], testRepo);
  
  assertAgentReadableStructure(result, 'graph:refs');
  assert.ok(result.result, 'should have result');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
});

test('git-ai ai graph chain - traces call chain', () => {
  const result = runJson('node', [
    CLI, 'ai', 'graph', 'chain', 'greet',
    '--direction', 'upstream',
    '--depth', '3',
    '--limit', '100'
  ], testRepo);
  
  assertAgentReadableStructure(result, 'graph:chain');
  assert.ok(result.result, 'should have result');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
  assert.equal(result.direction, 'upstream', 'should have direction');
  assert.equal(result.max_depth, 3, 'should have max_depth');
});

test('git-ai ai graph children - lists children of a node', () => {
  const result = runJson('node', [
    CLI, 'ai', 'graph', 'children', 
    'src/index.ts',
    '--as-file'
  ], testRepo);
  
  assertAgentReadableStructure(result, 'graph:children');
  assert.ok(result.result, 'should have result');
  assert.ok(result.parent_id, 'should have parent_id');
});

test('git-ai ai graph query - executes custom CozoDB query', () => {
  const query = "?[name, kind] := *ast_symbol{file, lang, name, kind}, file = 'src/index.ts'";
  const result = runJson('node', [CLI, 'ai', 'graph', 'query', query], testRepo);
  
  assertAgentReadableStructure(result, 'graph:query');
  assert.ok(result.result, 'should have result');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
});

test('git-ai ai pack - creates index archive', async () => {
  const result = runJson('node', [CLI, 'ai', 'pack'], testRepo);
  
  assertAgentReadableStructure(result, 'pack');
  assert.ok(result.repoRoot, 'should have repoRoot');
  
  const archivePath = path.join(testRepo, '.git-ai', 'lancedb.tar.gz');
  const stat = await fs.stat(archivePath);
  assert.ok(stat.size > 0, 'archive should exist and have content');
});

test('git-ai ai pack --lfs - creates LFS-ready archive', async () => {
  const result = runJson('node', [CLI, 'ai', 'pack', '--lfs'], testRepo);
  
  assertAgentReadableStructure(result, 'pack --lfs');
  assert.ok(result.repoRoot, 'should have repoRoot');
});

test('git-ai ai unpack - extracts index archive', async () => {
  await fs.rm(path.join(testRepo, '.git-ai', 'lancedb'), { recursive: true, force: true });
  
  const result = runJson('node', [CLI, 'ai', 'unpack'], testRepo);
  
  assertAgentReadableStructure(result, 'unpack');
  assert.ok(result.repoRoot, 'should have repoRoot');
  
  const lancedbPath = path.join(testRepo, '.git-ai', 'lancedb');
  const stat = await fs.stat(lancedbPath);
  assert.ok(stat.isDirectory(), 'lancedb directory should exist');
});

test('git-ai ai hooks install - installs git hooks', async () => {
  const result = runJson('node', [CLI, 'ai', 'hooks', 'install'], testRepo);
  
  assertAgentReadableStructure(result, 'hooks:install');
  assert.ok(result.repoRoot, 'should have repoRoot');
  
  const hooksPath = runOk('git', ['config', '--get', 'core.hooksPath'], testRepo).stdout.trim();
  assert.equal(hooksPath, '.githooks', 'core.hooksPath should be set');
  
  const hookFile = await fs.stat(path.join(testRepo, '.githooks', 'pre-commit'));
  assert.ok(hookFile.isFile(), 'pre-commit hook should exist');
});

test('git-ai ai hooks status - checks hooks status', () => {
  const result = runJson('node', [CLI, 'ai', 'hooks', 'status'], testRepo);
  
  assertAgentReadableStructure(result, 'hooks:status');
  assert.equal(result.installed, true, 'hooks should be installed');
});

test('git-ai ai hooks uninstall - removes git hooks', async () => {
  const result = runJson('node', [CLI, 'ai', 'hooks', 'uninstall'], testRepo);
  
  assertAgentReadableStructure(result, 'hooks:uninstall');
  assert.equal(result.hooksPath, null, 'hooksPath should be null');
});

test('git-ai ai agent install - installs agent templates', async () => {
  const result = runJson('node', [CLI, 'ai', 'agent', 'install'], testRepo);
  
  assertAgentReadableStructure(result, 'agent:install');
  assert.ok(result.repoRoot, 'should have repoRoot');
  assert.ok(result.installed, 'should have installed info');
  assert.ok(Array.isArray(result.installed.skills), 'should have skills array');
  assert.ok(Array.isArray(result.installed.rules), 'should have rules array');
});

test('git-ai ai agent install --overwrite - overwrites existing templates', async () => {
  const result = runJson('node', [CLI, 'ai', 'agent', 'install', '--overwrite'], testRepo);
  
  assertAgentReadableStructure(result, 'agent:install --overwrite');
  assert.equal(result.ok, true, 'should succeed');
});

test('git-ai ai index --incremental - performs incremental indexing', async () => {
  await writeFile(path.join(testRepo, 'src', 'new-file.ts'), `
export function newFunction(): string {
  return 'new';
}
`);
  runOk('git', ['add', '.'], testRepo);
  
  const result = runJson('node', [CLI, 'ai', 'index', '--incremental', '--staged'], testRepo);
  
  assertAgentReadableStructure(result, 'index --incremental');
  assert.equal(result.incremental, true, 'should be incremental');
  assert.equal(result.staged, true, 'should be staged');
});

test('git-ai error handling - returns structured errors', () => {
  const nonExistentPath = path.join(tmpDir, 'non-existent-repo-12345');
  const res = run('node', [CLI, 'ai', 'status', '--path', nonExistentPath], process.cwd());
  
  assert.notEqual(res.status, 0, 'should fail for non-existent repo');
  
  const output = res.stderr || res.stdout;
  assert.ok(output.includes('ok') || output.includes('problems') || output.includes('error'), 
    'should contain error information');
});

test('git-ai validation error - returns structured validation errors', () => {
  const res = run('node', [CLI, 'ai', 'semantic'], testRepo);
  
  assert.notEqual(res.status, 0, 'should fail without required text argument');
  
  const output = res.stderr || res.stdout;
  assert.ok(output.includes('error') || output.includes('required'), 
    'should contain error information about missing argument');
});

test('git-ai --version - outputs version', () => {
  const pkg = JSON.parse(require('fs').readFileSync(
    path.resolve(__dirname, '..', 'package.json'), 
    'utf-8'
  ));
  const res = runOk('node', [CLI, '--version'], process.cwd());
  assert.equal(res.stdout.trim(), pkg.version, 'should output correct version');
});

test('git-ai ai serve --help - shows help', () => {
  const res = runOk('node', [CLI, 'ai', 'serve', '--help'], testRepo);
  assert.ok(res.stdout.includes('serve'), 'help should mention serve');
});

test('all commands return agent-readable JSON structure', () => {
  const commands = [
    { args: ['ai', 'status', '--json'], name: 'status' },
    { args: ['ai', 'check-index'], name: 'check-index' },
    { args: ['ai', 'semantic', 'test', '--topk', '1'], name: 'semantic' },
    { args: ['ai', 'query', 'test', '--limit', '1'], name: 'query' },
    { args: ['ai', 'repo-map', '--max-files', '1'], name: 'repo-map' },
    { args: ['ai', 'graph', 'find', 'test'], name: 'graph:find' },
  ];
  
  for (const cmd of commands) {
    const result = runJson('node', [CLI, ...cmd.args], testRepo);
    assertAgentReadableStructure(result, cmd.name);
  }
});

test('output includes timing metadata for performance monitoring', () => {
  const result = runJson('node', [CLI, 'ai', 'semantic', 'test', '--topk', '1'], testRepo);
  
  assertAgentReadableStructure(result, 'semantic with timing');
  assert.ok(result.repoRoot, 'should have repoRoot');
});

test('multi-language support - indexes different file types', async () => {
  const multiLangRepo = await createTestRepo(tmpDir, 'multi-lang-repo', {
    'main.py': `
def hello(name: str) -> str:
    return f"Hello, {name}!"

class UserService:
    def __init__(self):
        self.users = {}
    
    def get_user(self, user_id: str):
        return self.users.get(user_id)
`,
    'main.go': `
package main

import "fmt"

func greet(name string) string {
    return fmt.Sprintf("Hello, %s!", name)
}

type UserService struct {
    users map[string]User
}

func (s *UserService) GetUser(id string) *User {
    if u, ok := s.users[id]; ok {
        return &u
    }
    return nil
}
`,
    'Main.java': `
public class Main {
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }
    
    public static void main(String[] args) {
        System.out.println(greet("World"));
    }
}
`,
  });
  
  runOk('node', [CLI, 'ai', 'index', '--overwrite'], multiLangRepo);
  
  const status = runJson('node', [CLI, 'ai', 'status', '--json'], multiLangRepo);
  assertAgentReadableStructure(status, 'multi-lang status');
  assert.equal(status.ok, true, 'multi-lang repo should be indexed');
  
  const pyResult = runJson('node', [CLI, 'ai', 'query', 'hello', '--lang', 'python', '--limit', '5'], multiLangRepo);
  assertAgentReadableStructure(pyResult, 'python query');
  
  const goResult = runJson('node', [CLI, 'ai', 'query', 'greet', '--lang', 'go', '--limit', '5'], multiLangRepo);
  assertAgentReadableStructure(goResult, 'go query');
  
  const javaResult = runJson('node', [CLI, 'ai', 'query', 'greet', '--lang', 'java', '--limit', '5'], multiLangRepo);
  assertAgentReadableStructure(javaResult, 'java query');
});

test('agent-readable output includes command metadata', () => {
  const result = runJson('node', [CLI, 'ai', 'semantic', 'test', '--topk', '1'], testRepo);
  
  assert.ok(result.command, 'should include command name');
  assert.ok(result.timestamp, 'should include timestamp');
  assert.ok(result.duration_ms >= 0, 'should include duration_ms');
  assert.ok(result.repoRoot, 'should include repoRoot');
});

test('error output includes helpful hints for agents', () => {
  const nonExistentPath = path.join(tmpDir, 'no-repo-hint-test');
  const res = run('node', [CLI, 'ai', 'status', '--path', nonExistentPath], process.cwd());
  
  assert.notEqual(res.status, 0, 'should fail');
  
  const output = res.stderr || res.stdout;
  assert.ok(output.includes('ok') || output.includes('problems') || output.includes('error'),
    'should contain error information');
});

test('graph commands return structured tabular data', () => {
  const result = runJson('node', [CLI, 'ai', 'graph', 'find', 'greet'], testRepo);
  
  assert.ok(result.result, 'should have result object');
  assert.ok(Array.isArray(result.result.headers), 'should have headers array');
  assert.ok(Array.isArray(result.result.rows), 'should have rows array');
  
  if (result.result.rows.length > 0) {
    const row = result.result.rows[0];
    assert.ok(Array.isArray(row), 'each row should be an array');
    assert.equal(row.length, result.result.headers.length, 'row length should match headers length');
  }
});

test('semantic search returns ranked results with scores', () => {
  const result = runJson('node', [CLI, 'ai', 'semantic', 'user service', '--topk', '3'], testRepo);
  
  assert.ok(Array.isArray(result.hits), 'should have hits array');
  
  if (result.hits.length > 1) {
    for (let i = 1; i < result.hits.length; i++) {
      assert.ok(
        result.hits[i - 1].score >= result.hits[i].score,
        'hits should be sorted by score descending'
      );
    }
  }
  
  for (const hit of result.hits) {
    assert.ok(typeof hit.score === 'number', 'each hit should have a numeric score');
    assert.ok(typeof hit.text === 'string', 'each hit should have text');
    assert.ok(Array.isArray(hit.refs), 'each hit should have refs array');
  }
});

test('repo-map returns PageRank-sorted files', () => {
  const result = runJson('node', [CLI, 'ai', 'repo-map', '--max-files', '5', '--max-symbols', '3'], testRepo);
  
  assert.ok(Array.isArray(result.files), 'should have files array');
  
  if (result.files.length > 1) {
    for (let i = 1; i < result.files.length; i++) {
      assert.ok(
        result.files[i - 1].rank >= result.files[i].rank,
        'files should be sorted by rank descending'
      );
    }
  }
  
  for (const file of result.files) {
    assert.ok(file.path, 'each file should have path');
    assert.ok(typeof file.rank === 'number', 'each file should have numeric rank');
    assert.ok(Array.isArray(file.symbols), 'each file should have symbols array');
  }
});

test('query with repo-map includes context', () => {
  const result = runJson('node', [
    CLI, 'ai', 'query', 'greet',
    '--limit', '5',
    '--with-repo-map',
    '--repo-map-files', '3'
  ], testRepo);
  
  assert.ok(result.repo_map, 'should have repo_map');
  assert.equal(typeof result.repo_map.enabled, 'boolean', 'repo_map.enabled should be boolean');
  
  if (result.repo_map.enabled) {
    assert.ok(Array.isArray(result.repo_map.files), 'repo_map should have files');
  } else {
    assert.ok(result.repo_map.skippedReason, 'disabled repo_map should have skippedReason');
  }
});

test('index command returns detailed metadata', async () => {
  const newRepo = await createTestRepo(tmpDir, 'index-test-repo', {
    'app.ts': 'export const app = () => "hello";',
  });
  
  const result = runJson('node', [CLI, 'ai', 'index', '--overwrite'], newRepo);
  
  assertAgentReadableStructure(result, 'index');
  assert.ok(result.repoRoot, 'should have repoRoot');
  assert.ok(typeof result.dim === 'number', 'should have dim');
  assert.equal(result.overwrite, true, 'should have overwrite=true');
});

test('pack/unpack preserves index integrity', async () => {
  const before = runJson('node', [CLI, 'ai', 'check-index'], testRepo);
  
  runJson('node', [CLI, 'ai', 'pack'], testRepo);
  await fs.rm(path.join(testRepo, '.git-ai', 'lancedb'), { recursive: true, force: true });
  runJson('node', [CLI, 'ai', 'unpack'], testRepo);
  
  const after = runJson('node', [CLI, 'ai', 'check-index'], testRepo);
  
  assert.equal(before.ok, after.ok, 'index status should be preserved');
});

test('hooks commands provide clear status information', async () => {
  runJson('node', [CLI, 'ai', 'hooks', 'install'], testRepo);
  
  const status = runJson('node', [CLI, 'ai', 'hooks', 'status'], testRepo);
  
  assertAgentReadableStructure(status, 'hooks:status');
  assert.equal(status.installed, true, 'should show installed=true');
  assert.ok(status.hooksPath, 'should have hooksPath');
  assert.ok(status.expected, 'should have expected path');
});

test('all graph subcommands return consistent structure', () => {
  const commands = [
    { args: ['ai', 'graph', 'find', 'greet'], name: 'graph:find' },
    { args: ['ai', 'graph', 'callers', 'greet', '--limit', '10'], name: 'graph:callers' },
    { args: ['ai', 'graph', 'refs', 'greet', '--limit', '10'], name: 'graph:refs' },
    { args: ['ai', 'graph', 'chain', 'greet', '--depth', '2', '--limit', '10'], name: 'graph:chain' },
  ];
  
  for (const cmd of commands) {
    const result = runJson('node', [CLI, ...cmd.args], testRepo);
    assertAgentReadableStructure(result, cmd.name);
    assert.ok(result.result, `${cmd.name} should have result`);
    assert.ok(result.result.headers, `${cmd.name} should have headers`);
    assert.ok(result.result.rows, `${cmd.name} should have rows`);
  }
});
