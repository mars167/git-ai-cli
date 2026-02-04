---
name: git-ai-priority
description: |
  Enforce git-ai MCP tools as the PRIMARY code retrieval method for AI coding agents (Claude Code, OpenCode, Cursor, etc.). This rule mandates that agents MUST attempt git-ai tools FIRST before falling back to traditional file operations. Applies to: code search, symbol lookup, codebase understanding, architecture analysis, call graph tracing.
priority: critical
applies_to:
  - claude-code
  - opencode
  - cursor
  - windsurf
  - continue-dev
  - any-ai-coding-agent
---

# git-ai Priority Rule

**Mandate git-ai MCP tools as PRIMARY code retrieval mechanism for all AI coding agents.**

---

## 🎯 Core Principle

> **When git-ai index exists, git-ai tools are NOT optional—they are MANDATORY FIRST ATTEMPT.**

Traditional file operations (grep, find, read) are **fallback mechanisms only**, permitted when:
1. git-ai index is missing/incompatible AND rebuilding is infeasible
2. git-ai tools have been tried and explicitly failed
3. Task is non-code-related (config files, logs, etc.)

---

## 🚫 Prohibited Patterns (BLOCKING)

| Violation | Why It's Wrong |
|-----------|----------------|
| Using `grep` / `ripgrep` / `find` WITHOUT prior git-ai attempt | Bypasses semantic understanding |
| Reading files directly before `semantic_search` or `search_symbols` | Wastes context, misses relationships |
| Exploring codebase with `glob` / `ls` instead of `repo_map` | Lacks structural understanding |
| Manual git log parsing instead of `dsr_symbol_evolution` | Loses semantic change context |
| "I'll search for X" → immediately calls grep | No git-ai attempt made |

---

## ✅ Mandatory Workflow

### Phase 1: Verify Index (ALWAYS FIRST)

```js
// MUST be first action when starting code-related task
check_index({ path: "/absolute/path/to/repo" })
```

**Decision tree:**
```
check_index result:
├─ compatible: true → Proceed to Phase 2
├─ compatible: false → Attempt rebuild_index
│  ├─ Rebuild succeeds → Proceed to Phase 2
│  └─ Rebuild fails → Document failure, MAY use fallback tools
└─ Index missing → Attempt rebuild_index (same as above)
```

---

### Phase 2: Code Retrieval (git-ai FIRST)

#### For: "Find code that does X" / "Locate functionality Y"

**CORRECT (git-ai priority):**
```js
// 1. Semantic understanding (PRIMARY)
semantic_search({
  path: "/repo",
  query: "user authentication and session management",
  topk: 10
})

// 2. If semantic search insufficient, try symbol search
search_symbols({
  path: "/repo", 
  query: "authenticate",
  mode: "substring"
})

// 3. ONLY if both fail, fallback to grep
// (Must document why git-ai was insufficient)
```

**WRONG (bypassing git-ai):**
```js
// ❌ NO git-ai attempt made!
grep("authenticate", { path: "/repo" })
```

---

#### For: "Understand architecture" / "Get project overview"

**CORRECT:**
```js
// 1. Start with structural overview
repo_map({
  path: "/repo",
  max_files: 20,
  max_symbols: 5
})

// 2. Deep dive into key areas
semantic_search({
  path: "/repo",
  query: "core business logic payment processing"
})
```

**WRONG:**
```js
// ❌ Bypassing repo_map
glob("**/*.ts")
// Then manually reading files
```

---

#### For: "Who calls function X?" / "What does X call?"

**CORRECT:**
```js
// 1. Call graph analysis (PRIMARY)
ast_graph_callers({
  path: "/repo",
  name: "processPayment"
})

// 2. For complex flows, use chain
ast_graph_chain({
  path: "/repo",
  name: "processPayment",
  direction: "upstream",
  max_depth: 3
})
```

**WRONG:**
```js
// ❌ Manual text search for function calls
grep("processPayment\\(", { path: "/repo" })
```

---

#### For: "When/why did X change?" / "History of function Y"

**CORRECT:**
```js
// 1. DSR-based history (PRIMARY)
dsr_symbol_evolution({
  path: "/repo",
  symbol: "authenticateUser",
  limit: 50
})
```

**WRONG:**
```js
// ❌ Manual git log parsing
bash("git log -p --all -S 'authenticateUser'")
```

---

### Phase 3: Read Files (AFTER LOCATION IDENTIFIED)

Only AFTER git-ai tools locate relevant files:

```js
// Now read specific files identified by search
read_file({
  path: "/repo",
  file: "src/auth/service.ts",  // From search results
  start_line: 45,                // From symbol location
  end_line: 100
})
```

---

## 🔄 Fallback Protocol

When git-ai tools fail or are unavailable:

### 1. Document Failure
```
Attempted git-ai tools:
- check_index: [result]
- rebuild_index: [attempted? result?]
- semantic_search: [tried? error?]

Reason for fallback: [explain]
Fallback method: [grep/glob/etc.]
```

### 2. Permitted Fallbacks (with justification)

| Scenario | Fallback Tool | Justification Required |
|----------|---------------|------------------------|
| Index rebuild fails in CI | grep | "Cannot rebuild in CI, read-only filesystem" |
| Non-code files (.env, logs) | read | "Config files, not indexed" |
| git-ai returns no results AND symbol definitely exists | grep | "Verified symbol X exists in file Y, possible index staleness" |

---

## 📊 Tool Priority Matrix

| Task Type | Priority 1 | Priority 2 | Priority 3 (Fallback) |
|-----------|-----------|-----------|----------------------|
| **Find by concept** | `semantic_search` | `search_symbols` | `grep` |
| **Find by name** | `search_symbols` | `ast_graph_find` | `grep` |
| **Call relationships** | `ast_graph_callers/callees` | `ast_graph_chain` | `grep` + manual |
| **Architecture overview** | `repo_map` | `semantic_search` | `glob` + read |
| **Change history** | `dsr_symbol_evolution` | `dsr_context` | `git log` |
| **Read specific file** | `read_file` (after locating) | N/A | N/A |

---

## 🎓 Examples

### Example 1: "Find authentication logic"

**✅ CORRECT:**
```
Agent: I need to find authentication logic in this codebase.

Step 1: Check index
→ check_index({ path: "/repo" })
→ Result: compatible: true

Step 2: Semantic search
→ semantic_search({ 
    path: "/repo", 
    query: "user authentication login session management",
    topk: 10 
  })
→ Found: src/auth/service.ts, src/middleware/auth.ts

Step 3: Read specific files
→ read_file({ path: "/repo", file: "src/auth/service.ts" })
```

**❌ WRONG:**
```
Agent: I need to find authentication logic.

Step 1: Text search
→ grep("authenticate|login", { path: "/repo" })
  [NO git-ai attempt made!]
```

---

### Example 2: "Who calls function processOrder?"

**✅ CORRECT:**
```
Step 1: Check index
→ check_index({ path: "/repo" })

Step 2: Call graph query
→ ast_graph_callers({ path: "/repo", name: "processOrder" })
→ Found 3 callers: handleCheckout, retryOrder, adminPanel

Step 3: If need full chain
→ ast_graph_chain({ 
    path: "/repo", 
    name: "processOrder",
    direction: "upstream",
    max_depth: 5
  })
```

**❌ WRONG:**
```
Step 1: Text search
→ grep("processOrder\\(", { include: "**/*.ts" })
  [Misses indirect calls, dynamic invocations]
```

---

### Example 3: "Understand project structure"

**✅ CORRECT:**
```
Step 1: Check index
→ check_index({ path: "/repo" })

Step 2: High-level overview
→ repo_map({ path: "/repo", max_files: 20 })
→ Returns: Top 20 files, key symbols, wiki links

Step 3: Deep dive into areas
→ semantic_search({ 
    path: "/repo",
    query: "main application entry point"
  })
```

**❌ WRONG:**
```
Step 1: List all files
→ glob("**/*")
  [No semantic understanding, overwhelming output]

Step 2: Read random files
→ read("package.json")
→ read("README.md")
  [Lacks structure, trial-and-error]
```

---

## 🛡️ Enforcement Checklist

Before ANY code search/retrieval operation, verify:

- [ ] `check_index` called first?
- [ ] git-ai tools attempted before grep/glob/find?
- [ ] If fallback used, is failure documented?
- [ ] Using `repo_map` for architecture overview?
- [ ] Using `dsr_symbol_evolution` for history, not `git log`?
- [ ] Using `ast_graph_*` for relationships, not text search?

---

## 🔗 Related Documentation

- **Tools Reference**: [git-ai MCP Tools](../skills/git-ai-code-search/references/tools.md)
- **Behavioral Constraints**: [git-ai Constraints](../skills/git-ai-code-search/references/constraints.md)
- **Skill Guide**: [git-ai Code Search Skill](../skills/git-ai-code-search/SKILL.md)

---

## 📝 Implementation Notes

### For Agent Developers

Add this rule to agent configuration:

**Claude Code / OpenCode:**
```yaml
# .claude/rules/git-ai-priority.md
rules:
  - file: templates/agents/common/rules/git-ai-priority/RULE.md
    priority: critical
```

**Cursor / Windsurf:**
```json
// .cursorrules
{
  "rules": [
    {
      "name": "git-ai-priority",
      "file": "templates/agents/common/rules/git-ai-priority/RULE.md",
      "enforce": true
    }
  ]
}
```

### For MCP Server Configuration

Ensure git-ai MCP server is registered:

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "git-ai": {
      "command": "git-ai",
      "args": ["ai", "serve"]
    }
  }
}
```

---

## 🚨 Violation Severity

| Severity | Violation | Action |
|----------|-----------|--------|
| **Critical** | Using fallback tools WITHOUT git-ai attempt | Reject operation |
| **High** | Skipping `check_index` before search | Warning, require check |
| **Medium** | Using git-ai but not optimal tool (e.g., `search_symbols` for conceptual search) | Suggest `semantic_search` |
| **Low** | Not using `repo_map` for initial exploration | Recommend but allow |

---

**Version:** 1.0.0  
**Last Updated:** 2026-02-05  
**Status:** Active
