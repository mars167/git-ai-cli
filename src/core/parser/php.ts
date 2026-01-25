/// <reference path="../../modules.d.ts" />
import Parser from 'tree-sitter';
import PHP from 'tree-sitter-php';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef } from './utils';

export class PHPAdapter implements LanguageAdapter {
  getLanguageId(): string {
    return 'php';
  }

  getTreeSitterLanguage(): any {
    return (PHP as any).php_only || (PHP as any).php || PHP;
  }

  getSupportedFileExtensions(): string[] {
    return ['.php'];
  }

  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function');
        const nameNode = this.getCallNameNode(fn);
        if (nameNode) pushRef(refs, nameNode.text, 'call', nameNode);
      } else if (n.type === 'member_call_expression') {
         const nameNode = n.childForFieldName('name');
         if (nameNode) pushRef(refs, nameNode.text, 'call', nameNode);
      } else if (n.type === 'object_creation_expression') {
          const typeNode = n.childForFieldName('type'); 
           if (typeNode && (typeNode.type === 'name' || typeNode.type === 'qualified_name')) {
               pushRef(refs, typeNode.text, 'new', typeNode);
           }
      }

      let currentContainer = container;

      if (n.type === 'function_definition') {
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
      } else if (n.type === 'class_declaration' || n.type === 'interface_declaration' || n.type === 'trait_declaration') {
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
      if (node.type === 'name' || node.type === 'qualified_name') return node;
      return null;
  }

  private getSignature(node: Parser.SyntaxNode): string {
      return node.text.split('{')[0].trim();
  }
}
