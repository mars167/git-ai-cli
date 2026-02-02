# git-ai MCP Behavioral Constraints

Rules and constraints for using git-ai MCP tools effectively and safely.

## Must-Follow Rules (Error Level)

### 1. explicit_path

**Rule:** Every MCP tool call MUST include an explicit `path` parameter.

**Why:** Ensures atomic, reproducible calls. Never rely on process state or working directory.

**Good:**
```js
search_symbols({ path: "/abs/path/to/repo", query: "handleRequest" })
```

**Bad:**
```js
search_symbols({ query: "handleRequest" })  // Missing path!
```

### 2. check_index_first

**Rule:** Before using `search_symbols`, `semantic_search`, or any `ast_graph_*` tool, MUST call `check_index` to verify index is ready.

**Why:** These tools depend on the index. Searching with a missing/incompatible index gives unreliable results.

**Workflow:**
```js
// Step 1: Check index
const status = check_index({ path: "/repo" })

// Step 2: Rebuild if needed
if (!status.compatible) {
  rebuild_index({ path: "/repo" })
}

// Step 3: Now safe to search
search_symbols({ path: "/repo", query: "..." })
```

### 3. understand_before_modify

**Rule:** Before modifying any file, MUST:
1. Use `search_symbols` to locate the code
2. Use `read_file` to understand the implementation
3. Use `ast_graph_callers` to assess impact
4. Only then make changes

**Why:** Prevents breaking changes and ensures informed modifications.

### 4. use_dsr_for_history

**Rule:** When tracing symbol history, MUST use `dsr_symbol_evolution`. NEVER manually parse git log or diff.

**Why:** DSR provides structured, semantic change information that raw git commands don't.

## Warning-Level Rules

### 5. repo_map_before_large_change

**Rule:** Before large refactoring or architectural changes, use `repo_map` to understand project structure.

**Why:** Provides context for planning changes and identifying affected areas.

### 6. respect_dsr_risk

**Rule:** When DSR reports `risk_level: high`, exercise extra caution. Operations like `delete` and `rename` require additional review.

**Risk levels:**
- `low`: Safe, routine changes
- `medium`: Review recommended
- `high`: Extra scrutiny required

## Recommended Practices

### prefer_semantic_search

For understanding functional intent, prefer `semantic_search` over `search_symbols`.

**Use `semantic_search` when:**
- Looking for conceptual functionality
- Query is in natural language
- Exact name is unknown

**Use `search_symbols` when:**
- Exact or partial name is known
- Looking for specific identifiers

### use_call_chain_for_complex_flow

For complex flows spanning multiple functions, use `ast_graph_chain` instead of manually chaining `callers`/`callees` calls.

```js
// Good: Single call for complete chain
ast_graph_chain({ path: "/repo", name: "processPayment", direction: "upstream", max_depth: 5 })

// Avoid: Manual recursive calls
ast_graph_callers({ path: "/repo", name: "processPayment" })
// then for each result...
ast_graph_callers({ path: "/repo", name: result.name })
// etc.
```

### incremental_dsr_generation

Generate DSR on-demand for specific commits rather than batch-generating for entire history.

```js
// Good: Generate for specific commit when needed
dsr_generate({ path: "/repo", commit: "abc123" })

// Avoid: Generating for all historical commits upfront
```

## Prohibited Actions

| Action | Reason |
|--------|--------|
| Assume symbol location without searching | Always confirm via search |
| Modify unread files | Must read and understand first |
| Manual git log parsing for history | Use DSR tools instead |
| Search with missing index | Rebuild index first |
| Ignore high risk DSR warnings | Requires extra review |
| Omit `path` parameter | Every call must be explicit |

## Tool-Specific Constraints

| Tool | Precondition | Required Params |
|------|--------------|-----------------|
| `repo_map` | None | `path` |
| `check_index` | None | `path` |
| `rebuild_index` | None | `path` |
| `search_symbols` | `check_index` passed | `path`, `query` |
| `semantic_search` | `check_index` passed | `path`, `query` |
| `ast_graph_callers` | `check_index` passed | `path`, `name` |
| `ast_graph_callees` | `check_index` passed | `path`, `name` |
| `ast_graph_chain` | `check_index` passed | `path`, `name` |
| `dsr_context` | None | `path` |
| `dsr_generate` | None | `path`, `commit` |
| `dsr_symbol_evolution` | DSR exists for commits | `path`, `symbol` |
| `read_file` | None | `path`, `file` |
