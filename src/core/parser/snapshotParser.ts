import Parser from 'tree-sitter';
import { ParseResult, SymbolInfo } from '../types';
import { LanguageAdapter } from './adapter';
import { TypeScriptAdapter } from './typescript';
import { JavaAdapter } from './java';
import { CAdapter } from './c';
import { GoAdapter } from './go';
import { PythonAdapter } from './python';
import { RustAdapter } from './rust';
import { parseMarkdown } from './markdown';
import { parseYaml } from './yaml';

export interface ParsedSymbolSnapshot {
  symbol: SymbolInfo;
  content_hash: string;
}

export class SnapshotCodeParser {
  private parser: Parser;
  private adapters: LanguageAdapter[];

  constructor() {
    this.parser = new Parser();
    this.adapters = [
      new TypeScriptAdapter(false),
      new TypeScriptAdapter(true),
      new JavaAdapter(),
      new CAdapter(),
      new GoAdapter(),
      new PythonAdapter(),
      new RustAdapter(),
    ];
  }

  parseContent(filePath: string, content: string): ParseResult {
    if (isMarkdownFile(filePath)) return parseMarkdown(content, filePath);
    if (isYamlFile(filePath)) return parseYaml(content, filePath);
    const adapter = this.pickAdapter(filePath);
    if (!adapter) return { symbols: [], refs: [] };
    try {
      this.parser.setLanguage(adapter.getTreeSitterLanguage());
      const tree = this.parser.parse(content);
      return adapter.extractSymbolsAndRefs(tree.rootNode);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('Invalid language object')) return { symbols: [], refs: [] };
      if (!msg.includes('Invalid argument')) return { symbols: [], refs: [] };
      try {
        const tree = this.parser.parse(content, undefined, { bufferSize: 1024 * 1024 });
        return adapter.extractSymbolsAndRefs(tree.rootNode);
      } catch {
        return { symbols: [], refs: [] };
      }
    }
  }

  private pickAdapter(filePath: string): LanguageAdapter | null {
    for (const adapter of this.adapters) {
      for (const ext of adapter.getSupportedFileExtensions()) {
        if (filePath.endsWith(ext)) return adapter;
      }
    }
    return null;
  }
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md') || filePath.endsWith('.mdx');
}

function isYamlFile(filePath: string): boolean {
  return filePath.endsWith('.yml') || filePath.endsWith('.yaml');
}
