# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-02 01:45
**Commit:** bd3baf8
**Branch:** refactor/cli-commands-architecture

## OVERVIEW
Code Context Engine. TypeScript local runtime for agent-oriented code retrieval and context construction, with optional CLI and MCP adapters. Indices stored in `.git-ai/`.

## STRUCTURE
```
git-ai-cli-v2/
├── src/
│   ├── cli/          # CLI command architecture (NEW: registry + handlers + schemas)
│   │   ├── types.ts        # Core types, executeHandler
│   │   ├── registry.ts     # Handler registry (20 commands)
│   │   ├── helpers.ts      # Shared utilities
│   │   ├── schemas/        # Zod validation schemas
│   │   ├── handlers/       # Business logic handlers
│   │   └── commands/       # Commander.js wrappers
│   ├── commands/     # Command aggregator (ai.ts only)
│   ├── core/         # Indexing, graph, storage, parsers
│   └── mcp/          # MCP server implementation
├── test/             # Node test runner tests
├── dist/             # Build output
└── .git-ai/          # Indices (LanceDB)
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Runtime entrypoints | `src/index.ts`, `src/retrieval/runtime.ts` |
| Domain contracts | `src/domain/*.ts` |
| Lexical retrieval | `src/retrieval/lexical/*.ts` |
| CLI commands | `src/cli/commands/*.ts` (legacy adapter surface) |
| CLI handlers | `src/cli/handlers/*.ts` (legacy/transition business logic) |
| CLI schemas | `src/cli/schemas/*.ts` (Zod validation) |
| Handler registry | `src/cli/registry.ts` (all 20 commands) |
| Command aggregator | `src/commands/ai.ts` (entry point) |
| Indexing logic | `src/core/indexer.ts`, `src/core/indexerIncremental.ts` |
| Graph queries | `src/core/cozo.ts`, `src/core/astGraph.ts` |
| Semantic search | `src/core/search.ts`, `src/core/sq8.ts` |
| Repo map | `src/core/repoMap.ts` |
| MCP tools | `src/mcp/` (optional thin adapter) |
| Language parsers | `src/core/parser/*.ts` |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `indexer` | fn | `core/indexer.ts` | Full repository indexing |
| `incrementalIndexer` | fn | `core/indexerIncremental.ts` | Incremental updates |
| `createCodeContextEngine` | fn | `src/retrieval/runtime.ts` | Runtime entry point |
| `cozoQuery` | fn | `core/cozo.ts` | Graph DB queries |
| `semanticSearch` | fn | `core/semantic.ts` | Vector similarity |
| `repoMap` | fn | `core/repoMap.ts` | PageRank-based repo overview |
| `resolveGitRoot` | fn | `core/git.ts` | Repo boundary detection |

## CONVENTIONS
- **strict: true** TypeScript - no implicit any
- **Imports**: Node built-ins → external deps → internal modules
- **Formatting**: 2 spaces, single quotes, trailing commas
- **Errors**: Structured JSON logging via `createLogger`
- **Runtime output**: structured bundles and search matches
- **External inputs**: Use `unknown`, narrow early

## ANTI-PATTERNS (THIS PROJECT)
- Never suppress type errors (`as any`, `@ts-ignore`)
- Never throw raw strings - throw `Error` objects
- Never commit without explicit request
- No empty catch blocks

## UNIQUE STYLES
- `.git-ai/` directory for all index data (not config files)
- MCP tools require explicit `path` argument
- Multi-language parser architecture (TS, Go, Rust, Python, C, Markdown, YAML)
- PageRank-based repo-map for code importance scoring

## COMMANDS
```bash
npm i              # Install dependencies
npm run build      # Build to dist/
npm run start      # Dev run (e.g., --help)
npm test           # Build + node --test
node dist/bin/git-ai.js --help  # Validate packaged output
```

## NOTES
- Indices auto-update on git operations
- `checkIndex` gates symbol/semantic/graph queries
- CLI/MCP are transition adapters, not the product core
