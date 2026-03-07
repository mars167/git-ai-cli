# Code Context Engine MCP Adapter

Code Context Engine keeps MCP as a thin adapter over the local runtime. It is not the product core and it no longer exposes a large primitive-first tool surface.

## Start

```bash
code-context-engine ai serve
code-context-engine ai serve --http --port 3000
```

## Retained Tool Surface

### Index and repo access
- `check_index({ path })`
- `rebuild_index({ path, dim?, overwrite? })`
- `read_file({ path, file, start_line?, end_line? })`
- `repo_map({ path, max_files?, max_symbols?, depth?, max_nodes?, wiki_dir? })`

### Runtime-oriented retrieval
- `lexical_search({ path, query, mode?, lang?, path_pattern?, limit? })`

### Task-oriented context
- `implementation_context({ path, query?, path_hints?, symbol_hints? })`
- `find_tests({ path, query?, path_hints?, symbol_hints? })`
- `find_impact({ path, query?, path_hints?, symbol_hints? })`
- `find_extension_points({ path, query?, path_hints?, symbol_hints? })`
- `review_context_for_diff({ path, diff_text, query?, path_hints?, symbol_hints? })`

## Recommended Agent Workflow

1. `check_index` to verify index availability
2. `repo_map` for top-level orientation when entering a repo
3. `lexical_search` for precise initial recall
4. One of the task tools as the main working surface
5. `read_file` to inspect exact code before making changes
