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
  {
    const pkg = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
    const res = runOk('node', [CLI, '--version'], process.cwd());
    assert.equal(res.stdout.trim(), String(pkg.version));
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-e2e-'));
  const springRepo = await createRepo(tmp, 'spring-boot-jdk17', {
    'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <parent>\n    <groupId>org.springframework.boot</groupId>\n    <artifactId>spring-boot-starter-parent</artifactId>\n    <version>3.3.7</version>\n    <relativePath/>\n  </parent>\n  <groupId>com.example</groupId>\n  <artifactId>demo</artifactId>\n  <version>0.0.1</version>\n  <properties>\n    <java.version>17</java.version>\n  </properties>\n  <dependencies>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n      <artifactId>spring-boot-starter-web</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n`,
    'src/main/java/com/example/demo/DemoApplication.java': 'package com.example.demo;\n\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n\n@SpringBootApplication\npublic class DemoApplication {\n  public static void main(String[] args) {\n    SpringApplication.run(DemoApplication.class, args);\n  }\n}\n',
    'src/main/java/com/example/demo/api/HelloController.java': 'package com.example.demo.api;\n\nimport com.example.demo.service.GreetingService;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RequestParam;\nimport org.springframework.web.bind.annotation.RestController;\n\n@RestController\npublic class HelloController {\n  private final GreetingService greetingService;\n\n  public HelloController(GreetingService greetingService) {\n    this.greetingService = greetingService;\n  }\n\n  @GetMapping(\"/hello\")\n  public String hello(@RequestParam(defaultValue = \"world\") String name) {\n    return greetingService.greet(name).message();\n  }\n}\n',
    'src/main/java/com/example/demo/model/Greeting.java': 'package com.example.demo.model;\n\npublic record Greeting(String message) {\n  public static Greeting of(String name) {\n    return new Greeting(\"hello \" + name);\n  }\n}\n',
    'src/main/java/com/example/demo/service/GreetingService.java': 'package com.example.demo.service;\n\nimport com.example.demo.model.Greeting;\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class GreetingService {\n  public Greeting greet(String name) {\n    return Greeting.of(name);\n  }\n}\n',
  });
  const springMultiRepo = await createRepo(tmp, 'spring-boot-multi-module', {
    'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <parent>\n    <groupId>org.springframework.boot</groupId>\n    <artifactId>spring-boot-starter-parent</artifactId>\n    <version>3.3.7</version>\n    <relativePath/>\n  </parent>\n  <groupId>com.example</groupId>\n  <artifactId>multi</artifactId>\n  <version>0.0.1</version>\n  <packaging>pom</packaging>\n  <properties>\n    <java.version>17</java.version>\n  </properties>\n  <modules>\n    <module>lib</module>\n    <module>app</module>\n  </modules>\n</project>\n`,
    'lib/pom.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>multi</artifactId>\n    <version>0.0.1</version>\n  </parent>\n  <artifactId>lib</artifactId>\n  <dependencies>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n      <artifactId>spring-boot-starter</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n`,
    'app/pom.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>multi</artifactId>\n    <version>0.0.1</version>\n  </parent>\n  <artifactId>app</artifactId>\n  <dependencies>\n    <dependency>\n      <groupId>com.example</groupId>\n      <artifactId>lib</artifactId>\n      <version>${'${project.version}'}</version>\n    </dependency>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n      <artifactId>spring-boot-starter-web</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n`,
    'lib/src/main/java/com/example/lib/GreetingService.java': 'package com.example.lib;\n\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class GreetingService {\n  public String greet(String name) {\n    return \"hello \" + name;\n  }\n}\n',
    'app/src/main/java/com/example/app/MultiApplication.java': 'package com.example.app;\n\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n\n@SpringBootApplication(scanBasePackages = \"com.example\")\npublic class MultiApplication {\n  public static void main(String[] args) {\n    SpringApplication.run(MultiApplication.class, args);\n  }\n}\n',
    'app/src/main/java/com/example/app/api/PingController.java': 'package com.example.app.api;\n\nimport com.example.lib.GreetingService;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RequestParam;\nimport org.springframework.web.bind.annotation.RestController;\n\n@RestController\npublic class PingController {\n  private final GreetingService greetingService;\n\n  public PingController(GreetingService greetingService) {\n    this.greetingService = greetingService;\n  }\n\n  @GetMapping(\"/ping\")\n  public String ping(@RequestParam(defaultValue = \"world\") String name) {\n    return greetingService.greet(name);\n  }\n}\n',
  });
  const vueRepo = await createRepo(tmp, 'vue-frontend', {
    'package.json': JSON.stringify({ name: 'vue-frontend', private: true, scripts: { dev: 'vite' } }, null, 2) + '\n',
    'index.html': '<!doctype html><html><body><div id="app"></div></body></html>\n',
    'src/main.js': 'console.log("hello vue");\n',
  });

  for (const repo of [springRepo, springMultiRepo, vueRepo]) {
    runOk('node', [CLI, 'status'], repo);
    runOk('node', [CLI, 'ai', 'index', '--overwrite'], repo);
    runOk('node', [CLI, 'ai', 'pack'], repo);
    runOk('node', [CLI, 'ai', 'pack', '--lfs'], repo);
    runOk('node', [CLI, 'ai', 'agent', 'install'], repo);
    assert.ok(runOk('node', [CLI, 'ai', 'agent', 'install', '--overwrite'], repo).status === 0);
    {
      // git-ai-code-search has SKILL.md but no RULE.md, so only check SKILL
      const skill = await fs.readFile(path.join(repo, '.agents', 'skills', 'git-ai-code-search', 'SKILL.md'), 'utf-8');
      assert.ok(skill.includes('git-ai-code-search'), 'git-ai-code-search skill should be installed');
    }
    runOk('git', ['add', '.git-ai/meta.json', '.git-ai/lancedb.tar.gz'], repo);
    runOk('git', ['commit', '-m', 'add git-ai index'], repo);

    const meta = await fs.readFile(path.join(repo, '.git-ai', 'meta.json'), 'utf-8');
    assert.ok(meta.includes('"version"'));
    assert.ok(meta.includes('"index_schema_version": 3'));
    const archivePath = path.join(repo, '.git-ai', 'lancedb.tar.gz');
    const stat = await fs.stat(archivePath);
    assert.ok(stat.size > 0);

    await fs.rm(path.join(repo, '.git-ai', 'lancedb'), { recursive: true, force: true });
    runOk('node', [CLI, 'ai', 'unpack'], repo);
    const stat2 = await fs.stat(path.join(repo, '.git-ai', 'lancedb'));
    assert.ok(stat2.isDirectory());
    runOk('node', [CLI, 'ai', 'check-index'], repo);
    {
      const res = runOk('node', [CLI, 'ai', 'status', '--json'], repo);
      const obj = JSON.parse(res.stdout);
      assert.equal(obj.ok, true);
      assert.equal(obj.expected.index_schema_version, 3);
    }

    runOk('node', [CLI, 'ai', 'hooks', 'install'], repo);
    const hooksPath = runOk('git', ['config', '--get', 'core.hooksPath'], repo).stdout.trim();
    assert.equal(hooksPath, '.githooks');
    const hookFile = await fs.stat(path.join(repo, '.githooks', 'pre-commit'));
    assert.ok(hookFile.isFile());

    {
      const res = runOk('node', [CLI, 'ai', 'hooks', 'status'], repo);
      const obj = JSON.parse(res.stdout);
      assert.equal(obj.ok, true);
      assert.equal(obj.installed, true);
    }

    {
      const res = runOk('node', [CLI, 'ai', 'hooks', 'uninstall'], repo);
      const obj = JSON.parse(res.stdout);
      assert.equal(obj.ok, true);
      assert.equal(obj.hooksPath, null);
    }
  }

  {
    const res = runOk('node', [CLI, 'ai', 'query', 'HelloController', '--limit', '10'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(obj.count > 0);
    assert.ok(obj.rows.some(r => String(r.file || '').endsWith('.java')));
  }

  {
    const res = runOk('node', [CLI, 'ai', 'query', 'HelloController', '--limit', '10', '--with-repo-map', '--repo-map-files', '5', '--repo-map-symbols', '2'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(obj.repo_map && obj.repo_map.enabled === true);
    assert.ok(Array.isArray(obj.repo_map.files));
    assert.ok(obj.repo_map.files.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'query', 'PingController', '--limit', '10'], springMultiRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(obj.count > 0);
    assert.ok(obj.rows.some(r => String(r.file || '').includes('app/src/main/java/')));
  }

  {
    const res = runOk('node', [CLI, 'ai', 'semantic', 'hello controller', '--topk', '5'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.hits));
    assert.ok(obj.hits.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'semantic', 'hello controller', '--topk', '5', '--with-repo-map', '--repo-map-files', '5', '--repo-map-symbols', '2'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.hits));
    assert.ok(obj.repo_map && obj.repo_map.enabled === true);
    assert.ok(Array.isArray(obj.repo_map.files));
    assert.ok(obj.repo_map.files.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'graph', 'find', 'HelloController'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.result?.rows));
    assert.ok(obj.result.rows.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'graph', 'children', 'src/main/java/com/example/demo/api/HelloController.java', '--as-file'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.result?.rows));
    assert.ok(typeof obj.parent_id === 'string' && obj.parent_id.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'graph', 'query', "?[ref_id] := *ast_symbol{ref_id, file, lang, name: 'HelloController', kind, signature, start_line, end_line}"], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.result?.rows));
    assert.ok(obj.result.rows.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'graph', 'callers', 'greet', '--limit', '50'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.result?.rows));
    assert.ok(obj.result.rows.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'graph', 'refs', 'greet', '--limit', '50'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.result?.rows));
    assert.ok(obj.result.rows.length > 0);
  }

  {
    const res = runOk('node', [CLI, 'ai', 'graph', 'chain', 'greet', '--direction', 'upstream', '--depth', '2', '--limit', '200'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(Array.isArray(obj.result?.rows));
    assert.ok(obj.result.rows.length > 0);
  }

  for (const repo of [springRepo, springMultiRepo, vueRepo]) {
    const remote = await createBareRemote(tmp, path.basename(repo));
    runOk('git', ['remote', 'add', 'origin', remote], repo);
    runOk('node', [CLI, 'push', '-u', 'origin', 'main'], repo);
  }
});

test('git-ai can index repo-tool manifests workspace repos', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-e2e-'));
  const workspace = path.join(tmp, 'ws');
  await fs.mkdir(workspace, { recursive: true });

  const manifestRepo = await createRepo(workspace, path.join('.repo', 'manifests'), {
    'default.xml': '<manifest><project name="project-a" path="project-a"/><project name="project-b" path="project-b"/></manifest>\n',
  });

  const projectA = await createRepo(workspace, 'project-a', {
    'src/main/java/com/example/a/AService.java': 'package com.example.a;\npublic class AService { public String hello() { return "a"; } }\n',
  });
  const projectB = await createRepo(workspace, 'project-b', {
    'src/main/java/com/example/b/BController.java': 'package com.example.b;\npublic class BController { public String ping() { return "b"; } }\n',
  });

  for (const repo of [projectA, projectB]) {
    runOk('node', [CLI, 'status'], repo);
  }

  runOk('node', [CLI, 'ai', 'index', '--overwrite'], manifestRepo);
  const res = runOk('node', [CLI, 'ai', 'query', 'BController', '--limit', '20'], manifestRepo);
  const obj = JSON.parse(res.stdout);
  assert.ok(obj.count > 0);
  assert.ok(obj.rows.some(r => String(r.project?.path || '') === 'project-b' && String(r.file || '').includes('src/main/java/')));

  const res2 = runOk('node', [CLI, 'ai', 'query', 'BController', '--limit', '20', '--with-repo-map'], manifestRepo);
  const obj2 = JSON.parse(res2.stdout);
  assert.ok(obj2.repo_map && obj2.repo_map.enabled === false);
});
