# Documentation Center

This collects all documentation for `git-ai`.

## Overview

`git-ai` is a global CLI:
- Default behavior acts like `git`: `git-ai status/commit/push/...` proxies to system `git`.
- AI capabilities are under `git-ai ai ...`: Indexing, Retrieval, Packing, Hooks, MCP Server.

### Core Goals
- Store structured code repository indexes under `.git-ai/`, shareable via archive `.git-ai/lancedb.tar.gz`.
- Enable Agents to hit symbols/snippets via MCP tools at low cost, then read files as needed.
- Persist per-commit semantic change as DSR (immutable, deterministic), and rebuild caches from it.

### Important Directories
- `.git-ai/meta.json`: Index metadata (locally generated, usually not committed).
- `.git-ai/lancedb/`: Local vector index directory (usually not committed).
- `.git-ai/lancedb.tar.gz`: Archived index (can be committed/tracked via git-lfs).
- `.git-ai/ast-graph.sqlite`: AST graph database (CozoDB).
- `.git-ai/ast-graph.export.json`: AST graph export snapshot (for non-SQLite backend cross-process reuse).
- `.git-ai/dsr/<commit_hash>.json`: Per-commit DSR (canonical artifact, immutable).
- `.git-ai/dsr/dsr-index.sqlite`: DSR query accelerator (rebuildable cache from DSR + Git).

## Directory

### Usage Guides
- [Installation & Quick Start](./zh-CN/quickstart.md) (Chinese)
- [Windows Setup Guide](./windows-setup.md)
- [CLI Usage](./zh-CN/cli.md) (Chinese)
- [Hooks Workflow](./zh-CN/hooks.md) (Chinese)
- [MCP Server Integration](./zh-CN/mcp.md) (Chinese)
- [Manifest Workspace Support](./zh-CN/manifests.md) (Chinese)
- [Troubleshooting](./zh-CN/troubleshooting.md) (Chinese)
- [DSR (Deterministic Semantic Record)](./zh-CN/dsr.md) (Chinese)

### Advanced & Principles
- [Advanced: Index Archiving & LFS](./zh-CN/advanced.md) (Chinese)
- [Architecture Design](./zh-CN/design.md) (Chinese)
- [Development Rules](./zh-CN/rules.md) (Chinese)

## Agent Integration
- [MCP Skill & Rule Templates](./zh-CN/mcp.md#agent-skills--rules) (Chinese)
