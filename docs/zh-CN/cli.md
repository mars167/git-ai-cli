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

## RepoMap（全局鸟瞰，可选）

为了支持类似 aider 的 repomap 能力（重要文件/符号排名、上下文映射、引导 Wiki 关联阅读），repo map 被集成到 **已有检索命令** 中，默认不输出，避免增加输出体积与 token 消耗。

在需要时，显式开启：

```bash
git-ai ai query "HelloController" --with-repo-map --repo-map-files 20 --repo-map-symbols 5
git-ai ai semantic "where is auth handled" --with-repo-map
```

参数说明：
- `--with-repo-map`：在 JSON 输出中附加 `repo_map` 字段
- `--repo-map-files <n>`：repo map 展示的文件数量上限（默认 20）
- `--repo-map-symbols <n>`：每个文件展示的符号上限（默认 5）
- `--wiki <dir>`：指定 Wiki 目录（默认自动探测 `docs/wiki` 或 `wiki`）

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

> **实战指南**：觉得命令太抽象？请查看 [AST 图谱实战指南](./graph_scenarios.md) 了解如何查找定义、父类、子类等常见场景。

`git-ai ai index` 会在 `.git-ai/` 下额外维护一份 AST 关系图数据库（默认文件名：`.git-ai/ast-graph.sqlite`）。

图搜索相关命令：
- `git-ai ai graph find <prefix>`：按符号名前缀（不区分大小写）查找
- `git-ai ai graph children <id>`：列出包含关系的直接子节点（`id` 可以是 `ref_id` 或 `file_id`）
- `git-ai ai graph children <file> --as-file`：把 `<file>` 视作 repo 相对路径，自动换算为 `file_id`
- `git-ai ai graph query "<CozoScript>" --params '<JSON>'`：直接执行 CozoScript 查询

依赖说明：
- 默认优先使用 `cozo-node`（SQLite 持久化）
- 若 `cozo-node` 不可用，会回退到 `cozo-lib-wasm`（内存引擎，通过导出文件实现跨进程复用）
