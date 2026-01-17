# Plan

## Phase 1: 项目初始化
- 初始化 Node.js + TypeScript 工程。
- 引入依赖：commander、fs-extra、simple-git、tree-sitter、@lancedb/lancedb、apache-arrow。

## Phase 2: 索引流水线
- 扫描 ts/js 文件并用 tree-sitter 抽取符号（类/函数/方法）。
- 为每个符号生成骨架文本（signature + kind + 可选上下文）。
- 计算 content_hash 并写入 chunks（去重）。
- 写入 refs（定位信息）。

## Phase 3: SQ8 实现
- 实现 hash embedding → float 向量。
- 实现 SQ8 量化/反量化与 cosine 相似度计算。

## Phase 4: CLI + MCP
- CLI：index / query / semantic / serve。
- MCP：search_symbols / semantic_search / list_dependencies（可选）。

## Phase 5: 验证
- 在 git-ai-cli-v2 自身仓库跑：index → query → semantic → serve。

