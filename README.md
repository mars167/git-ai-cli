# git-ai

[![ci](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/ci.yml)
[![release](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml/badge.svg)](https://github.com/mars167/git-ai-cli/actions/workflows/release.yml)
[![license](https://img.shields.io/github/license/mars167/git-ai-cli)](./LICENSE)
[![npm (github packages)](https://img.shields.io/npm/v/%40mars167%2Fgit-ai?registry_uri=https%3A%2F%2Fnpm.pkg.github.com)](https://github.com/mars167/git-ai-cli/packages)

[🇨🇳 简体中文](./README.zh-CN.md) | **English**

`git-ai` is a global command-line tool: it defaults to behaving like `git` (proxying system git), while providing an `ai` subcommand for code indexing and retrieval capabilities.

## Supported Languages

Current indexing/symbol extraction supports the following languages and file extensions:
- JavaScript: `.js`, `.jsx`
- TypeScript: `.ts`, `.tsx`
- Java: `.java`
- C: `.c`, `.h`
- Go: `.go`
- Python: `.py`
- Rust: `.rs`

## Installation

```bash
npm i -g git-ai
# or
yarn global add git-ai
```

## Documentation
- Development Guide: [DEVELOPMENT.md](./DEVELOPMENT.md)
- Documentation Center (Usage/Concepts/Troubleshooting): [docs/README.md](./docs/README.md)
- Design: [docs/design.md](./docs/zh-CN/design.md) (Chinese)
- Architecture Explained: [docs/architecture_explained.md](./docs/zh-CN/architecture_explained.md) (Chinese)
- Agent Integration (Skills/Rules): [docs/mcp.md](./docs/zh-CN/mcp.md) (Chinese)

## Basic Usage (Like Git)

`git-ai` forwards most commands directly to `git`:

```bash
git-ai init
git-ai status
git-ai add -A
git-ai commit -m "msg"
git-ai push -u origin main
```

## AI Capabilities

All AI-related capabilities are under `git-ai ai`:

```bash
git-ai ai status
git-ai ai index --overwrite
git-ai ai query Indexer --limit 10
git-ai ai semantic "semantic search" --topk 5
git-ai ai graph find GitAIV2MCPServer
git-ai ai pack
git-ai ai unpack
git-ai ai serve
```

## MCP Server (stdio)

`git-ai` provides an MCP-based stdio Server for Agents/Clients to call as tools:
- `search_symbols`: Symbol retrieval (substring/prefix/wildcard/regex/fuzzy)
- `semantic_search`: Semantic retrieval based on LanceDB + SQ8
- `ast_graph_query`: AST graph query based on CozoDB (CozoScript)

### Startup

It is recommended to generate the index in the target repository first:

```bash
git-ai ai index --overwrite
```

Then start the MCP Server (it will wait for client connections on stdio, which is normal):

```bash
cd /ABS/PATH/TO/REPO
git-ai ai serve
```

### Claude Desktop Configuration Example

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

Note:
- `git-ai ai serve` defaults to using the current directory as the repository location (similar to git usage).
- If the host cannot guarantee that the MCP process working directory (cwd) points to the repository directory, it is recommended that the Agent execute `set_repo({path: \"/ABS/PATH/TO/REPO\"})` before the first call, or pass the `path` parameter in every tool call.

## Agent Skills / Rules (Trae)

This repository provides reusable Skill/Rule templates for Agents:
- Skill: [./.trae/skills/git-ai-mcp/SKILL.md](./.trae/skills/git-ai-mcp/SKILL.md)
- Rule: [./.trae/rules/git-ai-mcp/RULE.md](./.trae/rules/git-ai-mcp/RULE.md)

Usage:
- After opening this repository in Trae, the Agent will automatically load Skills under `.trae/skills/**`.
- When you need to add constraints to the Agent, put the Rule content into your Agent configuration/system rules (or directly reference `.trae/rules/**` in this repository as a source).

One-click install into another repository:

```bash
cd /path/to/your-repo
git-ai ai trae install
git-ai ai trae install --overwrite
git-ai ai trae install --to /custom/location/.trae
```

## Git hooks (Rebuild index before commit, verify pack before push, auto unpack on checkout)

Install hooks in any git repository:

```bash
git-ai ai hooks install
git-ai ai hooks status
```

Explanation:
- `pre-commit`: Automatically `index --overwrite` + `pack`, and add `.git-ai/meta.json` and `.git-ai/lancedb.tar.gz` to the staging area.
- `pre-push`: `pack` again, if the archive changes, block the push and prompt to submit the archive file first.
- `post-checkout` / `post-merge`: If `.git-ai/lancedb.tar.gz` exists, automatically `unpack`.

## Git LFS (Recommended for .git-ai/lancedb.tar.gz)

To avoid storing large index archives directly in Git history, it is recommended to enable Git LFS for `.git-ai/lancedb.tar.gz`.

### Enable (One-time)

```bash
git lfs install
git lfs track ".git-ai/lancedb.tar.gz"
git add .gitattributes
git commit -m "chore: track lancedb archive via git-lfs"
```

Can also be triggered with `git-ai` (only works if git-lfs is installed):

```bash
git-ai ai pack --lfs
```

### After Clone/Checkout (If LFS pull is not automatic)
If your environment has `GIT_LFS_SKIP_SMUDGE=1` set, or you find `.git-ai/lancedb.tar.gz` is not a valid gzip file:

```bash
git lfs pull
```

## License

[MIT](./LICENSE)
