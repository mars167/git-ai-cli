---
name: git-ai-code-search
description: |
  Code Context Engine skill for local code retrieval and task-oriented context building. Use when searching for code, preparing implementation work, reviewing diffs, finding tests, or analyzing impact in a local repository.
---

# Code Context Engine Skill

## Recommended Workflow

1. `check_index({ path })`
2. `repo_map({ path })` when you need a repo overview
3. `lexical_search({ path, query, ... })` for initial precise recall
4. Use the task tools as the main working surface:
   - `implementation_context`
   - `find_tests`
   - `find_impact`
   - `find_extension_points`
   - `review_context_for_diff`
5. `read_file({ path, file })` before making or suggesting edits

## Retrieval Order

- lexical / symbol first
- graph expand second
- semantic rerank last

## Thin MCP Surface

- `check_index`
- `rebuild_index`
- `read_file`
- `repo_map`
- `lexical_search`
- `implementation_context`
- `find_tests`
- `find_impact`
- `find_extension_points`
- `review_context_for_diff`
