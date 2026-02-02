# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-02 01:45
**Commit:** bd3baf8
**Branch:** refactor/cli-commands-architecture

## OVERVIEW
git-ai CLI + MCP server. TypeScript implementation for AI-powered Git operations with semantic search, DSR (Deterministic Semantic Record), and graph-based code analysis. Indices stored in `.git-ai/`.

## STRUCTURE
```
git-ai-cli-v2/
├── src/
│   ├── cli/          # CLI command architecture (NEW: registry + handlers + schemas)
│   │   ├── types.ts        # Core types, executeHandler
│   │   ├── registry.ts     # Handler registry (24 commands)
│   │   ├── helpers.ts      # Shared utilities
│   │   ├── schemas/        # Zod validation schemas
│   │   ├── handlers/       # Business logic handlers
│   │   └── commands/       # Commander.js wrappers
│   ├── commands/     # Command aggregator (ai.ts only)
│   ├── core/         # Indexing, DSR, graph, storage, parsers
│   └── mcp/          # MCP server implementation
├── test/             # Node test runner tests
├── dist/             # Build output
└── .git-ai/          # Indices (LanceDB + DSR)
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| CLI commands | `src/cli/commands/*.ts` (new architecture) |
| CLI handlers | `src/cli/handlers/*.ts` (business logic) |
| CLI schemas | `src/cli/schemas/*.ts` (Zod validation) |
| Handler registry | `src/cli/registry.ts` (all 24 commands) |
| Command aggregator | `src/commands/ai.ts` (entry point) |
| Indexing logic | `src/core/indexer.ts`, `src/core/indexerIncremental.ts` |
| DSR (commit records) | `src/core/dsr/`, `src/core/dsr.ts` |
| Graph queries | `src/core/cozo.ts`, `src/core/astGraph.ts` |
| Semantic search | `src/core/semantic.ts`, `src/core/sq8.ts` |
| MCP tools | `src/mcp/`, `src/core/graph.ts` |
| Language parsers | `src/core/parser/*.ts` |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `indexer` | fn | `core/indexer.ts` | Full repository indexing |
| `incrementalIndexer` | fn | `core/indexerIncremental.ts` | Incremental updates |
| `GitAiService` | class | `mcp/index.ts` | MCP entry point |
| `runDsr` | fn | `commands/dsr.ts` | DSR CLI command |
| `cozoQuery` | fn | `core/cozo.ts` | Graph DB queries |
| `semanticSearch` | fn | `core/semantic.ts` | Vector similarity |
| `resolveGitRoot` | fn | `core/git.ts` | Repo boundary detection |

## CONVENTIONS
- **strict: true** TypeScript - no implicit any
- **Imports**: Node built-ins → external deps → internal modules
- **Formatting**: 2 spaces, single quotes, trailing commas
- **Errors**: Structured JSON logging via `createLogger`
- **CLI output**: JSON on stdout, logs on stderr
- **External inputs**: Use `unknown`, narrow early

## ANTI-PATTERNS (THIS PROJECT)
- Never suppress type errors (`as any`, `@ts-ignore`)
- Never throw raw strings - throw `Error` objects
- Never commit without explicit request
- No empty catch blocks

## UNIQUE STYLES
- `.git-ai/` directory for all index data (not config files)
- MCP tools require explicit `path` argument
- DSR files per commit for reproducible queries
- Multi-language parser architecture (TS, Go, Rust, Python, C, Markdown, YAML)

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
- DSR commit hash mismatch with HEAD triggers warning
- MCP server exposes git-ai tools for external IDEs
