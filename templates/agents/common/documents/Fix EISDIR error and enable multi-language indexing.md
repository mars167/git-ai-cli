The user encountered an `EISDIR: illegal operation on a directory, read` error when running `git-ai ai index`. This is caused by the file globbing logic inadvertently matching directories (likely due to a directory name matching the file extension pattern or default glob behavior), and then trying to read them as files.

Additionally, the current indexer implementation (`src/core/indexer.ts` and `src/core/lancedb.ts`) only supports `java` and `ts`, missing the newly added languages (C, Go, Python, PHP, Rust).

I will fix the error and enable full multi-language support by:

1.  **Updating `src/core/lancedb.ts`**: Expand the `IndexLang` type and `ALL_INDEX_LANGS` array to include `c`, `go`, `python`, `php`, and `rust`.
2.  **Updating `src/core/indexer.ts`**:
    *   Modify the `glob` pattern to include extensions for all supported languages (`.c`, `.h`, `.go`, `.py`, `.php`, `.rs`).
    *   **Crucial Fix**: Add `nodir: true` to the `glob` options to ensure only files are returned, preventing the `EISDIR` error.
    *   Update `inferIndexLang` to correctly map file extensions to the new `IndexLang` types.
    *   Add an extra `fs.stat` check before parsing as a safety net.

This will resolve the crash and enable indexing for the full polyglot stack.
