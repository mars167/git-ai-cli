# git-ai

[![ci](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml)
[![release](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml)
[![license](https://img.shields.io/github/license/mars167/git-ai-cli)](./LICENSE)
[![npm (github packages)](https://img.shields.io/npm/v/%40mars167%2Fgit-ai?registry_uri=https%3A%2F%2Fnpm.pkg.github.com)](https://github.com/mars167/git-ai-cli/packages)

`git-ai` 是一个全局命令行工具：默认行为与 `git` 保持一致（代理系统 git），同时提供 `ai` 子命令用于代码索引与检索能力。

## 支持语言

当前索引/符号提取支持以下语言与文件后缀：
- JavaScript：`.js`、`.jsx`
- TypeScript：`.ts`、`.tsx`
- Java：`.java`

## 安装

```bash
npm i -g git-ai
# or
yarn global add git-ai
```

## 文档
- 开发指引：[DEVELOPMENT.md](./DEVELOPMENT.md)
- 文档中心（使用/概念/排障）：[docs/README.md](./docs/README.md)
- 设计说明：[docs/design.md](./docs/design.md)
- Agent 集成（Skills/Rules）：[docs/mcp.md](./docs/mcp.md)

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

## MCP Server（stdio）

`git-ai` 提供一个基于 MCP 的 stdio Server，供 Agent/客户端以工具方式调用：
- `search_symbols`：按子串搜索符号并返回文件位置
- `semantic_search`：基于 LanceDB + SQ8 的语义检索

### 启动

建议先在目标仓库生成索引：

```bash
git-ai ai index --overwrite
```

然后启动 MCP Server（会在 stdio 上等待客户端连接，这是正常的）：

```bash
cd /ABS/PATH/TO/REPO
git-ai ai serve
```

### Claude Desktop 配置示例

```json
{
  "mcpServers": {
    "git-ai": {
      "command": "git-ai",
      "args": ["ai", "serve"]
    }
  }
}
```

说明：
- `git-ai ai serve` 默认使用当前目录作为仓库定位起点（类似 git 的用法）。
- 若宿主无法保证 MCP 进程的工作目录（cwd）指向仓库目录，推荐由 Agent 在首次调用前先执行一次 `set_repo({path: \"/ABS/PATH/TO/REPO\"})`，或在每次 tool 调用里传 `path` 参数。

## Agent Skills / Rules（Trae）

本仓库提供了 Agent 可直接复用的 Skill/Rule 模版：
- Skill： [./.trae/skills/git-ai-mcp/SKILL.md](./.trae/skills/git-ai-mcp/SKILL.md)
- Rule： [./.trae/rules/git-ai-mcp/RULE.md](./.trae/rules/git-ai-mcp/RULE.md)

使用方式：
- 在 Trae 中打开本仓库后，Agent 会自动加载 `.trae/skills/**` 下的 Skill。
- 需要给 Agent 加约束时，把 Rule 内容放到你的 Agent 配置/系统规则中（也可以直接引用本仓库的 `.trae/rules/**` 作为规范来源）。

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

## Git LFS（推荐，用于 .git-ai/lancedb.tar.gz）

为了避免把较大的索引归档直接存进 Git 历史，推荐对 `.git-ai/lancedb.tar.gz` 启用 Git LFS。

### 开启（一次性）

```bash
git lfs install
git lfs track ".git-ai/lancedb.tar.gz"
git add .gitattributes
git commit -m "chore: track lancedb archive via git-lfs"
```

也可以用 `git-ai` 触发（仅在已安装 git-lfs 的情况下生效）：

```bash
git-ai ai pack --lfs
```

### 克隆/切分支后（如果未自动拉取 LFS）
如果你环境设置了 `GIT_LFS_SKIP_SMUDGE=1`，或发现 `.git-ai/lancedb.tar.gz` 不是有效的 gzip 文件：

```bash
git lfs pull
```

## License

[MIT](./LICENSE)
