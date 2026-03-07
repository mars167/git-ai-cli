# Code Context Engine Knowledge Base

## Overview

Code Context Engine is a TypeScript local runtime for agent-oriented code retrieval and context construction. The runtime is the product core. CLI and MCP are thin adapters retained only where they help local debugging or agent integration.

## Structure

```text
src/
  index.ts                 public runtime entry
  domain/                  stable agent-facing contracts
  retrieval/
    runtime.ts             createCodeContextEngine()
    lexical/               lexical-first retrieval
    symbol/                higher-level navigation capabilities
  tasks/
    review/                review context builders
    impact/                impact analysis
    tests/                 test discovery and mapping
    implementation/        implementation context
    extensions/            extension point discovery
    diff/                  diff parsing and analysis
  core/                    parsers, indexers, LanceDB, CozoDB, repo-map
  cli/                     thin local adapter
  commands/                ai command aggregation
  mcp/                     thin MCP adapter
bin/
  code-context-engine.ts   package CLI entry
```

## Where To Look

| Need | Location |
|------|----------|
| Runtime API | `src/index.ts`, `src/retrieval/runtime.ts` |
| Stable contracts | `src/domain/*.ts` |
| Lexical retrieval | `src/retrieval/lexical/*.ts` |
| Symbol navigation | `src/retrieval/symbol/*.ts` |
| Task builders | `src/tasks/**/*` |
| MCP thin adapter | `src/mcp/server.ts`, `src/mcp/tools/taskTools.ts`, `src/mcp/handlers/taskHandlers.ts` |
| CLI thin adapter | `src/commands/ai.ts`, `src/cli/commands/*` |
| Core indexing and graph | `src/core/*` |

## Primary Entry Points

- `createCodeContextEngine()` is the main product entry point.
- `code-context-engine ai serve` starts the thin MCP adapter.
- `code-context-engine ai index --overwrite` rebuilds local index state.

## Thin MCP Surface

- `check_index`
- `rebuild_index`
- `read_file`
- `repo_map`
- `lexical_search`
- `implementation_context`
- `find_tests`
- `find_impact`
- `find_extension_points`
- `review_context_for_diff`

## Retrieval Policy

- lexical / symbol first
- graph expand second
- semantic rerank last
