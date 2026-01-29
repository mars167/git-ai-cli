# git-ai-mcp Skill

指导 Agent 使用 git-ai MCP 工具高效理解和操作代码库。

## 目标用户

使用 Claude Desktop、Trae 等支持 MCP 的本地 Code Agent 的开发者。

## 核心能力

1. **仓库全局理解** - 通过 `repo_map` 快速获取项目结构和关键文件概览
2. **符号检索** - 使用 `search_symbols` 和 `semantic_search` 定位代码
3. **代码关系分析** - 通过 `ast_graph_callers/callees/chain` 理解调用关系
4. **变更历史追溯** - 使用 `dsr_symbol_evolution` 追踪符号演变
5. **代码精读** - 使用 `read_file` 深入理解关键代码片段
6. **索引管理** - 按需重建索引，确保检索准确性

## 推荐工作流

### 1. 首次接触仓库

获取全局视图，了解项目结构：

```js
repo_map({ path: "/ABS/PATH/TO/REPO", max_files: 20, max_symbols: 5 })
```

### 2. 检查索引状态

确保索引就绪，否则重建：

```js
check_index({ path: "/ABS/PATH/TO/REPO" })
// 如果不兼容，重建：
rebuild_index({ path: "/ABS/PATH/TO/REPO" })
```

### 3. 定位目标代码

按名称查找：

```js
search_symbols({ path: "/ABS/PATH/TO/REPO", query: "handleRequest", mode: "substring", limit: 20 })
```

按语义查找：

```js
semantic_search({ path: "/ABS/PATH/TO/REPO", query: "用户认证逻辑在哪里", topk: 10 })
```

### 4. 理解代码关系

查找调用者：

```js
ast_graph_callers({ path: "/ABS/PATH/TO/REPO", name: "handleRequest", limit: 50 })
```

查找被调用者：

```js
ast_graph_callees({ path: "/ABS/PATH/TO/REPO", name: "handleRequest", limit: 50 })
```

追踪调用链：

```js
ast_graph_chain({ path: "/ABS/PATH/TO/REPO", name: "handleRequest", direction: "upstream", max_depth: 3 })
```

### 5. 追溯变更历史

查看符号的历史变更：

```js
dsr_symbol_evolution({ path: "/ABS/PATH/TO/REPO", symbol: "handleRequest", limit: 50 })
```

模糊匹配：

```js
dsr_symbol_evolution({ path: "/ABS/PATH/TO/REPO", symbol: "Request", contains: true, limit: 100 })
```

### 6. 精读代码

```js
read_file({ path: "/ABS/PATH/TO/REPO", file: "src/auth.ts", start_line: 1, end_line: 100 })
```

### 7. 提供建议

基于完整的代码理解，提供修改建议或生成代码。

## 工具选择指南

| 场景 | 工具 | 关键参数 |
|------|------|----------|
| 了解项目结构 | `repo_map` | `path`, `max_files`, `max_symbols` |
| 按名称查找符号 | `search_symbols` | `path`, `query`, `mode`, `limit` |
| 按语义查找代码 | `semantic_search` | `path`, `query`, `topk` |
| 查找调用者 | `ast_graph_callers` | `path`, `name`, `limit` |
| 查找被调用者 | `ast_graph_callees` | `path`, `name`, `limit` |
| 追踪调用链 | `ast_graph_chain` | `path`, `name`, `direction`, `max_depth` |
| 查看符号历史 | `dsr_symbol_evolution` | `path`, `symbol`, `limit` |
| 生成 DSR | `dsr_generate` | `path`, `commit` |
| 读取代码 | `read_file` | `path`, `file`, `start_line`, `end_line` |

## 最佳实践

1. **每次调用必须显式传 `path` 参数**，保证调用原子性
2. **优先使用高层语义工具**（symbol search）而非低层文件遍历
3. **修改代码前必须先理解现有实现**，避免破坏性变更
4. **使用 DSR 工具理解历史变更**，而非手动 git log
5. **大型变更前先 `repo_map` 确认影响范围**
6. **索引不兼容时及时重建**，确保检索准确性

## 常见陷阱

- ❌ 不要假设符号位置，必须通过 search 确认
- ❌ 不要直接修改未读过的文件
- ❌ 不要手动解析 git 历史，使用 DSR 工具
- ❌ 不要在索引缺失时进行符号搜索
- ❌ 不要忽略 DSR 的风险等级提示

## 触发模式

当用户说以下话时，使用对应工具：

- "帮我理解这个项目" / "项目结构是什么" → `repo_map`
- "查找 XX 函数" / "搜索 XX 方法" → `search_symbols`
- "XX 在哪里实现" / "XX 怎么调用" → `semantic_search` + `ast_graph_callers`
- "XX 的变更历史" / "XX 什么时候修改" → `dsr_symbol_evolution`
- "重构 XX" / "修改 XX" → 先 `callers/callees/chain` 确认影响范围
