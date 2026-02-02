# CLI Command Architecture Refactor - Design Document

**Date:** 2026-02-01  
**Author:** AI Assistant (Sisyphus)  
**Status:** DESIGN PHASE  
**Branch:** `refactor/cli-commands-architecture`  
**Related:** PR #15 (MCP Server Refactor)

---

## Executive Summary

Refactor git-ai CLI commands to match the successful MCP server architecture (handler registry + Zod validation + modular design). This achieves architectural consistency, enables code reuse between CLI and MCP, and improves testability.

---

## Current State Analysis

### Existing CLI Structure

```
bin/git-ai.ts (62 lines)
  ├── Git passthrough logic
  └── Commander program setup
      └── aiCommand

src/commands/
  ├── ai.ts (29 lines) - Main command aggregator
  ├── graph.ts (208 lines) - 7 subcommands
  ├── index.ts (85 lines)
  ├── semantic.ts (129 lines)
  ├── query.ts (...)
  ├── dsr.ts (...) - 4 subcommands
  ├── checkIndex.ts (...)
  ├── status.ts (...)
  ├── pack.ts (...)
  ├── unpack.ts (...)
  ├── hooks.ts (...)
  ├── serve.ts (...)
  └── trae.ts (...) - Agent installation
```

### Identified Issues

| Issue | Impact | Example |
|-------|--------|---------|
| **Inline Action Handlers** | Hard to test, reuse | All commands have logic in `.action()` |
| **Duplicate Boilerplate** | Maintenance burden | Path resolution, logging, error handling repeated 13+ times |
| **Inconsistent Validation** | Type safety gaps | Manual `String()`, `Number()` coercion scattered |
| **No Abstraction Layer** | Tight coupling | CLI directly calls core functions |
| **Varied Error Handling** | Inconsistent UX | Some exit(1), some exit(2), different JSON formats |
| **Option Inconsistency** | Poor UX | `--path` vs `-p`, `--topk` vs `-k` naming varies |

### Example: Current Pattern (graph.ts)

```typescript
export const graphCommand = new Command('graph')
  .addCommand(
    new Command('find')
      .argument('<prefix>', 'Name prefix')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--lang <lang>', 'Language: auto|all|...', 'auto')
      .action(async (prefix, options) => {
        // 40+ lines of inline logic:
        // - Path resolution
        // - Index checking
        // - Language resolution
        // - Query execution
        // - Error handling
        // - JSON output
        // - Logging
      })
  )
  // ... 6 more subcommands with similar patterns
```

**Problems:**
- Action handler = 40+ lines of inline code
- Cannot test handler independently
- Cannot reuse logic in MCP or other contexts
- Duplicate error handling in every subcommand

---

## Target Architecture

### New CLI Structure

```
src/cli/
├── registry.ts              # Command registry with Zod validation
├── types.ts                 # Shared CLI types & helpers
├── handlers/                # Business logic (testable, reusable)
│   ├── graphHandlers.ts
│   ├── indexHandlers.ts
│   ├── semanticHandlers.ts
│   ├── dsrHandlers.ts
│   └── ...
├── schemas/                 # Zod validation schemas
│   ├── graphSchemas.ts
│   ├── indexSchemas.ts
│   ├── semanticSchemas.ts
│   └── ...
└── commands/                # Commander command definitions (thin)
    ├── graphCommands.ts
    ├── indexCommand.ts
    ├── semanticCommand.ts
    └── ...

src/commands/
├── ai.ts                    # Main aggregator (kept for compatibility)
└── (deprecated - migrate to src/cli/)

bin/git-ai.ts                # Entry point (minimal changes)
```

### New Pattern: Handler Registry

```typescript
// src/cli/schemas/graphSchemas.ts
export const FindSymbolsSchema = z.object({
  prefix: z.string().min(1),
  path: z.string().default('.'),
  lang: z.enum(['auto', 'all', 'java', 'ts', 'python', 'go', 'rust', 'c', 'markdown', 'yaml']).default('auto'),
});

// src/cli/handlers/graphHandlers.ts
export async function handleFindSymbols(input: z.infer<typeof FindSymbolsSchema>): Promise<CLIResult> {
  const log = createLogger({ component: 'cli', cmd: 'ai graph find' });
  const startedAt = Date.now();
  
  const repoRoot = await resolveGitRoot(path.resolve(input.path));
  const status = await checkIndex(repoRoot);
  if (!status.ok) {
    return { ok: false, reason: 'index_incompatible', ...status };
  }
  
  const langs = resolveLangs(status.found.meta ?? null, input.lang);
  const allRows: any[] = [];
  
  for (const lang of langs) {
    const result = await runAstGraphQuery(repoRoot, buildFindSymbolsQuery(lang), { prefix: input.prefix, lang });
    const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
    allRows.push(...rows);
  }
  
  log.info('ast_graph_find', { ok: true, repoRoot, prefix: input.prefix, rows: allRows.length, duration_ms: Date.now() - startedAt });
  
  return {
    ok: true,
    repoRoot,
    lang: input.lang,
    result: { headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'], rows: allRows }
  };
}

// src/cli/registry.ts
export const cliHandlers = {
  'graph:find': {
    schema: FindSymbolsSchema,
    handler: handleFindSymbols,
  },
  // ... all other commands
};

// src/cli/commands/graphCommands.ts
export const graphCommand = new Command('graph')
  .description('AST graph search powered by CozoDB')
  .addCommand(
    new Command('find')
      .description('Find symbols by name prefix')
      .argument('<prefix>', 'Name prefix (case-insensitive)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--lang <lang>', 'Language: auto|all|...', 'auto')
      .action(async (prefix, options) => {
        await executeHandler('graph:find', { prefix, ...options });
      })
  );
```

### Benefits of New Pattern

| Benefit | Explanation |
|---------|-------------|
| **Testable** | Handlers are pure functions accepting validated input |
| **Reusable** | Same handler can be called from CLI, MCP, or tests |
| **Type-Safe** | Zod validates all inputs before handler execution |
| **Consistent** | All commands follow identical pattern |
| **Maintainable** | Business logic isolated from CLI framework |
| **Extensible** | Easy to add new commands via registry |

---

## CLI ↔ MCP Relationship

### Current State

Both CLI and MCP duplicate similar logic:

```
CLI: src/commands/graph.ts (208 lines)
  └─> core/astGraphQuery.ts

MCP: src/mcp/handlers/astGraphHandlers.ts (142 lines)
  └─> core/astGraphQuery.ts
```

**Problem:** Two implementations of the same business logic.

### Target State: Shared Handlers

```
src/handlers/               # NEW: Shared business logic
├── graphHandlers.ts        # Used by BOTH CLI and MCP
├── indexHandlers.ts
├── semanticHandlers.ts
└── ...

src/cli/
├── commands/graphCommands.ts   # CLI: Commander wrappers
└── registry.ts                 # CLI: Zod validation + handler dispatch

src/mcp/
├── tools/graphTools.ts         # MCP: Tool metadata
├── handlers/graphHandlers.ts   # MCP: Adapter to shared handlers
└── registry.ts                 # MCP: Zod validation + handler dispatch
```

**Strategy:**

1. **Phase 1:** Refactor CLI to new architecture (this PR)
2. **Phase 2:** Extract shared handlers to `src/handlers/` (future PR)
3. **Phase 3:** Refactor MCP to use shared handlers (future PR)

**Why Phased Approach:**
- Reduces risk per PR
- Easier to review and test
- Can merge CLI improvements independently
- Allows validation of pattern before full MCP migration

---

## Implementation Plan

### Phase 1: Foundation (✅ This PR)

#### Step 1: Create Directory Structure

```bash
mkdir -p src/cli/{handlers,schemas,commands}
```

#### Step 2: Create Core Infrastructure

**Files to Create:**
1. `src/cli/types.ts` - Shared types, result interfaces, helpers
2. `src/cli/registry.ts` - Handler registry with Zod validation
3. `src/cli/helpers.ts` - Common utilities (path resolution, error formatting)

**Example: `src/cli/types.ts`**
```typescript
export interface CLIResult {
  ok: boolean;
  [key: string]: any;
}

export interface CLIError {
  ok: false;
  reason: string;
  message?: string;
  [key: string]: any;
}

export async function executeHandler(
  commandKey: string,
  rawInput: unknown
): Promise<void> {
  const handler = cliHandlers[commandKey];
  if (!handler) {
    console.error(JSON.stringify({ ok: false, reason: 'unknown_command', command: commandKey }, null, 2));
    process.exit(1);
  }
  
  try {
    const validInput = handler.schema.parse(rawInput);
    const result = await handler.handler(validInput);
    
    if (result.ok) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stderr.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(2);
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.error(JSON.stringify({ ok: false, reason: 'validation_error', errors: e.errors }, null, 2));
      process.exit(1);
    }
    
    const log = createLogger({ component: 'cli', cmd: commandKey });
    log.error(commandKey, { ok: false, err: e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e) } });
    console.error(JSON.stringify({ ok: false, reason: 'internal_error', message: e instanceof Error ? e.message : String(e) }, null, 2));
    process.exit(1);
  }
}
```

#### Step 3: Migrate Commands (One by One)

**Priority Order:**
1. `graph` (7 subcommands) - Most complex, best example
2. `semantic` - Single command, medium complexity
3. `index` - Core functionality
4. `dsr` (4 subcommands) - Multiple subcommands
5. `query`, `checkIndex`, `status`, `pack`, `unpack` - Simpler commands
6. `hooks`, `serve`, `trae` - CLI-only commands

**Migration Template:**

For each command:
1. Create `src/cli/schemas/{command}Schemas.ts`
2. Create `src/cli/handlers/{command}Handlers.ts`
3. Create `src/cli/commands/{command}Commands.ts`
4. Register in `src/cli/registry.ts`
5. Test with `npm run build && node dist/bin/git-ai.js ai {command} --help`
6. Verify JSON output matches original
7. Run full test suite: `npm test`

#### Step 4: Update Entry Points

**Update `src/commands/ai.ts`:**
```typescript
import { Command } from 'commander';
import { graphCommand } from '../cli/commands/graphCommands';
import { semanticCommand } from '../cli/commands/semanticCommand';
// ... import new commands

export const aiCommand = new Command('ai')
  .description('AI features (indexing, search, hooks, MCP)')
  .addCommand(graphCommand)     // New architecture
  .addCommand(semanticCommand)  // New architecture
  .addCommand(indexCommand)     // New architecture
  // ... all other commands
```

**Keep `bin/git-ai.ts` unchanged** (git passthrough logic stays)

#### Step 5: Cleanup & Documentation

1. Delete old `src/commands/*.ts` files (except `ai.ts`)
2. Update `src/commands/AGENTS.md` to point to new structure
3. Create `src/cli/AGENTS.md` with new architecture docs
4. Update root `AGENTS.md` with CLI architecture section

---

### Phase 2: Validation & Testing (Future PR)

#### Tasks:
1. Add CLI command tests (`test/cli/*.test.ts`)
2. Add handler unit tests (`test/handlers/*.test.ts`)
3. Add integration tests for CLI ↔ MCP parity
4. Add schema validation tests

#### Test Strategy:
```typescript
// test/handlers/graphHandlers.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { handleFindSymbols } from '../../src/cli/handlers/graphHandlers';

describe('handleFindSymbols', () => {
  it('should find symbols by prefix', async () => {
    const result = await handleFindSymbols({
      prefix: 'handle',
      path: '/path/to/repo',
      lang: 'auto',
    });
    
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.result.rows));
  });
  
  it('should handle index not found', async () => {
    const result = await handleFindSymbols({
      prefix: 'test',
      path: '/nonexistent',
      lang: 'auto',
    });
    
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'index_incompatible');
  });
});
```

---

### Phase 3: Shared Handler Extraction (Future PR)

#### Goal:
Extract common logic between CLI and MCP to `src/handlers/`

#### Strategy:
1. Create `src/handlers/{domain}Handlers.ts` with pure business logic
2. Update `src/cli/handlers/{domain}Handlers.ts` to call shared handlers
3. Update `src/mcp/handlers/{domain}Handlers.ts` to call shared handlers

#### Example:

**Before:**
```
src/cli/handlers/graphHandlers.ts (200 lines) - CLI-specific logic
src/mcp/handlers/astGraphHandlers.ts (142 lines) - MCP-specific logic
```

**After:**
```
src/handlers/graphHandlers.ts (150 lines) - Shared business logic

src/cli/handlers/graphHandlers.ts (50 lines) - CLI adapter
  └─> src/handlers/graphHandlers.ts

src/mcp/handlers/astGraphHandlers.ts (50 lines) - MCP adapter
  └─> src/handlers/graphHandlers.ts
```

---

## Breaking Changes Assessment

### None Expected ✅

All changes are internal refactoring. External interfaces remain identical:

| Interface | Before | After |
|-----------|--------|-------|
| CLI commands | `git-ai ai graph find <prefix>` | ✅ Identical |
| CLI options | `--path`, `--lang`, etc. | ✅ Identical |
| JSON output | `{ ok, repoRoot, result }` | ✅ Identical |
| Exit codes | 0 (success), 1 (error), 2 (index issue) | ✅ Identical |
| MCP tools | All 21 tools | ✅ Unchanged (different PR) |

### Backward Compatibility

- ✅ All existing scripts using `git-ai` CLI continue working
- ✅ All MCP tools continue working (unchanged)
- ✅ JSON output format preserved
- ✅ Exit codes preserved
- ✅ Help text preserved

---

## Success Criteria

### Must Have (Blocking)

- [ ] All 13 CLI commands migrated to new architecture
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm test` passes all existing tests
- [ ] Manual smoke test: Each command produces identical JSON output
- [ ] Exit codes match original behavior
- [ ] No breaking changes to public API

### Should Have (Non-Blocking)

- [ ] All handlers have JSDoc comments
- [ ] All schemas have descriptions
- [ ] `src/cli/AGENTS.md` documents new architecture
- [ ] Updated root `AGENTS.md` with CLI section

### Nice to Have (Future)

- [ ] CLI command tests added
- [ ] Handler unit tests added
- [ ] Shared handlers extracted to `src/handlers/`

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking CLI behavior | Low | High | Extensive manual testing, JSON output validation |
| Zod validation too strict | Medium | Medium | Use `.passthrough()` initially, tighten later |
| Migration mistakes | Medium | Medium | Migrate one command at a time, test after each |
| Performance regression | Low | Low | Handler logic unchanged, only routing differs |
| Build size increase | Low | Low | Zod already a dependency (used in MCP) |

---

## Timeline Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Foundation | Create types, registry, helpers | 30 min |
| Migrate `graph` | Schemas + handlers + commands | 45 min |
| Migrate `semantic`, `index`, `dsr` | 3 commands | 1 hour |
| Migrate remaining 9 commands | Simple commands | 1 hour |
| Testing & validation | Manual testing all commands | 30 min |
| Cleanup & docs | Delete old files, update docs | 20 min |
| **Total** | | **~4 hours** |

---

## Rollback Plan

If issues arise:

1. **Immediate:** `git checkout refactor/mcp-server-design` (previous working state)
2. **Partial:** Keep completed migrations, revert problematic commands
3. **Full:** Abandon branch, keep existing `src/commands/*.ts` structure

---

## Post-Merge TODO

### Immediate (This PR)
- [ ] Update README examples (if needed)
- [ ] Update `DEVELOPMENT.md` with new CLI architecture
- [ ] Tag release: `v2.4.0` (minor version bump for internal improvements)

### Future PRs
- [ ] Add CLI command tests
- [ ] Extract shared handlers to `src/handlers/`
- [ ] Refactor MCP to use shared handlers
- [ ] Add integration tests for CLI ↔ MCP parity
- [ ] Consider TypeScript builder pattern for complex commands

---

## References

- **Related PR:** #15 (MCP Server Refactor)
- **cli-developer skill:** `~/.agents/skills/cli-developer`
- **Commander.js docs:** https://github.com/tj/commander.js
- **Zod docs:** https://zod.dev

---

## Questions & Decisions

### Q1: Should we use Zod or Commander built-in validation?

**Decision:** Use Zod.

**Reasoning:**
- Already a dependency (used in MCP)
- Type-safe, reusable schemas
- Better error messages
- Consistent with MCP architecture
- Future-proof for shared handlers

### Q2: Should we extract shared handlers in this PR or later?

**Decision:** Later (separate PR).

**Reasoning:**
- Reduces scope and risk
- Easier to review CLI refactor in isolation
- Can validate pattern before MCP migration
- Allows testing CLI improvements independently

### Q3: Should we change command naming (e.g., `git-ai graph find` instead of `git-ai ai graph find`)?

**Decision:** No, keep existing naming.

**Reasoning:**
- Breaking change for existing users
- Scripts depend on current paths
- Can be addressed in future major version (v3.0.0)
- Internal refactor only, no UX changes

### Q4: Should we standardize option names (e.g., always use `-p` for path)?

**Decision:** Yes, but via deprecation warnings in future PR.

**Reasoning:**
- Consistency improves UX
- But breaking change requires deprecation period
- Can add both old and new options with warnings
- Address in v2.5.0 with deprecation notices

---

## Sign-Off

**Design Approved By:**
- User (selected "Option C: Complete Restructure")

**Implementation Start:** 2026-02-01  
**Target Completion:** 2026-02-01 (same day)

---

## Appendix A: Command Inventory

| Command | Subcommands | Lines | Complexity | Priority |
|---------|-------------|-------|------------|----------|
| `graph` | 7 (query, find, children, refs, callers, callees, chain) | 208 | High | 1 |
| `dsr` | 4 (context, generate, rebuild-index, symbol-evolution) | ~150 | Medium | 4 |
| `semantic` | 0 | 129 | Medium | 2 |
| `index` | 0 | 85 | Medium | 3 |
| `query` | 0 | ~80 | Low | 5 |
| `checkIndex` | 0 | ~50 | Low | 6 |
| `status` | 0 | ~60 | Low | 7 |
| `pack` | 0 | ~70 | Low | 8 |
| `unpack` | 0 | ~70 | Low | 9 |
| `hooks` | 0 | ~100 | Low | 10 |
| `serve` | 0 | ~40 | Low | 11 |
| `trae` | 0 | ~80 | Low | 12 |

**Total:** 13 commands, 11 subcommands (24 total command handlers)

---

## Appendix B: Example Migration (graph:find)

### Before (src/commands/graph.ts - lines 30-56)

```typescript
new Command('find')
  .description('Find symbols by name prefix')
  .argument('<prefix>', 'Name prefix (case-insensitive)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
  .action(async (prefix, options) => {
    const log = createLogger({ component: 'cli', cmd: 'ai graph find' });
    const startedAt = Date.now();
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const status = await checkIndex(repoRoot);
    if (!status.ok) {
      process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
      process.exit(2);
      return;
    }
    const langSel = String(options.lang ?? 'auto');
    const langs = resolveLangs(status.found.meta ?? null, langSel as any);
    const allRows: any[] = [];
    for (const lang of langs) {
      const result = await runAstGraphQuery(repoRoot, buildFindSymbolsQuery(lang), { prefix: String(prefix), lang });
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
      for (const r of rows) allRows.push(r);
    }
    const result = { headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'], rows: allRows };
    log.info('ast_graph_find', { ok: true, repoRoot, prefix: String(prefix), lang: langSel, langs, rows: allRows.length, duration_ms: Date.now() - startedAt });
    console.log(JSON.stringify({ repoRoot, lang: langSel, result }, null, 2));
  })
```

### After (Split into 3 files)

**1. src/cli/schemas/graphSchemas.ts**
```typescript
import { z } from 'zod';

export const FindSymbolsSchema = z.object({
  prefix: z.string().min(1).describe('Symbol name prefix to search for'),
  path: z.string().default('.').describe('Path inside the repository'),
  lang: z.enum(['auto', 'all', 'java', 'ts', 'python', 'go', 'rust', 'c', 'markdown', 'yaml'])
    .default('auto')
    .describe('Programming language filter'),
});

export type FindSymbolsInput = z.infer<typeof FindSymbolsSchema>;
```

**2. src/cli/handlers/graphHandlers.ts**
```typescript
import { type FindSymbolsInput } from '../schemas/graphSchemas';
import { type CLIResult } from '../types';

export async function handleFindSymbols(input: FindSymbolsInput): Promise<CLIResult> {
  const log = createLogger({ component: 'cli', cmd: 'ai graph find' });
  const startedAt = Date.now();
  
  const repoRoot = await resolveGitRoot(path.resolve(input.path));
  const status = await checkIndex(repoRoot);
  
  if (!status.ok) {
    return { ok: false, reason: 'index_incompatible', ...status };
  }
  
  const langs = resolveLangs(status.found.meta ?? null, input.lang);
  const allRows: any[] = [];
  
  for (const lang of langs) {
    const result = await runAstGraphQuery(
      repoRoot,
      buildFindSymbolsQuery(lang),
      { prefix: input.prefix, lang }
    );
    const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
    allRows.push(...rows);
  }
  
  log.info('ast_graph_find', {
    ok: true,
    repoRoot,
    prefix: input.prefix,
    lang: input.lang,
    langs,
    rows: allRows.length,
    duration_ms: Date.now() - startedAt
  });
  
  return {
    ok: true,
    repoRoot,
    lang: input.lang,
    result: {
      headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'],
      rows: allRows
    }
  };
}
```

**3. src/cli/commands/graphCommands.ts**
```typescript
import { Command } from 'commander';
import { executeHandler } from '../types';

export const graphCommand = new Command('graph')
  .description('AST graph search powered by CozoDB')
  .addCommand(
    new Command('find')
      .description('Find symbols by name prefix')
      .argument('<prefix>', 'Name prefix (case-insensitive)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--lang <lang>', 'Language: auto|all|java|ts|python|go|rust|c|markdown|yaml', 'auto')
      .action(async (prefix, options) => {
        await executeHandler('graph:find', { prefix, ...options });
      })
  )
  // ... 6 more subcommands with same pattern
```

**4. src/cli/registry.ts**
```typescript
import { FindSymbolsSchema } from './schemas/graphSchemas';
import { handleFindSymbols } from './handlers/graphHandlers';

export const cliHandlers = {
  'graph:find': {
    schema: FindSymbolsSchema,
    handler: handleFindSymbols,
  },
  // ... all other commands
};
```

### Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **Lines per command** | 40+ lines inline | 10 lines (command def) + 30 lines (handler) |
| **Testability** | Cannot test without mocking Commander | Pure function, easy to test |
| **Reusability** | CLI-only | Can be called from MCP, tests, scripts |
| **Type Safety** | Manual coercion (`String()`, `Number()`) | Zod validates all inputs |
| **Error Handling** | Inline try/catch | Centralized in `executeHandler` |
| **Maintainability** | Logic scattered in `.action()` | Clear separation: schema → handler → output |

---

**End of Design Document**
