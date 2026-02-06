import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef, parseHeritage, findFirstByType } from './utils';

export class JavaAdapter implements LanguageAdapter {
  getLanguageId(): string {
    return 'java';
  }

  getTreeSitterLanguage(): any {
    return Java as any;
  }

  getSupportedFileExtensions(): string[] {
    return ['.java'];
  }

  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (n.type === 'method_invocation') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) pushRef(refs, nameNode.text, 'call', nameNode);
      } else if (n.type === 'object_creation_expression') {
        const typeNode = findFirstByType(n, ['type_identifier', 'identifier']);
        if (typeNode) pushRef(refs, typeNode.text, 'new', typeNode);
      }

      let currentContainer = container;

      if (n.type === 'method_declaration' || n.type === 'constructor_declaration') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const head = n.text.split('{')[0].split(';')[0].trim();
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: 'method',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: head,
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
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
          currentContainer = classSym;
        }
      } else if (n.type === 'field_declaration') {
        const declarator = findFirstByType(n, ['variable_declarator']);
        const nameNode = declarator?.childForFieldName('name');
        if (nameNode) {
          const fieldSym: SymbolInfo = {
            name: nameNode.text,
            kind: 'field',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: n.text.split(';')[0].trim(),
            container,
          };
          symbols.push(fieldSym);
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, currentContainer);
    };

    traverse(node, undefined);
    return { symbols, refs };
  }
}
