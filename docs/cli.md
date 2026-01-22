# 命令行使用

## git 代理模式

```bash
git-ai init
git-ai status
git-ai add -A
git-ai commit -m "msg"
git-ai push -u origin main
```

## AI 子命令

```bash
git-ai ai index --overwrite
git-ai ai query "search text" --limit 20
git-ai ai query "get*repo" --mode wildcard --case-insensitive --limit 20
git-ai ai semantic "semantic query" --topk 10
git-ai ai graph find "Foo"
git-ai ai graph children src/mcp/server.ts --as-file
git-ai ai graph query "?[name, kind] := *ast_symbol{ref_id, file, name, kind, signature, start_line, end_line}" --params "{}"
git-ai ai pack
git-ai ai unpack
git-ai ai hooks install
git-ai ai serve
```

## 符号搜索模式（ai query）

`git-ai ai query` 默认是子串搜索；当你的输入包含 `*` / `?` 时，或显式指定 `--mode`，可以启用更适合 code agent 的搜索模式：

- `--mode substring`：子串匹配（默认）
- `--mode prefix`：前缀匹配
- `--mode wildcard`：通配符（`*` 任意串，`?` 单字符）
- `--mode regex`：正则
- `--mode fuzzy`：模糊匹配（子序列）

常用参数：
- `--case-insensitive`：大小写不敏感
- `--max-candidates <n>`：先拉取候选再过滤的上限（模式为 wildcard/regex/fuzzy 时有用）

## AST 图搜索（CozoDB）

`git-ai ai index` 会在 `.git-ai/` 下额外维护一份 AST 关系图数据库（默认文件名：`.git-ai/ast-graph.sqlite`）。

图搜索相关命令：
- `git-ai ai graph find <prefix>`：按符号名前缀（不区分大小写）查找
- `git-ai ai graph children <id>`：列出包含关系的直接子节点（`id` 可以是 `ref_id` 或 `file_id`）
- `git-ai ai graph children <file> --as-file`：把 `<file>` 视作 repo 相对路径，自动换算为 `file_id`
- `git-ai ai graph query "<CozoScript>" --params '<JSON>'`：直接执行 CozoScript 查询

依赖说明：
- 默认优先使用 `cozo-node`（SQLite 持久化）
- 若 `cozo-node` 不可用，会回退到 `cozo-lib-wasm`（内存引擎，通过导出文件实现跨进程复用）
