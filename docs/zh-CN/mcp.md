# MCP Server 接入

`git-ai` 提供了一个基于 MCP (Model Context Protocol) 的 stdio Server，供 Agent (如 Claude Desktop, Trae 等) 调用，赋予 Agent "理解代码库"的能力。

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
- `check_index({ path? })`：检查索引结构是否与当前版本一致（不一致需重建索引）
- `rebuild_index({ path?, dim?, overwrite? })`：重建全量索引（写入 `.git-ai/`；Risk: high）
- `pack_index({ path?, lfs? })`：打包索引为 `.git-ai/lancedb.tar.gz`（可选启用 git-lfs track）
- `unpack_index({ path? })`：解包索引归档

### 检索
- `search_symbols({ query, mode?, case_insensitive?, max_candidates?, limit?, lang?, path?, with_repo_map?, repo_map_max_files?, repo_map_max_symbols?, wiki_dir? })`：符号检索（lang: auto/all/java/ts；可选附带 repo_map）
- `semantic_search({ query, topk?, lang?, path?, with_repo_map?, repo_map_max_files?, repo_map_max_symbols?, wiki_dir? })`：基于 LanceDB + SQ8 的语义检索（lang: auto/all/java/ts；可选附带 repo_map）
- `repo_map({ path?, max_files?, max_symbols?, wiki_dir? })`：生成 repo map（重要文件/符号排名、引导 Wiki 阅读）
- `ast_graph_find({ prefix, limit?, lang?, path? })`：按名字前缀查找符号定义（大小写不敏感；lang: auto/all/java/ts）
- `ast_graph_children({ id, as_file?, path? })`：列出包含关系的直接子节点（文件→顶层符号、类→方法等）
- `ast_graph_refs({ name, limit?, lang?, path? })`：按名字查引用位置（call/new/type；lang: auto/all/java/ts）
- `ast_graph_callers({ name, limit?, lang?, path? })`：按名字查调用者（callee name；lang: auto/all/java/ts）
- `ast_graph_callees({ name, limit?, lang?, path? })`：按名字查被调用者（caller name；lang: auto/all/java/ts）
- `ast_graph_chain({ name, direction?, max_depth?, limit?, lang?, path? })`：按名字查调用链路（upstream/downstream，最大深度；lang: auto/all/java/ts）
- `ast_graph_query({ query, params?, path? })`：对 AST 图数据库执行 CozoScript 查询（进阶）

### 文件读取
- `list_files({ path?, pattern?, limit? })`：按 glob 列文件（默认忽略 node_modules, .git 等）
- `read_file({ path?, file, start_line?, end_line? })`：按行读取文件片段

## AST 图查询示例

列出指定文件里的顶层符号（推荐：无需手动算 file_id）：

```js
ast_graph_children({ id: "src/mcp/server.ts", as_file: true })
```

查询某个方法/函数的调用者（推荐：用 callers/callees/chain，不用手写 CozoScript）：

```js
ast_graph_callers({ name: "greet", limit: 50 })
ast_graph_chain({ name: "greet", direction: "upstream", max_depth: 3 })
```

列出指定文件里的顶层符号（进阶：直接写 CozoScript，需要 file_id）：

```cozo
?[file_id] <- [[$file_id]]
?[child_id, name, kind, start_line, end_line] :=
  *ast_contains{parent_id: file_id, child_id},
  *ast_symbol{ref_id: child_id, file, name, kind, signature, start_line, end_line}
```

## 推荐调用方式（让 Agent 自动传对路径）
- 第一次调用先 `set_repo({path: "/ABS/PATH/TO/REPO"})`
- 后续工具调用不传 `path`（走默认仓库）

## RepoMap 使用建议

repo map 用于给 Agent 一个"全局鸟瞰 + 导航入口"（重要文件/符号 + Wiki 关联），建议作为分析前置步骤：

```js
repo_map({ max_files: 20, max_symbols: 5 })
```

如果你希望在一次检索结果里顺带附加 repo map（默认关闭，避免输出膨胀）：

```js
search_symbols({ query: "Foo", limit: 20, with_repo_map: true, repo_map_max_files: 20, repo_map_max_symbols: 5 })
semantic_search({ query: "where is auth handled", topk: 5, with_repo_map: true })
```

## Agent Skills / Rules

本仓库提供了 Agent 可直接复用的 Skill/Rule 模板，旨在让 Agent 能够遵循最佳实践来使用上述工具。

### YAML 格式模板

- **Skill**: [`templates/agents/common/skills/git-ai/skill.yaml`](../../templates/agents/common/skills/git-ai/skill.yaml) - 指导 Agent 如何使用 git-ai 的 Git-native 语义体系（包含 DSR 约束）与 MCP 工具
  - 包含：触发条件、工作流步骤、工具定义、输出要求、常见陷阱
  
- **Rule**: [`templates/agents/common/rules/git-ai.yaml`](../../templates/agents/common/rules/git-ai.yaml) - 约束 Agent 使用 git-ai MCP 的行为
  - 包含：必须遵守的规则、推荐策略、禁止事项、Git Hooks 规则、Manifest Workspace 规则

### Markdown 模版（便于直接阅读/复制）

- **Skill**: [`templates/agents/common/skills/git-ai-mcp/SKILL.md`](../../templates/agents/common/skills/git-ai-mcp/SKILL.md)
- **Rule**: [`templates/agents/common/rules/git-ai-mcp/RULE.md`](../../templates/agents/common/rules/git-ai-mcp/RULE.md)

### 安装到 Trae

将本仓库的 Skills 和 Rules 安装到当前项目的 `.agents` 目录（默认）：

```bash
cd /path/to/your-repo
git-ai ai agent install
git-ai ai agent install --overwrite
git-ai ai agent install --to /custom/location/.agents
```

如果你希望安装到 Trae 的 `.trae` 目录：

```bash
git-ai ai agent install --agent trae
```

### Skill 工作流概览

根据 `skill.yaml`，推荐的工作流程：

1. **绑定仓库** (`bind_repo`) - 确保仓库已绑定
2. **确保索引新鲜** (`ensure_index`) - 必要时重建索引
3. **定位符号** (`locate_symbols`) - 使用 `search_symbols` 精确查找
4. **语义搜索** (`semantic_search`) - 自然语言描述搜索
5. **浏览文件** (`browse_files`) - 使用 `list_files` 查找文件
6. **AST 查询** (`ast_query`) - 递归/关系类查询
7. **读取代码** (`read_code`) - 使用 `read_file` 读取关键片段

### Rule 约束概览

根据 `rule.yaml`，Agent 必须遵守：

- **bind_repo_first**: 先绑定仓库再操作
- **index_before_search**: 搜索无结果时先重建索引
- **evidence_based_conclusion**: 结论必须有证据（文件+行号）
- **path_safety**: 禁止读取仓库外路径
- **storage_cost_evaluation**: 评估存储成本

禁止事项包括：
- 默认使用外部 embedding 服务
- 直接提交 `.git-ai/lancedb/` 目录
- 使用 `../` 读取外部文件
- 假设索引是最新的而不检查

## DSR 与 MCP 的关系

- MCP tools 主要覆盖“索引（.git-ai）构建与检索”，用于让 Agent 低成本定位证据
- DSR 是“按提交的语义工件（.git-ai/dsr）”，用于语义历史/演化类查询与可重建缓存
- 任何历史遍历都必须从 Git DAG 出发（DSR 只 enrich 节点，不定义边）

DSR 相关命令见：[DSR 文档](./dsr.md)
## 输出要求

Agent 使用 git-ai MCP 工具时应遵循：

1. **先给结论，再给证据** - 先总结发现，再提供详细位置
2. **使用 IDE 可点击链接** - 格式：`file:///path/to/file#L10-L20`
3. **最小改动原则** - 建议修改时避免引入新依赖
4. **证据必须基于 read_file** - 不要基于假设或猜测
