import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef } from './utils';

export class RustAdapter implements LanguageAdapter {
  getLanguageId(): string {
    return 'rust';
  }

  getTreeSitterLanguage(): any {
    return Rust as any;
  }

  getSupportedFileExtensions(): string[] {
    return ['.rs'];
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

      if (n.type === 'function_item') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          // If container is class (impl block or struct), it's a method
          const kind = container?.kind === 'class' ? 'method' : 'function';
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: kind, 
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: this.getSignature(n),
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
        }
      } else if (n.type === 'struct_item' || n.type === 'enum_item' || n.type === 'trait_item') {
         const nameNode = n.childForFieldName('name');
         if (nameNode) {
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: 'class',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: `${n.type.replace(/_item$/, '')} ${nameNode.text}`,
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
         }
      } else if (n.type === 'impl_item') {
          const typeNode = n.childForFieldName('type');
          if (typeNode) {
             const newSymbol: SymbolInfo = {
                name: typeNode.text,
                kind: 'class',
                startLine: n.startPosition.row + 1,
                endLine: n.endPosition.row + 1,
                signature: `impl ${typeNode.text}`,
                container: container
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
      if (node.type === 'scoped_identifier') {
          return node.childForFieldName('name');
      }
      if (node.type === 'field_expression') {
          return node.childForFieldName('field');
      }
      return null;
  }

  private getSignature(node: Parser.SyntaxNode): string {
      return node.text.split('{')[0].trim();
  }
}
