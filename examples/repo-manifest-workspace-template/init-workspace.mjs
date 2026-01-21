import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function runOk(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const out = `${res.stdout || ''}\n${res.stderr || ''}`;
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${out}`);
  }
  return res;
}

async function write(p, content) {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function initGitRepo(repoDir, files) {
  await mkdir(repoDir, { recursive: true });
  runOk('git', ['init', '-b', 'main'], repoDir);
  runOk('git', ['config', 'user.email', 'template@example.com'], repoDir);
  runOk('git', ['config', 'user.name', 'Template'], repoDir);
  for (const [rel, content] of Object.entries(files)) {
    await write(path.join(repoDir, rel), content);
  }
  runOk('git', ['add', '-A'], repoDir);
  runOk('git', ['commit', '-m', 'init'], repoDir);
}

const root = path.resolve(process.cwd(), 'examples', 'repo-manifest-workspace-template');
const ws = path.join(root, 'ws');

await rm(ws, { recursive: true, force: true });
await mkdir(ws, { recursive: true });

await initGitRepo(path.join(ws, '.repo', 'manifests'), {
  'default.xml': '<manifest><project name="project-a" path="project-a"/><project name="project-b" path="project-b"/></manifest>\n',
});

await initGitRepo(path.join(ws, 'project-a'), {
  'src/main/java/com/example/a/AService.java': 'package com.example.a;\npublic class AService { public String hello() { return "a"; } }\n',
});

await initGitRepo(path.join(ws, 'project-b'), {
  'src/main/java/com/example/b/BController.java': 'package com.example.b;\npublic class BController { public String ping() { return "b"; } }\n',
});

console.log(JSON.stringify({ ok: true, ws }, null, 2));

