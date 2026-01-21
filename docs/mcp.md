# MCP Server 接入

`git-ai` 提供了一个基于 MCP (Model Context Protocol) 的 stdio Server，供 Agent (如 Claude Desktop, Trae 等) 调用，赋予 Agent “理解代码库”的能力。

## 启动

在目标仓库目录执行：

```bash
git-ai ai serve
```

该进程是 stdio 模式（会等待客户端连接）。你可以把它配置到支持 MCP 的客户端里。

## 工具列表

### 仓库管理
- `get_repo({ path? })`：返回当前默认仓库根目录（调试用）
- `set_repo({ path })`：设置默认仓库路径，避免依赖进程工作目录

### 索引管理
- `get_index_status({ path? })`：检查索引是否就绪，给出可执行的修复建议
- `index_repo({ path?, dim?, overwrite? })`：构建/更新索引
- `pack_index({ path?, lfs? })`：打包索引为 `.git-ai/lancedb.tar.gz`（可选启用 git-lfs track）
- `unpack_index({ path? })`：解包索引归档

### 检索
- `search_symbols({ query, limit?, path? })`：按子串搜索符号并返回文件位置
- `semantic_search({ query, topk?, path? })`：基于 LanceDB + SQ8 的语义检索

### 文件读取
- `list_files({ path?, pattern?, limit? })`：按 glob 列文件（默认忽略 node_modules, .git 等）
- `read_file({ path?, file, start_line?, end_line? })`：按行读取文件片段

## 推荐调用方式（让 Agent 自动传对路径）
- 第一次调用先 `set_repo({path: "/ABS/PATH/TO/REPO"})`
- 后续工具调用不传 `path`（走默认仓库）

## Agent Skills / Rules

本仓库提供了 Agent 可直接复用的 Skill/Rule 模版，旨在让 Agent 能够遵循最佳实践来使用上述工具。

- Skill 源码：[../.trae/skills/git-ai-mcp/SKILL.md](../.trae/skills/git-ai-mcp/SKILL.md)
- Rule 源码：[../.trae/rules/git-ai-mcp/RULE.md](../.trae/rules/git-ai-mcp/RULE.md)

### Skill 使用模版

#### 目标
用最少 token 完成“从问题 → 命中点 → 读代码 → 给结论/改动建议”的闭环：
1) 先用索引工具命中位置（符号/语义）  
2) 再精读关键文件片段（按行读取）  
3) 必要时重建/打包索引，保证检索结果可靠  

#### 索引保障（很关键）
当出现以下情况之一，先重建索引：
- `search_symbols` / `semantic_search` 没结果或明显过时
- 用户刚改了大量文件/刚切分支/刚合并

调用：
- `index_repo({ overwrite: true, dim: 256 })`
- 如需共享索引：`pack_index({ lfs: false })`

#### 检视套路（推荐顺序）

**1) 符号定位（最稳）**
当用户提到函数/类/文件名/模块名：
- `search_symbols({ query: "FooBar", limit: 50 })`

输出 rows 后，选最可能的 1-3 个命中点继续读代码：
- `read_file({ file: "src/xxx.ts", start_line: 1, end_line: 220 })`

**2) 语义检索（问法更自然）**
当用户描述行为（“在哪里初始化 DB / 哪里处理 auth / 错误如何返回”）：
- `semantic_search({ query: "where do we ...", topk: 5 })`

**3) 文件浏览**
当你需要找入口文件、配置文件、或按模式定位：
- `list_files({ pattern: "src/**/*.{ts,tsx,js,jsx}", limit: 500 })`

#### 输出要求
- 先给结论，再给证据（文件 + 行范围）
- 引用代码位置用 IDE 可点链接（file://...#Lx-Ly）
