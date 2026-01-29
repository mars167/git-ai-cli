# 安装与快速开始

## 全局安装

```bash
npm i -g git-ai
```

## 在任意仓库生成索引

```bash
cd /path/to/repo
git-ai ai status
git-ai ai index --overwrite
```

后续如果你只想对变更文件做快速更新（例如配合 git hooks 在提交前重建索引），可以使用增量模式：

```bash
git-ai ai index --incremental --staged
```

## 语义检索/符号检索

```bash
git-ai ai query Indexer --limit 10
git-ai ai semantic "where do we open lancedb" --topk 5
```

## 归档与分享

```bash
git-ai ai pack
git-ai ai unpack
```
