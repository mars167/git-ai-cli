import { ParseResult, SymbolInfo } from '../types';

const keyPattern = /^\s*([A-Za-z0-9_.-]+)\s*:/;

type YamlNode = {
  name: string;
  startLine: number;
  endLine: number;
};

function isConfigPath(filePath: string): boolean {
  const p = filePath.replace(/\\/g, '/');
  return p.includes('/.agents/') || p.includes('/templates/agents/') || p.includes('/rules/') || p.includes('/skills/');
}

function fileBaseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

export function parseYaml(content: string, filePath: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const nodes: YamlNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trimStart().startsWith('#')) continue;
    const match = keyPattern.exec(line);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) continue;
    if (line.trimStart().startsWith('-')) continue;
    nodes.push({ name, startLine: i + 1, endLine: lines.length });
  }

  for (let i = 0; i < nodes.length; i++) {
    const next = nodes[i + 1];
    if (next) nodes[i].endLine = Math.max(nodes[i].startLine, next.startLine - 1);
  }

  const symbols: SymbolInfo[] = nodes.map((node) => ({
    name: node.name,
    kind: 'node',
    startLine: node.startLine,
    endLine: node.endLine,
    signature: node.name,
  }));

  if (symbols.length === 0) {
    const name = fileBaseName(filePath);
    symbols.push({
      name,
      kind: isConfigPath(filePath) ? 'document' : 'node',
      startLine: 1,
      endLine: Math.max(1, lines.length),
      signature: name,
    });
  }

  return { symbols, refs: [] };
}
