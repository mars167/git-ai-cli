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
