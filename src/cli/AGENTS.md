# src/cli

**CLI command architecture matching MCP server patterns.**

## OVERVIEW
Refactored CLI layer with handler registry, Zod validation, and modular design. Mirrors MCP server architecture for consistency.

## STRUCTURE
```
cli/
├── types.ts          # Core types: CLIResult, CLIError, CLIHandler, executeHandler
├── registry.ts       # Handler registry with all 24 commands
├── helpers.ts        # Shared utilities: resolveRepoContext, validateIndex, formatError
├── schemas/          # Zod schemas for all commands
│   ├── graphSchemas.ts
│   ├── indexSchemas.ts
│   ├── semanticSchemas.ts
│   ├── querySchemas.ts
│   ├── dsrSchemas.ts
│   ├── statusSchemas.ts
│   ├── archiveSchemas.ts
│   ├── hooksSchemas.ts
│   └── serveSchemas.ts
├── handlers/         # Business logic handlers
│   ├── graphHandlers.ts
│   ├── indexHandlers.ts
│   ├── semanticHandlers.ts
│   ├── queryHandlers.ts
│   ├── dsrHandlers.ts
│   ├── statusHandlers.ts
│   ├── archiveHandlers.ts
│   ├── hooksHandlers.ts
│   └── serveHandlers.ts
└── commands/         # Commander.js wrappers
    ├── graphCommands.ts
    ├── indexCommand.ts
    ├── semanticCommand.ts
    ├── queryCommand.ts
    ├── dsrCommands.ts
    ├── statusCommands.ts
    ├── archiveCommands.ts
    ├── hooksCommands.ts
    └── serveCommands.ts
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add new command | Create schema → handler → command, register in registry.ts |
| Modify validation | `schemas/*Schemas.ts` |
| Change business logic | `handlers/*Handlers.ts` |
| Update CLI interface | `commands/*Commands.ts` or `commands/*Command.ts` |
| Shared utilities | `helpers.ts` |
| Handler execution | `types.ts` (executeHandler) |

## KEY PATTERNS

### Handler Pattern
```typescript
// Handler signature
export async function handleFindSymbols(input: FindSymbolsInput): Promise<CLIResult | CLIError> {
  // 1. Resolve repository context
  const ctx = await resolveRepoContext(input.path);
  
  // 2. Validate index
  const error = validateIndex(ctx);
  if (error) return error;
  
  // 3. Business logic
  const result = await astGraphFind({ ...input, ...ctx });
  
  // 4. Return success
  return success({ repoRoot: ctx.repoRoot, result });
}
```

### Command Pattern
```typescript
// Commander wrapper
export const findCommand = new Command('find')
  .description('Find symbols by name prefix')
  .argument('<prefix>', 'Name prefix (case-insensitive)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (prefix, options) => {
    await executeHandler('graph:find', { prefix, ...options });
  });
```

### Registry Pattern
```typescript
// Central registry (registry.ts)
const handlers: Record<string, CLIHandler<any>> = {
  'graph:find': handleFindSymbols,
  'semantic': handleSemanticSearch,
  'index': handleIndexRepo,
  // ... all 24 commands
};
```

## CONVENTIONS

### Input Validation
- **All inputs validated via Zod schemas** in `schemas/` directory
- Schema naming: `{Command}{Subcommand}Input` (e.g., `GraphFindInput`)
- Schemas exported individually and as union types

### Handler Return Types
- **Success**: `{ ok: true, data: T }` via `success(data)` helper
- **Error**: `{ ok: false, error: string, details?: unknown }` via `error(msg, details)` helper
- Handlers use `resolveRepoContext()` and `validateIndex()` from helpers.ts

### Error Handling
- Index issues: Exit code 2 (stderr JSON output)
- Other errors: Exit code 1 (stderr JSON output)
- Success: Exit code 0 (stdout JSON output)

### File Organization
- Each major command gets its own schema/handler/command file
- Subcommands grouped in single files (e.g., `graphCommands.ts` has 7 subcommands)
- Single-command files use singular name (e.g., `indexCommand.ts`)
- Multi-subcommand files use plural name (e.g., `graphCommands.ts`)

## COMMANDS REGISTRY

### Graph Commands (7 subcommands)
- `graph:query` - Run CozoScript query
- `graph:find` - Find symbols by prefix
- `graph:children` - List children in AST
- `graph:refs` - Find reference locations
- `graph:callers` - Find callers
- `graph:callees` - Find callees
- `graph:chain` - Compute call chain

### Core Commands (3 commands)
- `index` - Build repository index
- `semantic` - Semantic search
- `query` - Symbol search

### DSR Commands (4 subcommands)
- `dsr:context` - Get DSR directory state
- `dsr:generate` - Generate DSR for commit
- `dsr:rebuild-index` - Rebuild DSR index
- `dsr:query` - Semantic queries over Git DAG

### Status Commands (2 commands)
- `checkIndex` - Check index status (deprecated)
- `status` - Show repository status

### Archive Commands (2 commands)
- `pack` - Pack index into archive
- `unpack` - Unpack archive

### Hooks Commands (3 subcommands)
- `hooks:install` - Install git hooks
- `hooks:uninstall` - Uninstall git hooks
- `hooks:status` - Show hooks status

### Serve Commands (2 commands)
- `serve` - Start MCP server
- `agent` - Install agent templates

## ANTI-PATTERNS (THIS MODULE)

- Never bypass Zod validation - all inputs go through schemas
- Never output non-JSON to stdout from handlers
- Never throw errors from handlers - return `CLIError`
- Never duplicate repo context logic - use `resolveRepoContext()`
- Never skip index validation - use `validateIndex()`
- No empty error messages - always provide context

## UNIQUE STYLES

- **MCP-style architecture**: Registry + handlers + schemas pattern
- **Type-safe everywhere**: Zod runtime validation + TypeScript compile-time types
- **Consistent error handling**: All handlers use success/error helpers
- **Shared utilities**: helpers.ts eliminates duplicated validation logic
- **Backward compatible**: JSON output format unchanged from original commands

## TESTING NOTES

- All handlers tested via CLI commands
- Integration tests verify JSON output matches original behavior
- Test both success and error paths
- Verify exit codes: 0 (success), 1 (error), 2 (index issue)

## MIGRATION NOTES

- Original commands in `src/commands/*.ts` have been deleted
- Only `src/commands/ai.ts` remains as the command aggregator
- All business logic moved to `src/cli/handlers/`
- Commander definitions moved to `src/cli/commands/`
- ~300 lines of duplicated code eliminated via helpers.ts
