import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef } from './utils';

export class CAdapter implements LanguageAdapter {
  getLanguageId(): string {
    return 'c';
  }

  getTreeSitterLanguage(): any {
    return C as any;
  }

  getSupportedFileExtensions(): string[] {
    return ['.c', '.h'];
  }

  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function');
        if (fn) pushRef(refs, fn.text, 'call', fn);
      } else if (n.type === 'type_identifier') {
        pushRef(refs, n.text, 'type', n);
      }

      let currentContainer = container;

      if (n.type === 'function_definition') {
        const declarator = n.childForFieldName('declarator');
        const nameNode = this.findIdentifier(declarator);
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
      } else if (n.type === 'struct_specifier') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
           const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: 'class',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: `struct ${nameNode.text}`,
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

  private findIdentifier(node: Parser.SyntaxNode | null): Parser.SyntaxNode | null {
    if (!node) return null;
    if (node.type === 'identifier') return node;
    // recursive search, but limit depth or prioritize 'declarator' fields?
    // In C, function_declarator has 'declarator' field.
    if (node.type === 'function_declarator' || node.type === 'pointer_declarator' || node.type === 'parenthesized_declarator') {
         const decl = node.childForFieldName('declarator');
         if (decl) return this.findIdentifier(decl);
         // if no named field, just check children
         for (let i = 0; i < node.childCount; i++) {
             const res = this.findIdentifier(node.child(i));
             if (res) return res;
         }
    }
    return null;
  }
  
  private getSignature(node: Parser.SyntaxNode): string {
      return node.text.split('{')[0].trim();
  }
}
