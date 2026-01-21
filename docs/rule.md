---
name: "git-ai-mcp"
description: "约束 Agent 使用 git-ai MCP 的行为（先索引再检索、证据引用、路径安全）。当 Agent 需要检视仓库代码或输出修改建议时使用。"
---

# Git-AI MCP（Rule）

此文档是 [./.trae/rules/git-ai-mcp/RULE.md](../.trae/rules/git-ai-mcp/RULE.md) 的副本，便于在项目说明文档中直接阅读与引用。

## 必须遵守
- 先确保仓库已绑定：优先调用 `set_repo`，再用 `get_repo` 校验。
- 符号/语义检索无结果或明显过期时，先 `index_repo({ overwrite: true })` 再重试检索。
- 任何实现结论必须给出证据：至少提供命中 `file` 与行范围，并基于 `read_file` 的实际内容得出结论。
- 不允许读取仓库外路径：`read_file.file` 必须是仓库根目录下的相对路径，不能使用 `../`。
- 任何新增设计/实现必须评估存储成本与性能：避免把大体量索引/构建产物集中写入主仓库，优先使用引用/按需加载/缓存，并明确缓存位置与清理策略。

## 推荐策略
- 优先 `search_symbols`（更稳定），再使用 `semantic_search` 做补充。
- 先小范围读文件（200 行内），定位到关键函数后再二次读取更精确行段。
- 需要共享索引或走 hooks 流程时，优先 `pack_index` 生成 `.git-ai/lancedb.tar.gz`，并提示用户将归档文件提交。
