# Development Guide

[简体中文](./DEVELOPMENT.zh-CN.md) | **English**

## Prerequisites
- Node.js 18+ (20+ recommended)
- Git (optional: git-lfs)

### Windows / Linux Installation Notes
- `@lancedb/lancedb` uses N-API prebuilt binaries, supporting win32/linux/darwin (x64/arm64). If installation fails, first check: Node version >=18 and architecture is x64/arm64.
- `tree-sitter` / `tree-sitter-typescript` rely on native extensions, usually fetching prebuilt binaries; if your platform/Node version doesn't hit a prebuilt binary, you need a local build toolchain:
  - Windows: Install "Visual Studio Build Tools (C++)" and Python (required by node-gyp)
  - Linux: Install `build-essential`, `python3` (package names may vary by distro)

## Install Dependencies & Build

```bash
npm i
npm run build
```

This project uses TypeScript to compile output to `dist/`.

## Local Run (Development)

```bash
npm run start -- --help
```

It is recommended to use `node dist/bin/git-ai.js ...` to verify behavior after packaging:

```bash
npm run build
node dist/bin/git-ai.js --help
node dist/bin/git-ai.js ai --help
```

## Global Installation (Local Verification)

```bash
npm i -g .
git-ai --version
```

## End-to-End Tests

```bash
npm test
```

Tests will create two types of repositories (Spring Boot / Vue) in a temporary directory and verify:
- `git-ai` proxies common git commands
- `git-ai ai index/pack/unpack/hooks`
- MCP server tool exposure

## Common Development Workflow

### 1) Run Indexing in Any Repo

```bash
cd /path/to/repo
git-ai ai index --overwrite
git-ai ai pack
```

### 2) Install Hooks (Auto-update index on commit)

```bash
git-ai ai hooks install
git-ai ai hooks status
```

### 3) Start MCP Server (For Agent Query)

```bash
git-ai ai serve
```

If the host cannot guarantee the working directory points to the repository directory, pass `path` in tool parameters (recommended for atomicity), or start the server with `git-ai ai serve --path /ABS/PATH/TO/REPO`.

## Publishing Notes (npm)
- Ensure `npm run build` has generated `dist/**`
- `package.json` `files` field includes `dist/**` and `assets/**`
- Confirm no sensitive info (tokens/keys) is committed before publishing

### GitHub Actions (Archive + GitHub Packages)
Repository provides a release workflow: when pushing tag `v*`, it will:
- `npm ci` + `npm test`
- `npm pack` generate tgz and upload as Release asset
- Publish to GitHub Packages (npm.pkg.github.com)

Note:
- GitHub Packages npm package names require a scope. The workflow will temporarily change the package name to `@<repo_owner>/git-ai` during publishing (without modifying source package.json).
- To publish to npmjs.org simultaneously, please configure `NPM_TOKEN` in repository Secrets.
