import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import Java from 'tree-sitter-java';
import fs from 'fs-extra';
import { AstReference, AstRefKind, ParseResult, SymbolInfo } from './types';

export class CodeParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.pickLanguage(filePath);
    if (!language) return { symbols: [], refs: [] };

    this.parser.setLanguage(language.language);
    try {
      const tree = this.parser.parse(content);
      return this.extractSymbolsAndRefs(tree.rootNode, language.id);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!msg.includes('Invalid argument')) return { symbols: [], refs: [] };
      try {
        const tree = this.parser.parse(content, undefined, { bufferSize: 1024 * 1024 });
        return this.extractSymbolsAndRefs(tree.rootNode, language.id);
      } catch {
        return { symbols: [], refs: [] };
      }
    }
  }

  private pickLanguage(filePath: string): { id: 'typescript' | 'java'; language: any } | null {
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      return { id: 'typescript', language: TypeScript.typescript };
    }
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return { id: 'typescript', language: TypeScript.tsx };
    }
    if (filePath.endsWith('.java')) {
      return { id: 'java', language: Java as any };
    }
    return null;
  }

  private extractSymbolsAndRefs(node: Parser.SyntaxNode, languageId: 'typescript' | 'java'): ParseResult {
    const symbols: SymbolInfo[] = [];
    const refs: AstReference[] = [];

    const parseHeritage = (head: string): { extends?: string[]; implements?: string[] } => {
      const out: { extends?: string[]; implements?: string[] } = {};
      const extendsMatch = head.match(/\bextends\s+([A-Za-z0-9_$.<>\[\]]+)/);
      if (extendsMatch?.[1]) out.extends = [extendsMatch[1]];

      const implMatch = head.match(/\bimplements\s+([A-Za-z0-9_$. ,<>\[\]]+)/);
      if (implMatch?.[1]) {
        const raw = implMatch[1];
        const parts: string[] = [];
        let current = '';
        let depth = 0;
        for (const char of raw) {
          if (char === '<') depth++;
          else if (char === '>') depth--;
          
          if (char === ',' && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        if (current.trim()) parts.push(current.trim());
        
        if (parts.length > 0) out.implements = parts;
      }
      return out;
    };

    const pushRef = (name: string, refKind: AstRefKind, n: Parser.SyntaxNode) => {
      const nm = String(name ?? '').trim();
      if (!nm) return;
      refs.push({
        name: nm,
        refKind,
        line: n.startPosition.row + 1,
        column: n.startPosition.column + 1,
      });
    };

    const findFirstByType = (n: Parser.SyntaxNode, types: string[]): Parser.SyntaxNode | null => {
      if (types.includes(n.type)) return n;
      for (let i = 0; i < n.childCount; i++) {
        const c = n.child(i);
        if (!c) continue;
        const found = findFirstByType(c, types);
        if (found) return found;
      }
      return null;
    };

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
      if (languageId === 'typescript') {
        if (n.type === 'call_expression') {
          const fn = n.childForFieldName('function') ?? n.namedChild(0);
          const callee = extractTsCalleeName(fn);
          if (callee) pushRef(callee, 'call', fn ?? n);
        } else if (n.type === 'new_expression') {
          const ctor = n.childForFieldName('constructor') ?? n.namedChild(0);
          const callee = extractTsCalleeName(ctor);
          if (callee) pushRef(callee, 'new', ctor ?? n);
        } else if (n.type === 'type_identifier') {
          pushRef(n.text, 'type', n);
        }

        if (n.type === 'function_declaration' || n.type === 'method_definition') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) {
            symbols.push({
              name: nameNode.text,
              kind: n.type === 'method_definition' ? 'method' : 'function',
              startLine: n.startPosition.row + 1,
              endLine: n.endPosition.row + 1,
              signature: n.text.split('{')[0].trim(),
              container: n.type === 'method_definition' ? container : undefined,
            });
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
            for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, classSym);
            return;
          }
        }
      } else {
        if (n.type === 'method_invocation') {
          const nameNode = n.childForFieldName('name');
          if (nameNode) pushRef(nameNode.text, 'call', nameNode);
        } else if (n.type === 'object_creation_expression') {
          const typeNode = findFirstByType(n, ['type_identifier', 'identifier']);
          if (typeNode) pushRef(typeNode.text, 'new', typeNode);
        }

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
              container,
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
            for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, classSym);
            return;
          }
        }
      }

      for (let i = 0; i < n.childCount; i++) traverse(n.child(i)!, container);
    };

    traverse(node, undefined);
    return { symbols, refs };
  }
}
