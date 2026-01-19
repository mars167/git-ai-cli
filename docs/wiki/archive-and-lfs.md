# 索引归档与 LFS

## pack/unpack
- `pack`：把 `.git-ai/lancedb/` 打包为 `.git-ai/lancedb.tar.gz`
- `unpack`：把 `.git-ai/lancedb.tar.gz` 解包为 `.git-ai/lancedb/`

```bash
git-ai ai pack
git-ai ai unpack
```

## Git LFS（可选）
如果仓库安装了 git-lfs，推荐对 `.git-ai/lancedb.tar.gz` 使用 LFS：

```bash
git lfs track ".git-ai/lancedb.tar.gz"
git add .gitattributes
git commit -m "track lancedb archive via lfs"
```

也可以运行一次：

```bash
git-ai ai pack --lfs
```
