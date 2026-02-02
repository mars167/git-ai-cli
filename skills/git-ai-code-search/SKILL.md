---
name: git-ai-code-search
description: |
  Semantic code search and codebase understanding using git-ai MCP tools. Use when: (1) Searching for symbols, functions, or semantic concepts, (2) Understanding project architecture, (3) Analyzing call graphs and code relationships, (4) Tracking symbol history via DSR. Triggers: "find X", "search for X", "who calls X", "where is X", "history of X", "understand this codebase".
---

# git-ai Code Search

Semantic code search with AST analysis and change tracking.

## Quick Start

**For Agents** - 3-step pattern:
```
1. check_index({ path }) → verify index exists
2. semantic_search({ path, query }) → find relevant code  
3. read_file({ path, file }) → read the actual code
```

**For Users** - build index first:
```bash
cd your-repo
git-ai ai index        # build index
git-ai ai semantic "authentication logic"  # search
```

## Core Tools

| Need | Tool | Example |
|------|------|---------|
| Search by meaning | `semantic_search` | `{ path, query: "error handling", topk: 10 }` |
| Search by name | `search_symbols` | `{ path, query: "handleAuth", mode: "substring" }` |
| Who calls X | `ast_graph_callers` | `{ path, name: "processOrder" }` |
| What X calls | `ast_graph_callees` | `{ path, name: "processOrder" }` |
| Call chain | `ast_graph_chain` | `{ path, name: "main", direction: "downstream" }` |
| Symbol history | `dsr_symbol_evolution` | `{ path, symbol: "UserService" }` |
| Project overview | `repo_map` | `{ path, max_files: 20 }` |

## Rules

1. **Always pass `path`** - Every tool requires explicit repository path
2. **Check index first** - Run `check_index` before search tools
3. **Read before modify** - Use `read_file` to understand code before changes
4. **Use DSR for history** - Never parse git log manually

## References

- [Tool Documentation](references/tools.md)
- [Behavioral Constraints](references/constraints.md)
