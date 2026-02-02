# git-ai MCP Tools Reference

Complete documentation for all git-ai MCP tools.

## Index Management

### check_index

Check if repository index is ready and compatible.

```js
check_index({ path: "/abs/path/to/repo" })
```

**Returns:** Index status, compatibility info, and recommendations.

**When to use:** Before any search or graph operation.

### rebuild_index

Rebuild the repository index from scratch.

```js
rebuild_index({ path: "/abs/path/to/repo" })
```

**Parameters:**
- `path` (required): Absolute path to repository root
- `overwrite` (optional): Whether to overwrite existing index (default: true)
- `dim` (optional): Vector dimension (default: 256)

**Note:** Can be slow for large repositories. Use when index is missing or incompatible.

### pack_index / unpack_index

Package index for storage or distribution.

```js
pack_index({ path: "/repo", lfs: true })  // Pack with LFS tracking
unpack_index({ path: "/repo" })            // Restore from archive
```

## Search Tools

### repo_map

Get a high-level overview of repository structure.

```js
repo_map({
  path: "/abs/path/to/repo",
  max_files: 20,      // Top files by importance
  max_symbols: 5      // Top symbols per file
})
```

**When to use:** First contact with a repository, before large changes.

### search_symbols

Search for symbols by name pattern.

```js
search_symbols({
  path: "/repo",
  query: "handleRequest",
  mode: "substring",   // substring | prefix | wildcard | regex | fuzzy
  limit: 50,
  case_insensitive: false
})
```

**Modes:**
- `substring`: Match anywhere in name (default)
- `prefix`: Match start of name
- `wildcard`: Use `*` and `?` wildcards
- `regex`: Full regex support
- `fuzzy`: Typo-tolerant matching

### semantic_search

Search code by meaning using vector similarity.

```js
semantic_search({
  path: "/repo",
  query: "user authentication and session management",
  topk: 10,
  lang: "auto"  // auto | all | java | ts
})
```

**When to use:** Understanding functional intent, finding conceptually related code.

## AST Graph Tools

### ast_graph_find

Find symbols by name prefix in the AST graph.

```js
ast_graph_find({
  path: "/repo",
  prefix: "handle",
  limit: 50
})
```

### ast_graph_callers

Find all functions that call a given function.

```js
ast_graph_callers({
  path: "/repo",
  name: "authenticateUser",
  limit: 200
})
```

**When to use:** Impact analysis before refactoring, understanding usage patterns.

### ast_graph_callees

Find all functions called by a given function.

```js
ast_graph_callees({
  path: "/repo",
  name: "processOrder",
  limit: 200
})
```

**When to use:** Understanding implementation details, dependency analysis.

### ast_graph_chain

Trace complete call chain in either direction.

```js
ast_graph_chain({
  path: "/repo",
  name: "handlePayment",
  direction: "downstream",  // downstream | upstream
  max_depth: 3,
  limit: 500
})
```

**Directions:**
- `downstream`: What does this function call? (implementation details)
- `upstream`: Who calls this function? (usage/impact)

**When to use:** Complex flow analysis, understanding system architecture.

### ast_graph_children

List direct children in AST containment (file → symbols, class → methods).

```js
ast_graph_children({
  path: "/repo",
  id: "src/auth/service.ts",
  as_file: true  // Treat id as file path
})
```

### ast_graph_refs

Find all references to a name (calls, new expressions, type references).

```js
ast_graph_refs({
  path: "/repo",
  name: "UserService",
  limit: 200
})
```

## DSR Tools (Deterministic Semantic Records)

### dsr_context

Get repository Git context and DSR directory state.

```js
dsr_context({ path: "/repo" })
```

**Returns:** Branch info, commit status, DSR availability.

### dsr_generate

Generate DSR for a specific commit.

```js
dsr_generate({
  path: "/repo",
  commit: "HEAD"  // or specific commit hash
})
```

**When to use:** Before querying history for commits without DSR.

### dsr_symbol_evolution

Track how a symbol changed over time.

```js
dsr_symbol_evolution({
  path: "/repo",
  symbol: "authenticateUser",
  limit: 50,
  contains: false,  // true for substring match
  all: false        // true to traverse all refs, not just HEAD
})
```

**Returns:** List of changes with:
- `commit`: Commit hash
- `operation`: add | modify | delete | rename
- `risk_level`: low | medium | high
- `details`: Change description

**When to use:** Understanding design evolution, finding when/why something changed.

### dsr_rebuild_index

Rebuild DSR index from DSR files.

```js
dsr_rebuild_index({ path: "/repo" })
```

## File Operations

### read_file

Read file content with optional line range.

```js
read_file({
  path: "/repo",
  file: "src/auth/service.ts",  // Relative to repo root
  start_line: 1,
  end_line: 200
})
```

**Best practice:** Use with `start_line`/`end_line` for large files.

### list_files

List repository files by glob pattern.

```js
list_files({
  path: "/repo",
  pattern: "src/**/*.ts",
  limit: 500
})
```
