import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import fs from 'fs-extra';
import { SymbolInfo } from './types';

export class CodeParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
  }

  async parseFile(filePath: string): Promise<SymbolInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    if (!(filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx'))) {
      return [];
    }

    const tree = this.parser.parse(content);
    return this.extractSymbols(tree.rootNode);
  }

  private extractSymbols(node: Parser.SyntaxNode): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const traverse = (n: Parser.SyntaxNode) => {
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

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!);
    };

    traverse(node);
    return symbols;
  }
}

