# Code Context Engine

[![ci](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml)
[![release](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml)
[![license](https://img.shields.io/github/license/mars167/git-ai-cli)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/code-context-engine)](https://www.npmjs.com/package/code-context-engine)
[![npm downloads](https://img.shields.io/npm/dm/code-context-engine)](https://www.npmjs.com/package/code-context-engine)

[简体中文](./README.zh-CN.md) | **English**

Code Context Engine is a local runtime for review agents and coding agents. It turns a repository into structured evidence and context bundles instead of exposing search rows as the primary product.

## Product Direction

The product center is:
- local TypeScript runtime
- task-oriented context builders
- agent bundle / skill templates

Default retrieval strategy:
- lexical / symbol first
- graph expand second
- semantic rerank last

## Install

```bash
npm install -g code-context-engine
```

## Runtime API

```ts
import { createCodeContextEngine } from 'code-context-engine';

const engine = createCodeContextEngine({ repoRoot: '/path/to/repo' });

const lexical = await engine.search.lexical({
  query: 'authenticateUser',
  mode: 'exact',
  pathPattern: 'src/auth/**',
  lang: 'ts',
});

const implementation = await engine.tasks.implementationContext({
  task: 'implementation_context',
  query: 'UserRepository',
  symbolHints: ['findById', 'save'],
});

const impact = await engine.tasks.findImpact({
  task: 'find_impact',
  query: 'UserService',
});

const review = await engine.tasks.reviewContextForDiff({
  task: 'review_pr',
  diffText: rawDiff,
});
```

## Symbol Navigation

The runtime now exposes higher-level navigation capabilities:
- `findDefinition`
- `findReferences`
- `findImplementations`
- `findImporters`
- `findExports`
- `findContainingScope`

## Thin MCP Adapter

The MCP adapter keeps only tools that directly help agent workflows:
- `check_index`
- `rebuild_index`
- `read_file`
- `repo_map`
- `lexical_search`
- `implementation_context`
- `find_tests`
- `find_impact`
- `find_extension_points`
- `review_context_for_diff`

```bash
code-context-engine ai serve
code-context-engine ai serve --http --port 3000
```

## Thin CLI Adapter

The CLI is retained only for local debugging and verification:

```bash
code-context-engine ai index --overwrite
code-context-engine ai check-index
code-context-engine ai status --json
code-context-engine ai repo-map --max-files 20
code-context-engine ai agent install
code-context-engine ai serve
```

## Agent Bundle

```bash
npx skills add mars167/git-ai-cli/skills/git-ai-code-search
code-context-engine ai agent install
```

## Verification

```bash
npm run build
npm test
```
