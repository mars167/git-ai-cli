# Code Context Engine

[![ci](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml)
[![release](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml)
[![license](https://img.shields.io/github/license/mars167/git-ai-cli)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/code-context-engine)](https://www.npmjs.com/package/code-context-engine)
[![npm downloads](https://img.shields.io/npm/dm/code-context-engine)](https://www.npmjs.com/package/code-context-engine)

**简体中文** | [English](./README.md)

Code Context Engine 是一个面向 review agent 和 coding agent 的本地运行时。它把仓库转成结构化证据包和上下文包，而不是把零散搜索结果当作产品核心。

## 产品定位

产品核心是：
- 本地 TypeScript runtime
- task-oriented context builders
- agent bundle / skill 模板

默认检索策略：
- lexical / symbol first
- graph expand second
- semantic rerank last

## 安装

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

Runtime 暴露的高阶导航能力：
- `findDefinition`
- `findReferences`
- `findImplementations`
- `findImporters`
- `findExports`
- `findContainingScope`

## 薄 MCP 适配层

MCP 只保留直接服务 agent 工作流的工具：
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

## 薄 CLI 适配层

CLI 仅保留本地调试和验证用途：

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

## 验证

```bash
npm run build
npm test
```
