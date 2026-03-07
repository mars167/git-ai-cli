import type { DiffInsight } from '../../domain/diff';
import { parseDiff } from './parseDiff';

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractLiterals(lines: string[]): string[] {
  const literals: string[] = [];
  const literalPattern = /["'`]([^"'`]+)["'`]/g;
  for (const line of lines) {
    for (const match of line.matchAll(literalPattern)) {
      literals.push(match[1] ?? '');
    }
  }
  return unique(literals);
}

function extractSymbols(lines: string[]): string[] {
  const identifiers: string[] = [];
  const identifierPattern = /\b[A-Za-z_$][A-Za-z0-9_$]*\b/g;
  for (const line of lines) {
    for (const match of line.matchAll(identifierPattern)) {
      identifiers.push(match[0]);
    }
  }
  return unique(identifiers);
}

export function analyzeDiff(diffText: string): DiffInsight {
  const files = parseDiff(diffText);
  const allAdded = files.flatMap((file) => file.addedLines);
  const allRemoved = files.flatMap((file) => file.removedLines);
  const allContext = files.flatMap((file) => file.contextLines);
  const allLines = [...allAdded, ...allRemoved, ...allContext];

  return {
    touched_files: files.map((file) => ({
      path: file.path,
      change_type: 'modified' as const,
    })),
    touched_symbols: extractSymbols(allLines),
    signature_changes: unique(
      [...allAdded, ...allRemoved].filter((line) =>
        /(function|class|interface|type|=>|\)\s*\{)/.test(line),
      ),
    ),
    import_changes: unique(
      [...allAdded, ...allRemoved].filter((line) => line.trim().startsWith('import ')),
    ),
    config_changes: unique(
      files
        .map((file) => file.path)
        .filter((file) => /(package\.json|tsconfig|\.ya?ml$|\.json$|\.toml$|\.ini$)/i.test(file)),
    ),
    added_literals: extractLiterals(allAdded),
    removed_literals: extractLiterals(allRemoved),
  };
}
