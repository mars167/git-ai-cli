# Hooks 工作流

## 安装

```bash
cd /path/to/repo
git-ai ai hooks install
git-ai ai hooks status
```

## 行为
- `pre-commit`：自动 `index --incremental --staged` + `pack`，并把 `.git-ai/meta.json`、`.git-ai/lancedb.tar.gz` 加入暂存区（索引内容以 staged 为准）
- `pre-push`：再次 `pack`，若归档发生变化则阻止 push，提示先提交归档文件
- `post-checkout` / `post-merge`：若存在 `.git-ai/lancedb.tar.gz` 则自动 `unpack`
