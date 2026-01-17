# git-ai

`git-ai` 是一个全局命令行工具：默认行为与 `git` 保持一致（代理系统 git），同时提供 `ai` 子命令用于代码索引与检索能力。

## 安装

```bash
npm i -g git-ai
# or
yarn global add git-ai
```

## 基本用法（与 git 类似）

`git-ai` 会把大多数命令直接转发给 `git`：

```bash
git-ai init
git-ai status
git-ai add -A
git-ai commit -m "msg"
git-ai push -u origin main
```

## AI 能力

所有 AI 相关能力放在 `git-ai ai` 下：

```bash
git-ai ai index --overwrite
git-ai ai query Indexer --limit 10
git-ai ai semantic "semantic search" --topk 5
git-ai ai pack
git-ai ai unpack
git-ai ai serve
```

## Git hooks（提交前重建索引，push 前打包校验，checkout 自动解包）

在任意 git 仓库中安装 hooks：

```bash
git-ai ai hooks install
git-ai ai hooks status
```

说明：
- `pre-commit`：自动 `index --overwrite` + `pack`，并把 `.git-ai/meta.json` 与 `.git-ai/lancedb.tar.gz` 加入暂存区。
- `pre-push`：再次 `pack`，若归档发生变化则阻止 push，提示先提交归档文件。
- `post-checkout` / `post-merge`：若存在 `.git-ai/lancedb.tar.gz` 则自动 `unpack`。
- 若检测到 git-lfs 可用，会自动 `git lfs track .git-ai/lancedb.tar.gz`。

