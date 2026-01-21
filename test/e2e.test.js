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

  {
    const res = runOk('node', [CLI, 'ai', 'query', 'HelloController', '--limit', '10'], springRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(obj.count > 0);
    assert.ok(obj.rows.some(r => String(r.file || '').endsWith('.java')));
  }

  {
    const res = runOk('node', [CLI, 'ai', 'query', 'PingController', '--limit', '10'], springMultiRepo);
    const obj = JSON.parse(res.stdout);
    assert.ok(obj.count > 0);
    assert.ok(obj.rows.some(r => String(r.file || '').includes('app/src/main/java/')));
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
    'default.xml': '<manifest></manifest>\n',
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
  assert.ok(obj.rows.some(r => String(r.file || '').includes('project-b/src/main/java/')));
});
