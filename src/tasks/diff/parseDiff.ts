export interface ParsedDiffFile {
  path: string;
  addedLines: string[];
  removedLines: string[];
  contextLines: string[];
}

export function parseDiff(diffText: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;

  for (const rawLine of diffText.split(/\r?\n/)) {
    if (rawLine.startsWith('+++ b/')) {
      current = {
        path: rawLine.slice('+++ b/'.length).trim(),
        addedLines: [],
        removedLines: [],
        contextLines: [],
      };
      files.push(current);
      continue;
    }

    if (!current) continue;
    if (rawLine.startsWith('@@')) continue;
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      current.addedLines.push(rawLine.slice(1));
      continue;
    }
    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      current.removedLines.push(rawLine.slice(1));
      continue;
    }
    if (rawLine.startsWith(' ')) {
      current.contextLines.push(rawLine.slice(1));
    }
  }

  return files;
}
