# git-ai Design（LanceDB + SQ8 + 去重）

## 1. 目标
- 使用 LanceDB 作为本地索引存储（列式 + 可扩展）。
- 引入 SQ8（8-bit 标量量化）降低向量存储体积。
- 引入内容哈希去重：相同内容只存一份向量，多处引用仅存引用关系。
- 索引口径：仅针对当前 checkout 的 HEAD 工作区；历史版本由 Git 负责管理（通过 checkout 获得对应索引快照）。
- 提供按提交的 DSR（Deterministic Semantic Record）作为语义工件：按提交、不可变、确定性；数据库仅作可重建缓存。

## 2. 存储布局
索引产物放在仓库根目录：
- `.git-ai/`：索引目录
  - `lancedb/`：LanceDB 数据目录
  - `lancedb.tar.gz`：打包后的 LanceDB（用于 Git LFS 追踪与传输）
  - `ast-graph.sqlite`：AST 关系图数据库（CozoDB，优先 SQLite 引擎）
  - `ast-graph.export.json`：AST 图导出快照（仅在非 SQLite 后端时用于跨进程复用）
  - `meta.json`：索引元信息（维度、编码、构建时间等）

DSR 产物（按提交，规范工件）：
- `.git-ai/dsr/<commit_hash>.json`：单提交 DSR（不可变、确定性）
- `.git-ai/dsr/dsr-index.sqlite`：DSR 查询加速索引（可删缓存，可由 DSR + Git 重建）

## 3. 数据模型（两张表）

### 3.1 chunks（去重后的内容向量表）
- 一行代表一个“去重后的内容块”（例如某个符号的骨架/签名文本）。
- 主键：`content_hash`（sha256）
- 字段：
  - `content_hash: string`
  - `text: string`（骨架/签名等用于可解释）
  - `dim: int32`
  - `scale: float32`（SQ8 反量化比例）
  - `qvec_b64: string`（SQ8 量化向量，Int8Array 的 base64 编码）

### 3.2 refs（引用表）
- 一行代表一次出现位置（文件/行号/符号等），指向 chunks 的 `content_hash`。
- 字段：
  - `ref_id: string`（sha256(file + symbol + range + content_hash)）
  - `content_hash: string`
  - `file: string`
  - `symbol: string`
  - `kind: string`
  - `signature: string`
  - `start_line: int32`
  - `end_line: int32`

## 4. 向量生成与 SQ8
- v2 默认不依赖外部 embedding API：使用确定性的本地 hash embedding（维度固定）生成 float 向量。
- SQ8（对称量化）：
  - `scale = max(|v|)/127`
  - `q[i] = clamp(round(v[i]/scale), -127..127)`
  - 反量化：`v'[i] = q[i] * scale`

## 5. 去重策略
- `content_hash = sha256(text)`，同一 text 只写入 chunks 一次。
- refs 始终写入，形成多对一关系。

## 6. 查询能力
- `search_symbols(query)`：在 refs 表过滤 `symbol LIKE %query%` 返回文件 + 行号 + signature。
- `semantic_search(text, k)`：
  - 计算 query embedding → SQ8；
  - 扫描 chunks（或按过滤条件缩小）反量化计算 cosine 相似度；
  - 取 TopK 后关联 refs 输出定位结果。

## 6.1 AST 图查询（CozoDB）

索引时会把符号及其关系写入 CozoDB，用于表达“包含关系”和“继承关系”等更适合图/递归查询的数据：

### 关系（relations）
- `ast_file(file_id => file)`：文件节点（file_id 为 `sha256("file:" + file)`）
- `ast_symbol(ref_id => file, name, kind, signature, start_line, end_line)`：符号节点（ref_id 与 refs 表一致）
- `ast_contains(parent_id, child_id)`：包含关系边（parent_id 可能是 file_id 或 ref_id）
- `ast_extends_name(sub_id, super_name)`：继承关系（按名字记录，便于后续 join/解析）
- `ast_implements_name(sub_id, iface_name)`：实现关系（按名字记录）

### CLI / MCP
- CLI：`git-ai ai graph ...`
- MCP：`ast_graph_query({query, params})`

## 7. Git hooks 集成
- `pre-commit`：自动重建索引（index --overwrite）并打包（pack），把 `.git-ai/lancedb.tar.gz` 添加到暂存区；若安装了 git-lfs 会自动执行 lfs track。
- `pre-push`：再次打包并校验归档未发生变化；若变化则阻止 push，提示先提交归档文件。
- `post-checkout` / `post-merge`：若存在 `.git-ai/lancedb.tar.gz`，自动解包到 `.git-ai/lancedb/`。
- 安装方式：在仓库中执行 `git-ai ai hooks install`（写入 .githooks/* 并设置 core.hooksPath=.githooks）。

## 8. DSR（Deterministic Semantic Record）

DSR 用于固化“每个提交的语义变化”，并严格遵守：

- Git DAG 是历史/分支的唯一权威来源（DSR 只 enrich 节点，不定义边）
- 一次提交 → 一份 DSR 文件（`.git-ai/dsr/<commit_hash>.json`）
- DSR 一旦生成不可覆盖；若已存在且内容不同应停止并报错
- 任何数据库/索引必须可由 DSR + Git 重建（缓存可删）

CLI 入口：

- `git-ai ai dsr context`
- `git-ai ai dsr generate <commit>`
- `git-ai ai dsr rebuild-index`
- `git-ai ai dsr query symbol-evolution <symbol>`

更详细说明见：[DSR 文档](./dsr.md)
