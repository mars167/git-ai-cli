The error is caused by `ts-node` (running in development mode) failing to find type definitions for `tree-sitter-php` when executed from the `CodaGraph` directory. This happens because `tree-sitter-php` (v0.20.0) does not include built-in TypeScript definitions, unlike the other language parsers (C, Go, Python, Rust) which are newer versions (v0.21+) or include types.

Although `src/modules.d.ts` exists, `ts-node` is not picking it up correctly in this execution context.

I will fix this by:
1.  Explicitly referencing the type declaration file in `src/core/parser/php.ts` using a triple-slash directive. This ensures TypeScript always loads the definitions regardless of the working directory.
2.  Updating `src/modules.d.ts` to remove unnecessary declarations for other languages (C, Go, Python, Rust) since they already provide official types, keeping only the necessary one for PHP.
3.  Verifying the fix by running the index command again.

Implementation Steps:
1.  **Edit `src/core/parser/php.ts`**: Add `/// <reference path="../../modules.d.ts" />` to the top of the file.
2.  **Edit `src/modules.d.ts`**: Remove declarations for C, Go, Python, and Rust; keep only `tree-sitter-php`.
3.  **Verify**: Run the index command in the `CodaGraph` directory to confirm success.
