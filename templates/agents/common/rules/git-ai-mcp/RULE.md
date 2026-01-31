# git-ai-mcp Rule

Agent 使用 git-ai MCP 工具的行为约束。

## 必须遵守

### explicit_path
- **级别**: error
- **规则**: 每次 MCP 工具调用必须显式传 `path` 参数。禁止依赖进程状态或工作目录隐式推断仓库位置。

### check_index_first
- **级别**: error
- **规则**: 使用 `search_symbols`、`semantic_search`、`ast_graph_*` 前，必须先调用 `check_index` 确认索引就绪。索引不兼容时必须重建，禁止在索引缺失时进行符号搜索。

### doc_index_scope
- **级别**: warning
- **规则**: 文档与规则模板已纳入索引（Markdown/YAML）。涉及 MCP、Skill、Rule 等问题时，优先使用 `semantic_search` 检索相关文档，再给出结论。

### understand_before_modify
- **级别**: error
- **规则**: 修改代码前必须先理解现有实现。流程：`search_symbols` 定位 → `read_file` 精读 → `ast_graph_callers` 确认影响范围 → 修改。禁止直接修改未读过的文件。

### use_dsr_for_history
- **级别**: warning
- **规则**: 追溯符号变更历史必须使用 `dsr_symbol_evolution`。禁止手动解析 git log 或 diff 来推断符号变更。

### repo_map_before_large_change
- **级别**: warning
- **规则**: 大型变更前必须使用 `repo_map` 确认影响范围。了解项目结构、关键文件、主要符号后再规划修改。

### respect_dsr_risk
- **级别**: warning
- **规则**: DSR 报告 `risk_level` 为 `high` 的变更必须谨慎对待。涉及 `delete`、`rename` 操作的变更需要额外审查。

## 推荐策略

- **优先语义搜索**: 理解功能意图时优先使用 `semantic_search`，精确定位时使用 `search_symbols`。
- **使用调用链**: 复杂调用链路使用 `ast_graph_chain` 追踪，避免手动递归查找 callers/callees。
- **按需生成 DSR**: 需要历史分析时，按需生成 DSR，避免一次性生成所有历史提交的 DSR。
- **附带上下文**: 复杂查询可附带 `repo_map`，帮助建立全局上下文。

## 禁止事项

| 行为 | 原因 |
|------|------|
| 假设符号位置而不搜索 | 必须通过 `search_symbols` 或 `semantic_search` 确认符号位置 |
| 直接修改未读过的文件 | 必须先 `read_file` 理解实现，避免破坏性变更 |
| 手动解析 git 历史 | 必须使用 `dsr_symbol_evolution` 追溯符号变更 |
| 在索引缺失时进行符号搜索 | 索引是符号搜索的前提，缺失时必须重建 |
| 忽略 DSR 风险等级 | high 风险变更需要额外审查，不能盲目应用 |
| 省略 `path` 参数 | 每次调用必须显式传 path，保证原子性和可复现性 |

## 工具使用约束

| 工具 | 使用时机 | 必传参数 | 前置检查 |
|------|----------|----------|----------|
| `repo_map` | 首次接触仓库、大型变更前 | `path` | - |
| `check_index` | 任何符号搜索前 | `path` | - |
| `rebuild_index` | 索引不兼容或缺失时 | `path` | - |
| `search_symbols` | 按名称查找符号 | `path`, `query` | `check_index` 通过 |
| `semantic_search` | 按语义查找代码 | `path`, `query` | `check_index` 通过 |
| `ast_graph_callers` | 查找调用者 | `path`, `name` | `check_index` 通过 |
| `ast_graph_callees` | 查找被调用者 | `path`, `name` | `check_index` 通过 |
| `ast_graph_chain` | 追踪调用链 | `path`, `name` | `check_index` 通过 |
| `dsr_context` | 了解仓库 Git 状态和 DSR 情况 | `path` | - |
| `dsr_generate` | 为特定提交生成 DSR | `path`, `commit` | - |
| `dsr_symbol_evolution` | 追溯符号变更历史 | `path`, `symbol` | 相关 DSR 已生成 |
| `read_file` | 精读代码 | `path`, `file` | - |
