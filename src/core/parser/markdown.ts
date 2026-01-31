import { ParseResult, SymbolInfo } from '../types';

const headerPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

type Section = {
  level: number;
  name: string;
  startLine: number;
  endLine: number;
  parent?: Section;
};

function buildPath(current: Section): string {
  const parts: string[] = [];
  let cursor: Section | undefined = current;
  while (cursor) {
    parts.unshift(cursor.name);
    cursor = cursor.parent;
  }
  return parts.join(' > ');
}

export function parseMarkdown(content: string, filePath: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const sections: Section[] = [];
  const stack: Section[] = [];

  const pushSection = (level: number, name: string, startLine: number) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      const last = stack.pop();
      if (last) last.endLine = startLine - 1;
    }
    const parent = stack[stack.length - 1];
    const section: Section = { level, name, startLine, endLine: lines.length, parent };
    sections.push(section);
    stack.push(section);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = headerPattern.exec(line);
    if (!match) continue;
    const level = match[1].length;
    const name = match[2].trim();
    if (!name) continue;
    pushSection(level, name, i + 1);
  }

  while (stack.length > 0) {
    const last = stack.pop();
    if (last) last.endLine = lines.length;
  }

  const symbols: SymbolInfo[] = sections.map((section) => {
    const signature = buildPath(section) || section.name;
    const container = section.parent
      ? {
        name: section.parent.name,
        kind: 'section' as const,
        startLine: section.parent.startLine,
        endLine: section.parent.endLine,
        signature: buildPath(section.parent) || section.parent.name,
      }
      : undefined;
    return {
      name: section.name,
      kind: 'section',
      startLine: section.startLine,
      endLine: section.endLine,
      signature,
      ...(container ? { container } : {}),
    };
  });

  if (symbols.length === 0) {
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    symbols.push({
      name,
      kind: 'document',
      startLine: 1,
      endLine: Math.max(1, lines.length),
      signature: name,
    });
  }

  return { symbols, refs: [] };
}
