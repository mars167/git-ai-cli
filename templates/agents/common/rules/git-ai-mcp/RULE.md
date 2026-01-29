# git-ai-mcp

Use `git-ai` as the single entry point for indexing and semantic queries.

## Hard rules

- Determine history and branches only from Git (never from semantic artifacts)
- Treat `.git-ai/dsr/<commit_hash>.json` as immutable canonical artifacts
- Treat databases as rebuildable caches (derivable from DSR + Git)
- If DSR is missing for a commit needed by a query, report and stop (do not infer)

## Practical defaults

- Prefer read-only operations unless explicitly asked to modify the repository
- For repository understanding, use MCP search tools first, then read code with line ranges
