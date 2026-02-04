# Agent Rules for git-ai

Agent rules define **mandatory behavioral constraints** for AI coding agents (Claude Code, OpenCode, Cursor, Windsurf, etc.) when working with git-ai indexed repositories.

## Rules vs Skills

| Aspect | **Rules** (this directory) | **Skills** (../skills) |
|--------|---------------------------|------------------------|
| **Purpose** | Enforce mandatory behaviors | Provide capabilities/knowledge |
| **Tone** | Prescriptive ("MUST", "NEVER") | Instructional ("Use X for Y") |
| **Violations** | Blocking/Critical | Guidance/Best practices |
| **Focus** | Tool selection priority, workflow order | Tool documentation, usage patterns |

## Available Rules

### 1. git-ai-priority

**File:** [`git-ai-priority/RULE.md`](./git-ai-priority/RULE.md)

**What it does:** Mandates git-ai MCP tools as the PRIMARY code retrieval mechanism, prohibiting agents from bypassing semantic search in favor of naive grep/glob operations.

**Key enforcements:**
- ✅ MUST call `check_index` before any code search
- ✅ MUST attempt `semantic_search`/`search_symbols` before `grep`
- ✅ MUST use `repo_map` for architecture overview before `glob`
- ✅ MUST use `dsr_symbol_evolution` for history, not `git log`
- ✅ MUST use `ast_graph_*` for call relationships, not text search

**Applies to:** All AI coding agents with git-ai MCP server access

**Priority:** Critical

---

## Installation

### Option 1: Manual Installation

Copy rule files to your agent's configuration directory:

**Claude Code / OpenCode:**
```bash
mkdir -p .claude/rules
cp templates/agents/common/rules/git-ai-priority/RULE.md .claude/rules/
```

**Cursor / Windsurf:**
```bash
# Add to .cursorrules or .windsurfrules
cat templates/agents/common/rules/git-ai-priority/RULE.md >> .cursorrules
```

### Option 2: Automated Installation

Use the git-ai CLI agent installer:
```bash
git-ai ai agent install
```

This copies both skills and rules to your project.

---

## Rule Development Guidelines

When creating new rules:

### 1. Structure (Required Sections)

```markdown
---
name: rule-name
description: |
  Clear explanation of what this rule enforces
priority: critical|high|medium|low
applies_to:
  - agent-name-1
  - agent-name-2
---

# Rule Title

## Core Principle
[One-sentence mandate]

## Prohibited Patterns (BLOCKING)
[Table of violations and why they're wrong]

## Mandatory Workflow
[Step-by-step required process]

## Fallback Protocol
[When/how fallback is permitted]

## Examples
[✅ CORRECT vs ❌ WRONG patterns]

## Enforcement Checklist
[Verification steps]
```

### 2. Tone & Language

- **Use imperatives:** "MUST", "NEVER", "ALWAYS", "PROHIBITED"
- **Be specific:** Exact tool names, parameters, sequences
- **Show violations:** Demonstrate WRONG patterns clearly
- **Justify strictness:** Explain WHY each rule exists

### 3. Integration with Skills

Rules REFERENCE skills but DON'T DUPLICATE them:

**Rule (this directory):**
> "MUST use `semantic_search` before `grep`"

**Skill (../skills):**
> "Use `semantic_search` for conceptual queries. Parameters: `path`, `query`, `topk`..."

Rules enforce the "WHAT", skills document the "HOW".

---

## Relationship to MCP Tools

Rules leverage the git-ai MCP server's tools. Ensure the MCP server is configured:

```json
// ~/.config/claude/claude_desktop_config.json
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

## Testing Rules

Verify rule enforcement:

1. **Manual test:** Follow the rule's examples, ensure agent behavior matches
2. **Violation test:** Deliberately violate a rule, check if agent prevents/warns
3. **Fallback test:** Create scenarios where fallback is legitimate, verify agent documents properly

---

## Contributing

To propose a new rule:

1. Check if it should be a **rule** (mandatory) vs **skill** (guidance)
2. Use the structure template above
3. Include at least 3 ✅ CORRECT vs ❌ WRONG examples
4. Specify violation severity (critical/high/medium/low)
5. Test with at least one target agent (Claude Code, Cursor, etc.)

---

## Related Documentation

- **Skills Directory:** [`../skills/`](../skills/) - Agent capabilities and tool documentation
- **git-ai MCP Tools:** [`../skills/git-ai-code-search/references/tools.md`](../skills/git-ai-code-search/references/tools.md)
- **Constraints Reference:** [`../skills/git-ai-code-search/references/constraints.md`](../skills/git-ai-code-search/references/constraints.md)
- **Main README:** [`../../../../README.md`](../../../../README.md)

---

**Last Updated:** 2026-02-05
