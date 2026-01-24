import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef } from './utils';

export class GoAdapter implements LanguageAdapter {
  getLanguageId(): string {
    return 'go';
  }

  getTreeSitterLanguage(): any {
    return Go as any;
  }

  getSupportedFileExtensions(): string[] {
    return ['.go'];
  }

  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function');
        const nameNode = this.getCallNameNode(fn);
        if (nameNode) pushRef(refs, nameNode.text, 'call', nameNode);
      } else if (n.type === 'type_identifier') {
        pushRef(refs, n.text, 'type', n);
      }

      let currentContainer = container;

      if (n.type === 'function_declaration') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: 'function',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: this.getSignature(n),
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
        }
      } else if (n.type === 'method_declaration') {
         const nameNode = n.childForFieldName('name');
         if (nameNode) {
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: 'method',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: this.getSignature(n),
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
        }
      } else if (n.type === 'type_specifier') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
               const newSymbol: SymbolInfo = {
                name: nameNode.text,
                kind: 'class',
                startLine: n.startPosition.row + 1,
                endLine: n.endPosition.row + 1,
                signature: `type ${nameNode.text}`,
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
      if (node.type === 'selector_expression') {
          return node.childForFieldName('field');
      }
      return null;
  }

  private getSignature(node: Parser.SyntaxNode): string {
      return node.text.split('{')[0].trim();
  }
}
