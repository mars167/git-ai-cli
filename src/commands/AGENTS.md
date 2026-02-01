# src/commands

**CLI subcommands for git-ai operations.**

## OVERVIEW
Command handlers exposed via `bin/git-ai.js`. Each file = one subcommand.

## STRUCTURE
```
commands/
├── ai.ts         # AI-powered query
├── graph.ts      # Graph exploration
├── query.ts      # Symbol search
├── semantic.ts   # Semantic search
├── dsr.ts        # DSR operations
├── index.ts      # Index management
├── status.ts     # Repo status
├── pack.ts       # Index packing
├── unpack.ts     # Index unpacking
└── serve.ts      # MCP serve mode
```

## WHERE TO LOOK
| Task | File |
|------|------|
| Add files to index | `index.ts` |
| Query with AI | `ai.ts` |
| Graph traversal | `graph.ts` |
| Symbol lookup | `query.ts` |
| Commit history | `dsr.ts` |

## CONVENTIONS (deviations from root)
- All commands: `try/catch`, log `{ ok: false, err }`, exit(1)
- Output: JSON on stdout
- `path` argument: resolved via `resolveGitRoot`

## ANTI-PATTERNS
- Never output non-JSON to stdout in commands
- Never leave commands without error handling
