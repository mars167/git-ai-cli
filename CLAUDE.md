# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

git-ai is a local code understanding tool that builds a semantic layer for codebases using advanced RAG techniques. It combines vector search (LanceDB) with graph-based analysis (CozoDB) to enable AI Agents to deeply understand code structure and relationships beyond simple text search.

**Key Design Principle**: Indices travel with code in Git repos—checkout, branch, or tag any version and the semantic index is immediately available without rebuilding.

## Development Commands

```bash
# Build
npm run build                 # Compile TypeScript to dist/

# Development run
npm run start -- --help       # Run directly with ts-node

# Testing
npm test                      # Full test suite (build + E2E)
npm run test:cli             # CLI-specific tests
npm run test:parser          # Parser verification

# Global install for local testing
npm i -g .
```

**Important**: After building, test with the compiled CLI to verify packaging:
```bash
node dist/bin/git-ai.js --help
```

## Architecture Overview

### Three-Layer Architecture

```
CLI Layer (src/cli/)
    ↓
Core Layer (src/core/)
    ↓
Data Layer (LanceDB + CozoDB)
```

**CLI Layer** (`src/cli/`):
- **Commands**: Commander.js command definitions in `cli/commands/`
- **Handlers**: Business logic in `cli/handlers/` (one per command type)
- **Schemas**: Zod validation schemas in `cli/schemas/`
- **Types**: CLI-specific types and the `executeHandler` wrapper in `cli/types.ts`

**Core Layer** (`src/core/`):
- **indexer.ts / indexerIncremental.ts**: Parallel indexing with worker pools
- **lancedb.ts**: Vector database (SQ8-quantized embeddings)
- **cozo.ts / astGraph.ts**: Graph database for AST relationships
- **parser.ts**: Tree-sitter based multi-language parsing
- **embedding.ts**: ONNX-based semantic embeddings
- **search.ts**: Multi-strategy retrieval (vector + graph + hybrid)
- **repoMap.ts**: PageRank-based importance scoring

### Data Flow

**Indexing**: Source files → Tree-sitter AST → Embeddings + Symbol extraction → LanceDB (chunks) + CozoDB (refs)

**Search**: Query → Classification → Multi-strategy retrieval → Reranking → Results

### Standard CLI Output Format

All CLI commands output JSON for agent readability:

**Success**:
```json
{
  "ok": true,
  "command": "semantic",
  "repoRoot": "/path/to/repo",
  "timestamp": "2024-01-01T00:00:00Z",
  "duration_ms": 123,
  "data": { ... }
}
```

**Error**:
```json
{
  "ok": false,
  "reason": "index_not_found",
  "message": "No semantic index found",
  "command": "semantic",
  "hint": "Run 'git-ai ai index --overwrite' to create an index"
}
```

See `src/cli/types.ts` for `CLIResult`, `CLIError`, `ErrorReasons`, and `ErrorHints`.

## Key Files by Purpose

### Entry Points
- `bin/git-ai.ts`: Main CLI—proxies to git for non-AI commands, registers `ai` command
- `src/commands/ai.ts`: AI command registry (all `git-ai ai *` subcommands)

### Indexing System
- `src/core/indexer.ts`: Parallel indexing with HNSW vector index
- `src/core/indexerIncremental.ts`: Smart rebuild strategies
- `src/core/parser.ts`: Multi-language Tree-sitter adapters
- `src/core/embedding.ts`: ONNX runtime for local embeddings
- `src/core/lancedb.ts`: LanceDB management (chunks table)
- `src/core/sq8.ts`: Vector quantization for storage efficiency

### Search & Retrieval
- `src/core/search.ts`: Query classification and multi-strategy routing
- `src/core/symbolSearch.ts`: Symbol-based search functionality
- `src/core/astGraphQuery.ts`: Graph-based call relationship queries

### Graph Database
- `src/core/cozo.ts`: CozoDB interface (refs table)
- `src/core/astGraph.ts`: AST graph construction

### Repository Management
- `src/core/git.ts`: Git repository handling
- `src/core/workspace.ts`: Workspace path resolution
- `src/core/manifest.ts`: Index versioning and compatibility checking
- `src/core/indexCheck.ts`: Index validation

### Archive & Distribution
- `src/core/archive.ts`: Pack/unpack index archives (.git-ai/lancedb.tar.gz)
- `src/core/lfs.ts`: Git LFS integration for index storage

### MCP Server
- `src/mcp/server.ts`: MCP server implementation (stdio + HTTP modes)
- `src/mcp/handlers/`: MCP tool implementations
- `src/mcp/tools/`: MCP tool registry

## MCP Integration

The MCP Server enables AI Agents to query git-ai indices. All MCP tools require a `path` parameter to specify the target repository—no implicit repository selection for atomic operation.

**Two modes**:
- **stdio mode** (default): Single-agent connection
- **HTTP mode** (`--http`): Multiple concurrent agents with session management

## Language Support

Supported languages are in `src/core/parser.ts`:
- TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)
- Java (`.java`)
- Python (`.py`)
- Go (`.go`)
- Rust (`.rs`)
- C (`.c`, `.h`)
- Markdown (`.md`, `.mdx`)
- YAML (`.yml`, `.yaml`)

Each language has a separate LanceDB table with its own HNSW index.

## File Filtering

Indexing respects three filter mechanisms (priority order):
1. `.aiignore` - Highest priority, explicit exclusions
2. `.git-ai/include.txt` - Force-include overrides `.gitignore`
3. `.gitignore` - Standard Git ignore patterns

Pattern syntax: `**` (any dirs), `*` (any chars), `directory/` (entire dir)

## Testing

Tests are located in `test/` with multiple formats (`.test.mjs`, `.test.ts`, `.test.js`).

Run single tests with Node's native test runner:
```bash
node --test test/cliCommands.test.js
```

## Native Dependencies

This project uses native modules that may need build tools:
- `@lancedb/lancedb` - Vector database (platform-specific prebuilt binaries)
- `cozo-node` - Graph database
- `onnxruntime-node` - ONNX runtime
- `tree-sitter-*` - Language parsers

If native builds fail, ensure:
- Node.js >= 18
- Build tools installed (Windows: Visual Studio Build Tools, Linux: build-essential)

## Common Tasks

**Add a new CLI command**:
1. Create handler in `src/cli/handlers/yourHandler.ts`
2. Create Zod schema in `src/cli/schemas/` (optional)
3. Register in `src/cli/registry.ts`
4. Add Commander command in `src/cli/commands/yourCommand.ts`
5. Register in `src/commands/ai.ts`

**Add language support**:
1. Add Tree-sitter grammar in `package.json` dependencies
2. Extend `src/core/parser.ts` with new language adapter
3. Test with `npm run test:parser`

**Add MCP tool**:
1. Create handler in `src/mcp/handlers/`
2. Register in `src/mcp/tools/`
3. Export from `src/mcp/server.ts`
