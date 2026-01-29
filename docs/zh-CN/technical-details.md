# 技术细节

本文档包含 git-ai 的详细技术说明，适合需要深入了解实现细节的开发者。

## Git 代理模式

`git-ai` 默认行为与 `git` 保持一致，可以作为 `git` 的直接替代品：

```bash
git-ai init
git-ai status
git-ai add -A
git-ai commit -m "msg"
git-ai push -u origin main
```

所有不包含 `ai` 子命令的调用都会被转发到系统 `git`。

## AI 子命令完整列表

所有 AI 相关能力放在 `git-ai ai` 下：

### 索引管理

```bash
# 查看索引状态
git-ai ai status

# 重建索引（覆盖模式）
git-ai ai index --overwrite

# 增量索引（仅索引暂存区文件）
git-ai ai index --incremental --staged
```

### 查询操作

```bash
# 符号检索（支持多种模式）
git-ai ai query Indexer --limit 10

# 语义搜索
git-ai ai semantic "semantic search" --topk 5

# AST 图查询
git-ai ai graph find GitAIV2MCPServer
git-ai ai graph callers functionName
git-ai ai graph callees functionName
git-ai ai graph chain functionName --max-depth 3
```

### DSR 操作

```bash
# 获取 Git 上下文和 DSR 状态
git-ai ai dsr context --json

# 为指定提交生成 DSR
git-ai ai dsr generate HEAD

# 从 DSR 文件重建索引
git-ai ai dsr rebuild-index

# 查询符号演变历史
git-ai ai dsr query symbol-evolution GitAIV2MCPServer --limit 200 --json
```

### 索引打包

```bash
# 打包索引归档
git-ai ai pack

# 使用 Git LFS 打包
git-ai ai pack --lfs

# 解包索引归档
git-ai ai unpack
```

### MCP Server

```bash
# 启动 MCP Server（stdio 模式）
git-ai ai serve
```

## DSR（Deterministic Semantic Record）

DSR 是按提交（per-commit）、不可变、确定性的语义工件。

### 核心特性

- **按提交存储**：每个 Git 提交对应一个 DSR 文件
- **不可变性**：DSR 文件一旦生成永不修改
- **确定性**：相同的代码和提交总是生成相同的 DSR
- **可重建**：数据库/索引仅为可删缓存，必须可由 DSR + Git 重建

### 文件结构

```
.git-ai/
├── dsr/
│   ├── <commit_hash_1>.json
│   ├── <commit_hash_2>.json
│   └── ...
├── lancedb/           # 向量数据库（可删缓存）
├── cozodb/            # 图数据库（可删缓存）
├── lancedb.tar.gz     # 索引归档
└── meta.json          # 元数据
```

### DSR 文件格式

每个 DSR 文件包含该提交的完整语义信息：

```json
{
  "commit_hash": "abc123...",
  "timestamp": "2024-01-01T00:00:00Z",
  "files": [
    {
      "path": "src/main.ts",
      "symbols": [
        {
          "name": "functionName",
          "kind": "function",
          "location": {"line": 10, "column": 0},
          "signature": "functionName(arg1: string): void"
        }
      ]
    }
  ]
}
```

## MCP Server 详细说明

### 工具列表

`git-ai ai serve` 提供以下 MCP 工具：

#### 1. `check_index`

检查索引是否就绪。

**参数**：
- `path` (string, required): 仓库根路径

**返回**：
```json
{
  "ok": true,
  "indexed": true,
  "commit_hash": "abc123...",
  "file_count": 1234,
  "symbol_count": 5678
}
```

#### 2. `repo_map`

获取仓库全局视图。

**参数**：
- `path` (string, required): 仓库根路径
- `max_files` (number, optional): 最大文件数，默认 20
- `max_symbols` (number, optional): 每个文件最大符号数，默认 5

#### 3. `search_symbols`

符号检索（支持多种模式）。

**参数**：
- `path` (string, required): 仓库根路径
- `query` (string, required): 查询字符串
- `mode` (string, optional): 搜索模式，可选值：`substring`、`prefix`、`wildcard`、`regex`、`fuzzy`，默认 `substring`
- `limit` (number, optional): 返回结果数，默认 50

#### 4. `semantic_search`

基于 LanceDB + SQ8 的语义检索。

**参数**：
- `path` (string, required): 仓库根路径
- `query` (string, required): 自然语言查询
- `topk` (number, optional): 返回结果数，默认 10

#### 5. `ast_graph_query`

基于 CozoDB 的 AST 图查询（CozoScript）。

**参数**：
- `path` (string, required): 仓库根路径
- `query` (string, required): CozoScript 查询语句
- `params` (object, optional): 查询参数

#### 6. `ast_graph_find`

按名称前缀查找符号。

**参数**：
- `path` (string, required): 仓库根路径
- `prefix` (string, required): 符号名前缀
- `limit` (number, optional): 返回结果数，默认 50

#### 7. `ast_graph_callers`

查找函数调用者。

**参数**：
- `path` (string, required): 仓库根路径
- `name` (string, required): 函数名
- `limit` (number, optional): 返回结果数，默认 200

#### 8. `ast_graph_callees`

查找函数调用的其他函数。

**参数**：
- `path` (string, required): 仓库根路径
- `name` (string, required): 函数名
- `limit` (number, optional): 返回结果数，默认 200

#### 9. `ast_graph_chain`

追踪完整调用链。

**参数**：
- `path` (string, required): 仓库根路径
- `name` (string, required): 函数名
- `direction` (string, optional): 追踪方向，可选值：`downstream`、`upstream`，默认 `downstream`
- `max_depth` (number, optional): 最大深度，默认 3
- `limit` (number, optional): 返回结果数，默认 500

#### 10. `read_file`

读取文件内容。

**参数**：
- `path` (string, required): 仓库根路径
- `file` (string, required): 文件相对路径
- `start_line` (number, optional): 起始行号，默认 1
- `end_line` (number, optional): 结束行号，默认 200

#### 11. `dsr_context`

获取仓库 Git 上下文和 DSR 目录状态。

**参数**：
- `path` (string, required): 仓库根路径

**返回**：
```json
{
  "ok": true,
  "commit_hash": "abc123...",
  "repo_root": "/path/to/repo",
  "branch": "main",
  "detached": false,
  "dsr_directory_state": {
    "total_commits": 100,
    "indexed_commits": 95,
    "missing_commits": ["def456...", "ghi789..."]
  }
}
```

#### 12. `dsr_generate`

为指定提交生成 DSR。

**参数**：
- `path` (string, required): 仓库根路径
- `commit` (string, optional): 提交哈希，默认 HEAD

#### 13. `dsr_rebuild_index`

从 DSR 文件重建索引。

**参数**：
- `path` (string, required): 仓库根路径

#### 14. `dsr_symbol_evolution`

追溯符号变更历史。

**参数**：
- `path` (string, required): 仓库根路径
- `symbol` (string, required): 符号名
- `start` (string, optional): 起始提交哈希
- `all` (boolean, optional): 是否返回所有历史，默认 false
- `limit` (number, optional): 返回结果数，默认 200
- `contains` (string, optional): 仅返回包含此提交的分支

### 调用约定

**重要**：所有 MCP 工具调用必须显式传递 `path` 参数。

```json
{
  "name": "search_symbols",
  "arguments": {
    "path": "/absolute/path/to/repo",
    "query": "functionName"
  }
}
```

禁止依赖进程状态或工作目录隐式推断仓库位置。

## Git Hooks 详细说明

### 安装 Hooks

```bash
git-ai ai hooks install
```

### Hook 行为

#### pre-commit

自动执行以下操作：
1. 增量索引暂存区文件：`index --incremental --staged`
2. 打包索引：`pack`
3. 将 `.git-ai/meta.json` 与 `.git-ai/lancedb.tar.gz` 加入暂存区

**注意**：索引内容以暂存区为准，确保提交的索引与代码一致。

#### pre-push

再次执行 `pack`，若归档发生变化则阻止 push，提示先提交归档文件。

这确保了每次 push 都包含最新的索引归档。

#### post-checkout / post-merge

若存在 `.git-ai/lancedb.tar.gz` 则自动执行 `unpack`。

这确保了切换分支或合并后，索引自动更新。

### 查看 Hook 状态

```bash
git-ai ai hooks status
```

## Git LFS 集成

### 为什么需要 Git LFS

索引归档 `.git-ai/lancedb.tar.gz` 可能较大（取决于项目规模），直接存入 Git 历史会导致：
- 仓库体积膨胀
- 克隆速度变慢
- Git 操作性能下降

使用 Git LFS 可以有效管理这些大文件。

### 开启 Git LFS（一次性）

```bash
# 安装 Git LFS（如果未安装）
git lfs install

# 跟踪索引归档
git lfs track ".git-ai/lancedb.tar.gz"

# 提交 .gitattributes
git add .gitattributes
git commit -m "chore: track lancedb archive via git-lfs"
```

### 使用 git-ai 触发 LFS

```bash
# 打包并自动使用 LFS（如果已安装 git-lfs）
git-ai ai pack --lfs
```

### 克隆/切分支后

如果你环境设置了 `GIT_LFS_SKIP_SMUDGE=1`，或发现 `.git-ai/lancedb.tar.gz` 不是有效的 gzip 文件：

```bash
git lfs pull
```

## Agent 模版详细说明

### Skill 模版

Skill 模版定义了 Agent 如何使用 git-ai 工具的最佳实践。

**位置**：`templates/agents/common/skills/git-ai-mcp/SKILL.md`

**核心内容**：
- 推荐工作流程（7 步）
- 工具选择指南
- 最佳实践
- 常见陷阱

### Rule 模版

Rule 模版定义了 Agent 使用 git-ai 工具时的行为约束。

**位置**：`templates/agents/common/rules/git-ai-mcp/RULE.md`

**核心内容**：
- 必须遵守的规则（must_follow）
- 推荐的做法（recommended）
- 禁止的行为（prohibited）
- 工具使用约束（tool_usage_constraints）

### 安装 Agent 模版

```bash
# 安装到当前仓库的默认位置
git-ai ai agent install

# 覆盖已存在的模版
git-ai ai agent install --overwrite

# 安装到自定义位置
git-ai ai agent install --to /custom/location/.agents

# 为特定 Agent 安装（如 Trae）
git-ai ai agent install --agent trae
```

## 性能指标

### 索引速度

- 1k 文件：< 5 秒
- 10k 文件：< 30 秒
- 100k 文件：< 5 分钟

### 查询速度

- 符号检索：< 10ms
- 语义搜索：< 100ms
- AST 图查询：< 50ms

### 存储占用

- DSR 文件：约 1-5 MB / 1k 文件
- LanceDB 索引：约 10-50 MB / 1k 文件
- CozoDB 索引：约 5-20 MB / 1k 文件
- 打包归档：约 15-75 MB / 1k 文件

## 故障排查

详见 [故障排查指南](./troubleshooting.md)。
