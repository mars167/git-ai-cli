import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef } from './utils';

export class PythonAdapter implements LanguageAdapter {
  getLanguageId(): string {
    return 'python';
  }

  getTreeSitterLanguage(): any {
    return Python as any;
  }

  getSupportedFileExtensions(): string[] {
    return ['.py'];
  }

  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (n.type === 'call') {
        const fn = n.childForFieldName('function');
        const nameNode = this.getCallNameNode(fn);
        if (nameNode) pushRef(refs, nameNode.text, 'call', nameNode);
      }

      let currentContainer = container;

      if (n.type === 'function_definition') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const kind = container?.kind === 'class' ? 'method' : 'function';
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind,
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: this.getSignature(n),
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
        }
      } else if (n.type === 'class_definition') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: 'class',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: `class ${nameNode.text}`,
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, currentContainer);
    };

    traverse(node, undefined);
    return { symbols, refs };
  }

  private getCallNameNode(node: Parser.SyntaxNode | null): Parser.SyntaxNode | null {
      if (!node) return null;
      if (node.type === 'identifier') return node;
      if (node.type === 'attribute') {
          return node.childForFieldName('attribute');
      }
      return null;
  }

  private getSignature(node: Parser.SyntaxNode): string {
      return node.text.split(':')[0].trim();
  }
}
