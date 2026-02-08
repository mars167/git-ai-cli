# src/core

**Core indexing, graph, storage, and parser modules.**

## OVERVIEW
Indexing engine: LanceDB storage, Cozo graph DB, multi-language parsers.

## STRUCTURE
```
core/
├── indexer.ts, indexerIncremental.ts    # Indexing orchestration
├── cozo.ts, astGraph.ts                 # Graph DB + AST queries
├── repoMap.ts                           # PageRank-based repository map
├── parser/                              # Language parsers (TS, Go, Rust, Python, C, MD, YAML)
├── lancedb.ts                           # Vector storage (SQ8)
├── semantic.ts, sq8.ts                  # Semantic search
└── git.ts, gitDiff.ts                   # Git operations
```

## WHERE TO LOOK
| Task | File |
|------|------|
| Full index | `indexer.ts` |
| Incremental update | `indexerIncremental.ts` |
| Graph queries | `cozo.ts` (CozoScript), `astGraph.ts` |
| Repo map | `repoMap.ts` |
| Language parsing | `parser/adapter.ts`, `parser/typescript.ts`, etc. |
| Vector search | `lancedb.ts`, `semantic.ts` |

## CONVENTIONS (deviations from root)
- Parser modules: `adapter.ts` exports unified interface
- Each parser: `parse(content, filePath) → TSCard[]`
- Graph queries: raw CozoScript strings in `cozo.ts`

## ANTI-PATTERNS
- Parser implementations must follow `adapter.ts` contract
- Never bypass `checkIndex` before graph/semantic queries
