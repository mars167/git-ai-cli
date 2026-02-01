---
name: git-ai-mcp
description: |
  Efficient codebase understanding and navigation using git-ai MCP tools. Use when working with code repositories that have git-ai indexed, including: (1) Understanding project structure and architecture, (2) Searching for symbols, functions, or semantic concepts, (3) Analyzing code relationships and call graphs, (4) Tracking symbol evolution and change history via DSR, (5) Reading and navigating code files. Triggers: "understand this project", "find function X", "who calls X", "what does X call", "history of X", "where is X implemented".
---

# git-ai MCP Skill

Guide for using git-ai MCP tools to understand and navigate codebases efficiently.

## Overview

git-ai provides semantic code understanding through:

- **Hyper RAG**: Vector + Graph + DSR retrieval
- **AST Analysis**: Symbol relationships and call graphs
- **DSR**: Deterministic Semantic Records for change tracking

## Workflow

Understanding a codebase involves these steps:

1. Get global view (run `repo_map`)
2. Check index status (run `check_index`, rebuild if needed)
3. Locate code (run `search_symbols` or `semantic_search`)
4. Analyze relationships (run `ast_graph_callers/callees/chain`)
5. Trace history (run `dsr_symbol_evolution`)
6. Read code (run `read_file`)

## Tool Selection

| Task | Tool | Key Parameters |
|------|------|----------------|
| Project overview | `repo_map` | `path`, `max_files: 20` |
| Find by name | `search_symbols` | `path`, `query`, `mode: substring` |
| Find by meaning | `semantic_search` | `path`, `query`, `topk: 10` |
| Who calls X | `ast_graph_callers` | `path`, `name` |
| What X calls | `ast_graph_callees` | `path`, `name` |
| Call chain | `ast_graph_chain` | `path`, `name`, `direction`, `max_depth` |
| Symbol history | `dsr_symbol_evolution` | `path`, `symbol`, `limit` |
| Read code | `read_file` | `path`, `file`, `start_line`, `end_line` |
| Index health | `check_index` | `path` |
| Rebuild index | `rebuild_index` | `path` |

## Critical Rules

**MUST follow:**

1. **Always pass `path` explicitly** - Never rely on implicit working directory
2. **Check index before search** - Run `check_index` before using search/graph tools
3. **Read before modify** - Use `read_file` to understand code before making changes
4. **Use DSR for history** - Never manually parse git log; use `dsr_symbol_evolution`

**NEVER do:**

- Assume symbol locations without searching
- Modify files without reading them first
- Search when index is missing or incompatible
- Ignore DSR risk levels (high risk = extra review needed)

## Examples

**Find authentication code:**
```js
semantic_search({ path: "/repo", query: "user authentication logic", topk: 10 })
```

**Find who calls a function:**
```js
ast_graph_callers({ path: "/repo", name: "handleRequest", limit: 50 })
```

**Trace call chain upstream:**
```js
ast_graph_chain({ path: "/repo", name: "processOrder", direction: "upstream", max_depth: 3 })
```

**View symbol history:**
```js
dsr_symbol_evolution({ path: "/repo", symbol: "authenticateUser", limit: 50 })
```

## References

- **Tool details**: See [references/tools.md](references/tools.md) for complete tool documentation
- **Constraints**: See [references/constraints.md](references/constraints.md) for behavioral rules
