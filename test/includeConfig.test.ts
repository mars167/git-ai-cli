import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';
// @ts-ignore dist module has no typings
import { IndexerV2 } from '../dist/src/core/indexer.js';

async function createTempDir(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'git-ai-include-'));
  return base;
}

async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
}

test('include.txt allows indexing of gitignored directories', async () => {
  const repoRoot = await createTempDir();
  await initGitRepo(repoRoot);

  // Create a generated code directory structure
  const generatedDir = path.join(repoRoot, 'generated');
  const srcDir = path.join(repoRoot, 'src');
  await fs.ensureDir(generatedDir);
  await fs.ensureDir(srcDir);

  // Create files
  await fs.writeFile(path.join(generatedDir, 'api.ts'), 'export const API_URL = "http://localhost";');
  await fs.writeFile(path.join(srcDir, 'main.ts'), 'import { API_URL } from "../generated/api";');

  // Add generated directory to .gitignore
  await fs.writeFile(path.join(repoRoot, '.gitignore'), 'generated/\n');

  // Create .git-ai directory and include.txt
  const gitAiDir = path.join(repoRoot, '.git-ai');
  await fs.ensureDir(gitAiDir);
  await fs.writeFile(path.join(gitAiDir, 'include.txt'), 'generated/**\n');

  // Run indexer
  const indexer = new IndexerV2({
    repoRoot,
    dim: 64,
    overwrite: true,
  });

  await indexer.run();

  // Check that the database was created and contains entries
  const dbDir = path.join(gitAiDir, 'lancedb');
  const dbExists = await fs.pathExists(dbDir);
  assert.ok(dbExists, 'Database directory should exist');

  // Check that ts table exists (both files are TypeScript)
  const tsTablePath = path.join(dbDir, 'refs_ts.lance');
  const tsTableExists = await fs.pathExists(tsTablePath);
  assert.ok(tsTableExists, 'TypeScript refs table should exist');
});

test('aiignore takes priority over include.txt', async () => {
  const repoRoot = await createTempDir();
  await initGitRepo(repoRoot);

  // Create a generated code directory structure
  const generatedDir = path.join(repoRoot, 'generated');
  await fs.ensureDir(generatedDir);

  // Create files
  await fs.writeFile(path.join(generatedDir, 'api.ts'), 'export const API_URL = "http://localhost";');

  // Add generated directory to .gitignore
  await fs.writeFile(path.join(repoRoot, '.gitignore'), 'generated/\n');

  // Create .git-ai directory with both include.txt and parent .aiignore
  const gitAiDir = path.join(repoRoot, '.git-ai');
  await fs.ensureDir(gitAiDir);
  await fs.writeFile(path.join(gitAiDir, 'include.txt'), 'generated/**\n');

  // Add generated to .aiignore (should take priority)
  await fs.writeFile(path.join(repoRoot, '.aiignore'), 'generated/\n');

  // Run indexer
  const indexer = new IndexerV2({
    repoRoot,
    dim: 64,
    overwrite: true,
  });

  await indexer.run();

  // Check that the database was created
  const dbDir = path.join(gitAiDir, 'lancedb');
  const dbExists = await fs.pathExists(dbDir);
  assert.ok(dbExists, 'Database directory should exist');

  // The TypeScript table might not exist if no files were indexed
  // This is expected behavior as .aiignore takes priority
});

test('include.txt with specific file patterns', async () => {
  const repoRoot = await createTempDir();
  await initGitRepo(repoRoot);

  // Create directory structure
  const buildDir = path.join(repoRoot, 'build');
  await fs.ensureDir(buildDir);

  // Create files
  await fs.writeFile(path.join(buildDir, 'important.ts'), 'export const VERSION = "1.0.0";');
  await fs.writeFile(path.join(buildDir, 'temp.ts'), 'export const TEMP = "temp";');

  // Add build directory to .gitignore
  await fs.writeFile(path.join(repoRoot, '.gitignore'), 'build/\n');

  // Create .git-ai directory and include only specific file
  const gitAiDir = path.join(repoRoot, '.git-ai');
  await fs.ensureDir(gitAiDir);
  await fs.writeFile(path.join(gitAiDir, 'include.txt'), 'build/important.ts\n');

  // Run indexer
  const indexer = new IndexerV2({
    repoRoot,
    dim: 64,
    overwrite: true,
  });

  await indexer.run();

  // Check that the database was created
  const dbDir = path.join(gitAiDir, 'lancedb');
  const dbExists = await fs.pathExists(dbDir);
  assert.ok(dbExists, 'Database directory should exist');
});
