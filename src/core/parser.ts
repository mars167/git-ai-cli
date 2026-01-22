import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Java from 'tree-sitter-java';
import fs from 'fs-extra';
import { SymbolInfo } from './types';

export class CodeParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  async parseFile(filePath: string): Promise<SymbolInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.pickLanguage(filePath);
    if (!language) return [];

    this.parser.setLanguage(language.language);
    try {
      const tree = this.parser.parse(content);
      return this.extractSymbols(tree.rootNode, language.id);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!msg.includes('Invalid argument')) return [];
      try {
        const tree = this.parser.parse(content, undefined, { bufferSize: 1024 * 1024 });
        return this.extractSymbols(tree.rootNode, language.id);
      } catch {
        return [];
      }
    }
  }

  private pickLanguage(filePath: string): { id: 'typescript' | 'java'; language: any } | null {
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      return { id: 'typescript', language: TypeScript.typescript };
    }
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return { id: 'typescript', language: TypeScript.tsx };
    }
    if (filePath.endsWith('.java')) {
      return { id: 'java', language: Java as any };
    }
    return null;
  }

  private extractSymbols(node: Parser.SyntaxNode, languageId: 'typescript' | 'java'): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const parseHeritage = (head: string): { extends?: string[]; implements?: string[] } => {
      const out: { extends?: string[]; implements?: string[] } = {};
      const extendsMatch = head.match(/\bextends\s+([A-Za-z0-9_$.<>\[\]]+)/);
      if (extendsMatch?.[1]) out.extends = [extendsMatch[1]];

      const implMatch = head.match(/\bimplements\s+([A-Za-z0-9_$. ,<>\[\]]+)/);
      if (implMatch?.[1]) {
        const raw = implMatch[1];
        const parts: string[] = [];
        let current = '';
        let depth = 0;
        for (const char of raw) {
          if (char === '<') depth++;
          else if (char === '>') depth--;
          
          if (char === ',' && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        if (current.trim()) parts.push(current.trim());
        
        if (parts.length > 0) out.implements = parts;
      }
      return out;
    };

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (languageId === 'typescript') {
        if (n.type === 'function_declaration' || n.type === 'method_definition') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
            symbols.push({
              name: nameNode.text,
              kind: n.type === 'method_definition' ? 'method' : 'function',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: n.text.split('{')[0].trim(),
              container: n.type === 'method_definition' ? container : undefined,
            });
          }
        } else if (n.type === 'class_declaration') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
            const head = n.text.split('{')[0].trim();
            const heritage = parseHeritage(head);
            const classSym: SymbolInfo = {
              name: nameNode.text,
              kind: 'class',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: `class ${nameNode.text}`,
              container,
              extends: heritage.extends,
              implements: heritage.implements,
            };
            symbols.push(classSym);
            for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, classSym);
            return;
          }
        }
      } else {
        if (n.type === 'method_declaration' || n.type === 'constructor_declaration') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
            const head = n.text.split('{')[0].split(';')[0].trim();
            symbols.push({
              name: nameNode.text,
              kind: 'method',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: head,
              container,
            });
          }
        } else if (
          n.type === 'class_declaration'
          || n.type === 'interface_declaration'
          || n.type === 'enum_declaration'
          || n.type === 'record_declaration'
          || n.type === 'annotation_type_declaration'
        ) {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
            const head = n.text.split('{')[0].split(';')[0].trim();
            const heritage = parseHeritage(head);
            const classSym: SymbolInfo = {
              name: nameNode.text,
              kind: 'class',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: `${n.type.replace(/_declaration$/, '')} ${nameNode.text}`,
              container,
              extends: heritage.extends,
              implements: heritage.implements,
            };
            symbols.push(classSym);
            for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, classSym);
            return;
          }
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, container);
    };

    traverse(node, undefined);
    return symbols;
  }
}
