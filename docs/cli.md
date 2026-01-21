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
git-ai ai status
git-ai ai query "search text" --limit 20
git-ai ai semantic "semantic query" --topk 10
git-ai ai pack
git-ai ai unpack
git-ai ai hooks install
git-ai ai serve
```
