const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'dist', 'bin', 'git-ai.js');

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (res.error) throw res.error;
  return res;
}

function runOk(cmd, args, cwd) {
  const res = run(cmd, args, cwd);
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

async function createBareRemote(baseDir, name) {
  const remoteDir = path.join(baseDir, `${name}.git`);
  await fs.mkdir(remoteDir, { recursive: true });
  runOk('git', ['init', '--bare'], remoteDir);
  return remoteDir;
}

test('git-ai works in Spring Boot and Vue repos', async () => {
  runOk('node', [CLI, '--version'], process.cwd());

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-e2e-'));
  const springRepo = await createRepo(tmp, 'spring-boot-jdk17', {
    'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.example</groupId>\n  <artifactId>demo</artifactId>\n  <version>0.0.1</version>\n  <properties>\n    <java.version>17</java.version>\n  </properties>\n</project>\n`,
    'src/main/java/com/example/demo/DemoApplication.java': 'package com.example.demo;\npublic class DemoApplication { public static void main(String[] args) {} }\n',
  });
  const vueRepo = await createRepo(tmp, 'vue-frontend', {
    'package.json': JSON.stringify({ name: 'vue-frontend', private: true, scripts: { dev: 'vite' } }, null, 2) + '\n',
    'index.html': '<!doctype html><html><body><div id="app"></div></body></html>\n',
    'src/main.js': 'console.log("hello vue");\n',
  });

  for (const repo of [springRepo, vueRepo]) {
    runOk('node', [CLI, 'status'], repo);
    runOk('node', [CLI, 'ai', 'index', '--overwrite'], repo);
    runOk('node', [CLI, 'ai', 'pack'], repo);
    runOk('git', ['add', '.git-ai/meta.json', '.git-ai/lancedb.tar.gz'], repo);
    runOk('git', ['commit', '-m', 'add git-ai index'], repo);

    const meta = await fs.readFile(path.join(repo, '.git-ai', 'meta.json'), 'utf-8');
    assert.ok(meta.includes('"version"'));
    const archivePath = path.join(repo, '.git-ai', 'lancedb.tar.gz');
    const stat = await fs.stat(archivePath);
    assert.ok(stat.size > 0);

    await fs.rm(path.join(repo, '.git-ai', 'lancedb'), { recursive: true, force: true });
    runOk('node', [CLI, 'ai', 'unpack'], repo);
    const stat2 = await fs.stat(path.join(repo, '.git-ai', 'lancedb'));
    assert.ok(stat2.isDirectory());

    runOk('node', [CLI, 'ai', 'hooks', 'install'], repo);
    const hooksPath = runOk('git', ['config', '--get', 'core.hooksPath'], repo).stdout.trim();
    assert.equal(hooksPath, '.githooks');
    const hookFile = await fs.stat(path.join(repo, '.githooks', 'pre-commit'));
    assert.ok(hookFile.isFile());
  }

  for (const repo of [springRepo, vueRepo]) {
    const remote = await createBareRemote(tmp, path.basename(repo));
    runOk('git', ['remote', 'add', 'origin', remote], repo);
    runOk('node', [CLI, 'push', '-u', 'origin', 'main'], repo);
  }
});
