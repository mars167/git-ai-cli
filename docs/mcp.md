# MCP Server Integration

`git-ai` provides an MCP (Model Context Protocol) Server that can be integrated with AI Agents (such as Claude Desktop, Cursor, Trae, etc.), empowering them with "code understanding" capabilities.

## Starting the Server

### Stdio Mode (Default, Single Client)

Run from any directory:

```bash
git-ai ai serve
```

This starts the server in stdio mode (waiting for client connection). Configure it in MCP-compatible clients. Suitable for single Agent connection.

### HTTP Mode (Multiple Clients)

If you need multiple Agents to connect simultaneously (e.g., using Claude Code and Cursor together), use HTTP mode:

```bash
git-ai ai serve --http --port 3000
```

HTTP mode features:
- **Multi-client support**: Each connection gets an independent session
- **Health check endpoint**: `http://localhost:3000/health` returns server status
- **MCP endpoint**: `http://localhost:3000/mcp` for MCP protocol communication
- **Session management**: Automatic client session lifecycle management
- **Session persistence**: Session IDs returned in `mcp-session-id` response header for client reuse
- **Error handling**: Comprehensive error handling with proper HTTP status codes
- **Graceful shutdown**: SIGTERM/SIGINT signal handlers for clean shutdown

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--http` | Enable HTTP transport (supports multiple clients) | No (uses stdio) |
| `--port <port>` | HTTP server port | 3000 |
| `--stateless` | Stateless mode (no session tracking, for load-balanced setups) | No |
| `--disable-mcp-log` | Disable MCP access logging | No |

#### HTTP Mode Examples

```bash
# Default port 3000
git-ai ai serve --http

# Custom port
git-ai ai serve --http --port 8080

# Stateless mode (for load-balanced scenarios)
git-ai ai serve --http --port 3000 --stateless

# Disable access logging
git-ai ai serve --http --disable-mcp-log
```

#### Health Check

```bash
curl http://localhost:3000/health
# {"status":"ok","sessions":2}
```

#### Session Management

When connecting to the MCP endpoint, the server:
1. Creates a new session if no `mcp-session-id` header is provided
2. Returns the session ID in the `mcp-session-id` response header
3. Clients should include this header in subsequent requests to reuse the session
4. Sessions are automatically cleaned up when the connection closes

Example session workflow:
```bash
# First request - new session created
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -i  # -i shows headers including mcp-session-id

# Subsequent requests - reuse session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: <session-id-from-first-response>" \
  ...
```

## Tool List

### Repository Management
- `get_repo({ path })`: Returns repository root and scan root for specified `path` (debugging)

### Index Management
- `check_index({ path })`: Check if index structure matches current version (rebuild if inconsistent)
- `rebuild_index({ path, dim?, overwrite? })`: Rebuild full index (writes to `.git-ai/`; Risk: high)
- `pack_index({ path, lfs? })`: Pack index to `.git-ai/lancedb.tar.gz` (optional git-lfs track)
- `unpack_index({ path })`: Unpack index archive

### Retrieval
- `search_symbols({ path, query, mode?, case_insensitive?, max_candidates?, limit?, lang?, with_repo_map?, repo_map_max_files?, repo_map_max_symbols?, wiki_dir? })`: Symbol retrieval (lang: auto/all/java/ts/python/go/rust/c/markdown/yaml; optional repo_map)
- `semantic_search({ path, query, topk?, lang?, with_repo_map?, repo_map_max_files?, repo_map_max_symbols?, wiki_dir? })`: Semantic search based on LanceDB + SQ8 (lang: auto/all/java/ts/python/go/rust/c/markdown/yaml; optional repo_map)
- `repo_map({ path, max_files?, max_symbols?, wiki_dir? })`: Generate repo map (important files/symbols ranking, Wiki navigation)
- `ast_graph_find({ path, prefix, limit?, lang? })`: Find symbol definitions by name prefix (case-insensitive; lang: auto/all/java/ts)
- `ast_graph_children({ path, id, as_file? })`: List direct child nodes in containment hierarchy (file→top-level symbols, class→methods, etc.)
- `ast_graph_refs({ path, name, limit?, lang? })`: Find reference locations by name (call/new/type; lang: auto/all/java/ts)
- `ast_graph_callers({ path, name, limit?, lang? })`: Find callers by name (callee name; lang: auto/all/java/ts)
- `ast_graph_callees({ path, name, limit?, lang? })`: Find callees by name (caller name; lang: auto/all/java/ts)
- `ast_graph_chain({ path, name, direction?, max_depth?, limit?, lang? })`: Find call chain by name (upstream/downstream, max depth; lang: auto/all/java/ts)
- `ast_graph_query({ path, query, params? })`: Execute CozoScript query on AST graph database (advanced)

### File Reading
- `list_files({ path, pattern?, limit? })`: List files by glob pattern (defaults ignore node_modules, .git, etc.)
- `read_file({ path, file, start_line?, end_line? })`: Read file segment by line numbers

### DSR (Deterministic Semantic Record)
- `dsr_context({ path })`: Get repository Git context and DSR directory status
  - Returns: commit_hash, repo_root, branch, detached, dsr_directory_state
- `dsr_generate({ path, commit })`: Generate DSR for specified commit
  - Returns: commit_hash, file_path, existed, counts, semantic_change_type, risk_level
- `dsr_rebuild_index({ path })`: Rebuild index from DSR files for faster queries
  - Returns: enabled, engine, dbPath, counts
- `dsr_symbol_evolution({ path, symbol, start?, all?, limit?, contains? })`: Trace symbol change history
  - Returns: ok, hits (including commit_hash, semantic_change_type, risk_level, operations)

## DSR Usage Examples

Get repository Git status and DSR info:

```js
dsr_context({ path: "/ABS/PATH/TO/REPO" })
```

Generate DSR for recent commits:

```js
dsr_generate({ path: "/ABS/PATH/TO/REPO", commit: "HEAD" })
dsr_generate({ path: "/ABS/PATH/TO/REPO", commit: "HEAD~1" })
```

Query function change history:

```js
dsr_symbol_evolution({ path: "/ABS/PATH/TO/REPO", symbol: "handleRequest", limit: 50 })
```

Fuzzy match symbol names:

```js
dsr_symbol_evolution({ path: "/ABS/PATH/TO/REPO", symbol: "Request", contains: true, limit: 100 })
```

## AST Graph Query Examples

List top-level symbols in a file (recommended: no manual file_id calculation needed):

```js
ast_graph_children({ path: "/ABS/PATH/TO/REPO", id: "src/mcp/server.ts", as_file: true })
```

Query method/function callers (recommended: use callers/callees/chain, not manual CozoScript):

```js
ast_graph_callers({ path: "/ABS/PATH/TO/REPO", name: "greet", limit: 50 })
ast_graph_chain({ path: "/ABS/PATH/TO/REPO", name: "greet", direction: "upstream", max_depth: 3 })
```

List top-level symbols in a file (advanced: direct CozoScript, requires file_id):

```cozo
?[file_id] <- [[$file_id]]
?[child_id, name, kind, start_line, end_line] :=
  *ast_contains{parent_id: file_id, child_id},
  *ast_symbol{ref_id: child_id, file, name, kind, signature, start_line, end_line}
```

## Recommended Usage (Let Agent Pass Correct Path)
- MCP tools require `path` parameter: Every tool call must explicitly pass `path: "/ABS/PATH/TO/REPO"` (ensures call atomicity)

## RepoMap Usage Tips

Repo map provides Agents with a "global bird's-eye view + navigation entry points" (important files/symbols + Wiki associations). Recommended as a pre-analysis step:

```js
repo_map({ path: "/ABS/PATH/TO/REPO", max_files: 20, max_symbols: 5 })
```

If you want to include repo map in retrieval results (disabled by default to avoid output bloat):

```js
search_symbols({ path: "/ABS/PATH/TO/REPO", query: "Foo", limit: 20, with_repo_map: true, repo_map_max_files: 20, repo_map_max_symbols: 5 })
semantic_search({ path: "/ABS/PATH/TO/REPO", query: "where is auth handled", topk: 5, with_repo_map: true })
```

## Agent Skills / Rules

This repository provides Agent-ready Skill/Rule templates designed to help Agents follow best practices when using these tools.

These template documents (Markdown/YAML) are indexed, making it easy for Agents to retrieve MCP guidelines and skill descriptions via `semantic_search`.

### YAML Format Templates

- **Skill**: [`templates/agents/common/skills/git-ai/skill.yaml`](../templates/agents/common/skills/git-ai/skill.yaml) - Guides Agents on using git-ai's Git-native semantic system (including DSR constraints) and MCP tools
  - Includes: trigger conditions, workflow steps, tool definitions, output requirements, common pitfalls
  
- **Rule**: [`templates/agents/common/rules/git-ai.yaml`](../templates/agents/common/rules/git-ai.yaml) - Constrains Agent behavior when using git-ai MCP
  - Includes: must-follow rules, recommended strategies, prohibited actions, Git Hooks rules, Manifest Workspace rules

### Markdown Templates (for easy reading/copying)

- **Skill**: [`templates/agents/common/skills/git-ai-code-search/SKILL.md`](../templates/agents/common/skills/git-ai-code-search/SKILL.md)
- **Rule**: [`templates/agents/common/rules/git-ai-code-search/RULE.md`](../templates/agents/common/rules/git-ai-code-search/RULE.md)

### Install to Trae

Install Skills and Rules from this repository to your project's `.agents` directory (default):

```bash
cd /path/to/your-repo
git-ai ai agent install
git-ai ai agent install --overwrite
git-ai ai agent install --to /custom/location/.agents
```

If you want to install to Trae's `.trae` directory:

```bash
git-ai ai agent install --agent trae
```

### Skill Workflow Overview

According to `skill.yaml`, recommended workflow:

1. **First time in repository** - Use `repo_map` for global view
2. **Check index status** - Use `check_index`, `rebuild_index` if necessary
3. **Locate target code** - Use `search_symbols` or `semantic_search`
4. **Understand code relationships** - Use `ast_graph_callers/callees/chain`
5. **Trace change history** - Use `dsr_symbol_evolution`
6. **Read code carefully** - Use `read_file` to read key segments
7. **Provide suggestions** - Give modification suggestions based on complete understanding

### Rule Constraints Overview

According to `rule.yaml`, Agents must follow:

- **explicit_path**: Every call must explicitly pass `path` parameter
- **check_index_first**: Must check index before symbol search
- **understand_before_modify**: Must understand implementation before modification
- **use_dsr_for_history**: Must use DSR tools for tracing history
- **respect_dsr_risk**: Take seriously DSR-reported high-risk changes

Documentation/rule retrieval suggestions:
- When issues involve MCP/Skill/Rule, first use `semantic_search` to locate relevant documentation segments, then conclude.

Prohibited actions include:
- Assuming symbol locations without searching
- Directly modifying unread files
- Manually parsing git history
- Performing symbol search when index is missing
- Omitting `path` parameter

## DSR and MCP Relationship

- **MCP tools** primarily cover "index (.git-ai) construction and retrieval", helping Agents efficiently locate evidence
- **DSR** is "per-commit semantic artifacts (.git-ai/dsr)", used for semantic history/evolution queries
- DSR is per-commit, immutable, deterministic, enabling precise symbol change tracing
- All historical traversal must start from Git DAG (DSR only enriches nodes, doesn't define edges)

See DSR documentation for DSR-related commands: [DSR Documentation](./dsr.md)

## Output Requirements

Agents should follow these guidelines when using git-ai MCP tools:

1. **Conclusion first, then evidence** - Summarize findings first, then provide detailed locations
2. **Use IDE-clickable links** - Format: `file:///path/to/file#L10-L20`
3. **Minimal change principle** - Avoid introducing new dependencies when suggesting modifications
4. **Evidence must be based on read_file** - Don't rely on assumptions or guesses
