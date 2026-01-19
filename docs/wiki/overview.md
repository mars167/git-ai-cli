# 概览

`git-ai` 是一个全局 CLI：
- 默认行为像 `git`：`git-ai status/commit/push/...` 会代理到系统 `git`
- AI 能力放在 `git-ai ai ...`：索引、检索、归档、hooks、MCP Server

## 核心目标
- 把代码仓的结构化索引放在 `.git-ai/` 下，并可通过归档文件 `.git-ai/lancedb.tar.gz` 分享
- 让 Agent 通过 MCP tools 低成本命中符号/片段，再按需读取文件

## 重要目录
- `.git-ai/meta.json`：索引元数据
- `.git-ai/lancedb/`：本地向量索引目录（通常不提交）
- `.git-ai/lancedb.tar.gz`：归档后的索引（可提交/可用 git-lfs 追踪）

