# MCP Server 接入

## 启动

在目标仓库目录：

```bash
git-ai ai serve
```

该进程是 stdio 模式（会等待客户端连接）。你可以把它配置到支持 MCP 的客户端里。

## 工具列表
- `get_repo({ path? })`：返回当前默认仓库根目录（调试用）
- `set_repo({ path })`：设置默认仓库路径，避免依赖进程工作目录
- `index_repo({ path?, dim?, overwrite? })`：构建/更新索引
- `pack_index({ path?, lfs? })`：打包索引为 `.git-ai/lancedb.tar.gz`（可选启用 git-lfs track）
- `unpack_index({ path? })`：解包索引归档
- `search_symbols({ query, limit?, path? })`
- `semantic_search({ query, topk?, path? })`
- `list_files({ path?, pattern?, limit? })`：按 glob 列文件
- `read_file({ path?, file, start_line?, end_line? })`：按行读取文件片段

## 推荐调用方式（让 Agent 自动传对路径）
- 第一次调用先 `set_repo({path: \"/ABS/PATH/TO/REPO\"})`
- 后续工具调用不传 `path`（走默认仓库）
