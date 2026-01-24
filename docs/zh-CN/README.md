# 文档中心

[**English**](../README.md) | 简体中文

这里汇集了 `git-ai` 的所有文档。

## 概览

`git-ai` 是一个全局 CLI：
- 默认行为像 `git`：`git-ai status/commit/push/...` 会代理到系统 `git`
- AI 能力放在 `git-ai ai ...`：索引、检索、归档、hooks、MCP Server

### 核心目标
- 把代码仓的结构化索引放在 `.git-ai/` 下，并可通过归档文件 `.git-ai/lancedb.tar.gz` 分享
- 让 Agent 通过 MCP tools 低成本命中符号/片段，再按需读取文件

### 重要目录
- `.git-ai/meta.json`：索引元数据（本地生成，通常不提交）
- `.git-ai/lancedb/`：本地向量索引目录（通常不提交）
- `.git-ai/lancedb.tar.gz`：归档后的索引（可提交/可用 git-lfs 追踪）
- `.git-ai/ast-graph.sqlite`：AST 图数据库（CozoDB）
- `.git-ai/ast-graph.export.json`：AST 图导出快照（用于非 SQLite 后端跨进程复用）

## 目录

### 使用指引
- [安装与快速开始](./quickstart.md)
- [Windows 开发与安装指引](./windows-setup.md)
- [命令行使用](./cli.md)
- [Hooks 工作流](./hooks.md)
- [MCP Server 接入](./mcp.md)
- [Manifest Workspace 支持](./manifests.md)
- [排障](./troubleshooting.md)

### 进阶与原理
- [进阶：索引归档与 LFS](./advanced.md)
- [架构设计](./design.md)
- [开发规则](./rules.md)

## Agent 集成
- [MCP Skill & Rule 模版](./mcp.md#agent-skills--rules)
