---
name: "git-ai-mcp"
description: "通过 git-ai 的 MCP 工具检视/检索代码仓。用户要“找实现/定位符号/语义搜索/读取文件/重建索引/MCP 相关问题”时调用。"
---

# Git-AI MCP（Agent 使用模版）

## 目标
用最少 token 完成“从问题 → 命中点 → 读代码 → 给结论/改动建议”的闭环：
1) 先用索引工具命中位置（符号/语义）  
2) 再精读关键文件片段（按行读取）  
3) 必要时重建/打包索引，保证检索结果可靠  

## 开始前：绑定仓库
当对话里给了明确仓库路径，或你不确定 MCP 进程 cwd 是否在仓库目录：

1. `set_repo({ path: "/ABS/PATH/TO/REPO" })`
2. `get_repo({})` 校验 repoRoot 是否正确

后续调用尽量不传 `path`（保持默认仓库一致），除非你需要切换仓库。

## 索引保障（很关键）
当出现以下情况之一，先重建索引：
- `search_symbols` / `semantic_search` 没结果或明显过时
- 用户刚改了大量文件/刚切分支/刚合并

调用：
- `index_repo({ overwrite: true, dim: 256 })`
- 如需共享索引：`pack_index({ lfs: false })`

## 检视套路（推荐顺序）

### 1) 符号定位（最稳）
当用户提到函数/类/文件名/模块名：
- `search_symbols({ query: "FooBar", limit: 50 })`

输出 rows 后，选最可能的 1-3 个命中点继续读代码：
- `read_file({ file: "src/xxx.ts", start_line: 1, end_line: 220 })`
- 若需要更小范围：根据 start_line/end_line 二次读取

### 2) 语义检索（问法更自然）
当用户描述行为（“在哪里初始化 DB / 哪里处理 auth / 错误如何返回”）：
- `semantic_search({ query: "where do we ...", topk: 5 })`

语义检索返回的是摘要行（file/kind/signature），仍需要用 `read_file` 打开文件确认真实实现。

### 3) 文件浏览
当你需要找入口文件、配置文件、或按模式定位：
- `list_files({ pattern: "src/**/*.{ts,tsx,js,jsx}", limit: 500 })`
- `list_files({ pattern: "**/*mcp*", limit: 200 })`

## 输出要求（给用户的答复）
- 先给结论，再给证据（文件 + 行范围）
- 引用代码位置用 IDE 可点链接（file://...#Lx-Ly）
- 若需要改代码：给出最小改动集、避免引入新依赖

## 常见坑
- MCP 的 `semantic_search` 依赖 `.git-ai/lancedb`：没索引就没结果
- 修改索引后建议 `pack_index`，并把 `.git-ai/lancedb.tar.gz` 提交（如果团队要共享）
- `read_file` 只能读仓库内相对路径，不允许 `../` 越界

