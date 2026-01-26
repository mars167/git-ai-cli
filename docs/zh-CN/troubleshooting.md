# 排障

## MCP 启动后无响应
stdio server 正常行为是“等待客户端连接”。如果你在终端直接运行，看起来像卡住是正常的。

## search_symbols/semantic_search 查不到结果
- 先在仓库执行：`git-ai ai index --overwrite`
- 如果你是通过 MCP 客户端启动且 cwd 不在仓库目录：先 `set_repo({path: ...})`

## Windows / Linux 安装失败
- Node 版本需 >= 18，且架构为 x64/arm64（LanceDB N-API 预编译包支持的范围）
- 若报 `node-gyp` / 编译错误，通常来自 `tree-sitter` 系列原生扩展：
  - Windows：安装 Visual Studio Build Tools（C++）与 Python
  - Linux：安装 build-essential 与 python3

## hooks 没生效
- 运行 `git-ai ai hooks status` 确认 `core.hooksPath` 是 `.githooks`
- 确认 `.githooks/*` 在 macOS/Linux 上有可执行权限
