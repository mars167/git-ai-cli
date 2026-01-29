# DSR（Deterministic Semantic Record）

DSR 是一个 **按提交（per-commit）** 的、**不可变（immutable）**、**确定性（deterministic）** 的语义工件：每个 Git commit 对应一份 DSR 文件。DSR 只负责“丰富提交节点的语义”，**永远不定义 Git DAG 的边**。

## 设计约束（不可违反）

- Git commit DAG 是历史与分支的唯一权威来源
- DSR 按提交生成：一个 commit → 一个 DSR 文件
- DSR 一旦生成不可修改；若发现冲突，视为系统错误并停止
- DSR 是规范工件（canonical artifact）；数据库/索引仅是可重建缓存（rebuildable cache）
- 绝不从语义数据推断 Git 拓扑（父子/分支/合并结构）

冲突优先级：

Git > DSR > Database > Heuristics

缺失数据处理：

- 缓存缺失：从 DSR + Git 重建
- DSR 缺失：报告并停止（不要推断）

## 存储布局

DSR 相关产物位于仓库根目录：

- `.git-ai/dsr/<commit_hash>.json`：单提交 DSR（规范工件）
- `.git-ai/dsr/dsr-index.sqlite`：DSR 查询加速索引（可删缓存）
- `.git-ai/dsr/dsr-index.export.json`：非 SQLite 后端时的导出快照（用于跨进程复用）

## DSR Schema（v1）

必填字段：

- `commit_hash`
- `affected_symbols`
- `ast_operations`
- `semantic_change_type`

可选字段：

- `summary`（默认使用 commit subject）
- `risk_level`

禁止字段（避免编码拓扑/分支信息）：

- parent commits / branch names / merge topology

## CLI 命令

### Phase 0：上下文发现

```bash
git-ai ai dsr context --json
```

产物（JSON）包含：

- `repo_root`
- `commit_hash`（HEAD commit）
- `branch` / `detached`
- `dsr_directory_state`（.git-ai 与 dsr 目录存在性/文件数）

### Phase 2：为单个提交生成 DSR

```bash
git-ai ai dsr generate <commit>
```

- `<commit>` 支持任何可解析为 commit 的 rev（例如 `HEAD`、sha、tag）
- 生成路径固定为 `.git-ai/dsr/<commit_hash>.json`
- 若文件已存在且内容不同会报错并停止（保证不可变性）

### Phase 3：从 DSR 重建缓存索引

```bash
git-ai ai dsr rebuild-index
```

该索引用于加速查询，语义事实不应只存在于数据库中。

### Phase 6：只读查询（Git DAG 先行）

```bash
git-ai ai dsr query symbol-evolution <symbol> --limit 200 --json
```

行为要点：

- 先按 `git rev-list --topo-order` 遍历 DAG
- 每个 commit 再读取对应 DSR 进行语义附着
- 遇到缺失 DSR 的 commit 会立刻停止并返回错误（不推断）
