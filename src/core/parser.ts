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
    const tree = this.parser.parse(content);
    return this.extractSymbols(tree.rootNode, language.id);
  }

  private pickLanguage(filePath: string): { id: 'typescript' | 'java'; language: any } | null {
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      return { id: 'typescript', language: TypeScript.typescript };
    }
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return { id: 'typescript', language: TypeScript.tsx };
    }
    if (filePath.endsWith('.java')) {
      return { id: 'java', language: Java };
    }
    return null;
  }

  private extractSymbols(node: Parser.SyntaxNode, languageId: 'typescript' | 'java'): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const traverse = (n: Parser.SyntaxNode) => {
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
            });
          }
        } else if (n.type === 'class_declaration') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
            symbols.push({
              name: nameNode.text,
              kind: 'class',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: `class ${nameNode.text}`,
            });
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
            symbols.push({
              name: nameNode.text,
              kind: 'class',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: `${n.type.replace(/_declaration$/, '')} ${nameNode.text}`,
            });
          }
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!);
    };

    traverse(node);
    return symbols;
  }
}
