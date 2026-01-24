import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { LanguageAdapter } from './adapter';
import { ParseResult, SymbolInfo, AstReference } from '../types';
import { pushRef, parseHeritage } from './utils';

export class TypeScriptAdapter implements LanguageAdapter {
  constructor(private isTsx: boolean = false) {}

  getLanguageId(): string {
    return 'typescript';
  }

  getTreeSitterLanguage(): any {
    return this.isTsx ? TypeScript.tsx : TypeScript.typescript;
  }

  getSupportedFileExtensions(): string[] {
    return this.isTsx ? ['.tsx', '.jsx'] : ['.ts', '.js', '.mjs', '.cjs'];
  }

  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const extractTsCalleeName = (callee: Parser.SyntaxNode | null): string | null => {
      if (!callee) return null;
      if (callee.type === 'identifier') return callee.text;
      if (callee.type === 'member_expression' || callee.type === 'optional_chain') {
        const prop = callee.childForFieldName('property');
        if (prop) return prop.text;
        const last = callee.namedChild(callee.namedChildCount - 1);
        if (last) return last.text;
      }
      return null;
    };

    const traverse = (n: Parser.SyntaxNode, container?: SymbolInfo) => {
      if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function') ?? n.namedChild(0);
        const callee = extractTsCalleeName(fn);
        if (callee) pushRef(refs, callee, 'call', fn ?? n);
      } else if (n.type === 'new_expression') {
        const ctor = n.childForFieldName('constructor') ?? n.namedChild(0);
        const callee = extractTsCalleeName(ctor);
        if (callee) pushRef(refs, callee, 'new', ctor ?? n);
      } else if (n.type === 'type_identifier') {
        pushRef(refs, n.text, 'type', n);
      }

      let currentContainer = container;

      if (n.type === 'function_declaration' || n.type === 'method_definition') {
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const newSymbol: SymbolInfo = {
            name: nameNode.text,
            kind: n.type === 'method_definition' ? 'method' : 'function',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: n.text.split('{')[0].trim(),
            container: container,
          };
          symbols.push(newSymbol);
          currentContainer = newSymbol;
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
          currentContainer = classSym;
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, currentContainer);
    };

    traverse(node, undefined);
    return { symbols, refs };
  }
}
