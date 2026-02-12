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
        if (callee) {
          pushRef(refs, callee, 'call', fn ?? n);
          
          // Handle test() and describe() patterns for test files
          if (callee === 'test' || callee === 'describe') {
            // Extract test name from first argument (usually a string)
            const args = n.childForFieldName('arguments');
            if (args && args.namedChildCount > 0) {
              const firstArg = args.namedChild(0);
              if (firstArg?.type === 'string' || firstArg?.type === 'template_string') {
                const testName = firstArg.text.replace(/^['"`]|['"`]$/g, '').trim();
                if (testName) {
                  const testSym: SymbolInfo = {
                    name: testName,
                    kind: 'test',
                    startLine: n.startPosition.row + 1,
                    endLine: n.endPosition.row + 1,
                    signature: `${callee}("${testName}", ...)`,
                    container: container,
                  };
                  symbols.push(testSym);
                }
              }
            }
          }
        }
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
      } else if (n.type === 'lexical_declaration' || n.type === 'variable_declaration') {
        // Handle: const foo = () => {}, const bar = function() {}, const baz = value
        for (let i = 0; i < n.namedChildCount; i++) {
          const declarator = n.namedChild(i);
          if (declarator?.type === 'variable_declarator') {
            const nameNode = declarator.childForFieldName('name');
            const valueNode = declarator.childForFieldName('value');
            
            if (nameNode && valueNode) {
              const isFunction = valueNode.type === 'arrow_function' || 
                                valueNode.type === 'function' ||
                                valueNode.type === 'function_expression';
              
              if (isFunction) {
                const newSymbol: SymbolInfo = {
                  name: nameNode.text,
                  kind: 'function',
                  startLine: declarator.startPosition.row + 1,
                  endLine: declarator.endPosition.row + 1,
                  signature: declarator.text.split('=>')[0].trim() + ' => ...',
                  container: container,
                };
                symbols.push(newSymbol);
                currentContainer = newSymbol;
              } else {
                // Also track exported constants/variables
                const parent = n.parent;
                if (parent?.type === 'export_statement') {
                  const newSymbol: SymbolInfo = {
                    name: nameNode.text,
                    kind: 'variable',
                    startLine: declarator.startPosition.row + 1,
                    endLine: declarator.endPosition.row + 1,
                    signature: declarator.text.split('=')[0].trim(),
                    container: container,
                  };
                  symbols.push(newSymbol);
                }
              }
            }
          }
        }
      } else if (n.type === 'export_statement') {
        // Handle: export { foo, bar }
        const exportClause = n.childForFieldName('declaration');
        if (exportClause?.type === 'export_clause') {
          for (let i = 0; i < exportClause.namedChildCount; i++) {
            const specifier = exportClause.namedChild(i);
            if (specifier?.type === 'export_specifier') {
              const nameNode = specifier.childForFieldName('name');
              if (nameNode) {
                const newSymbol: SymbolInfo = {
                  name: nameNode.text,
                  kind: 'export',
                  startLine: specifier.startPosition.row + 1,
                  endLine: specifier.endPosition.row + 1,
                  signature: `export { ${nameNode.text} }`,
                  container: container,
                };
                symbols.push(newSymbol);
              }
            }
          }
        }
      } else if (n.type === 'type_alias_declaration') {
        // Handle: type MyType = string | number;
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const typeSym: SymbolInfo = {
            name: nameNode.text,
            kind: 'type',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: `type ${nameNode.text} = ...`,
            container: container,
          };
          symbols.push(typeSym);
        }
      } else if (n.type === 'interface_declaration') {
        // Handle: interface MyInterface { ... }
        const nameNode = n.childForFieldName('name');
        if (nameNode) {
          const head = n.text.split('{')[0].trim();
          const heritage = parseHeritage(head);
          const interfaceSym: SymbolInfo = {
            name: nameNode.text,
            kind: 'interface',
            startLine: n.startPosition.row + 1,
            endLine: n.endPosition.row + 1,
            signature: `interface ${nameNode.text}`,
            container: container,
            extends: heritage.extends,
            implements: heritage.implements,
          };
          symbols.push(interfaceSym);
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, currentContainer);
    };

    traverse(node, undefined);
    return { symbols, refs };
  }
}
