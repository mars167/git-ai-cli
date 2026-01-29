# git-ai-mcp

This skill helps an agent use `git-ai` safely for:

- Repository indexing/search via MCP (`git-ai ai serve`)
- Per-commit semantics via DSR (Deterministic Semantic Record)

## Key invariants

- Git commit DAG is authoritative for history/branches
- DSR is per-commit, immutable, deterministic
- DSR files are canonical artifacts; databases are rebuildable caches
- Never infer Git topology from semantic data

## Recommended workflow

1. (Optional) Build repository index (checkout-local cache):
   - `git-ai ai index --overwrite`
2. Start MCP server for symbol/semantic/graph tools:
   - `git-ai ai serve`
3. For history/evolution questions, rely on DSR (commit-addressable artifacts):
   - Inspect: `git-ai ai dsr context --json`
   - Generate for one commit: `git-ai ai dsr generate <commit>`
   - Rebuild cache index: `git-ai ai dsr rebuild-index`
   - Query (read-only, Git DAG first): `git-ai ai dsr query symbol-evolution <symbol> --json`
