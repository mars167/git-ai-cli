import Parser from 'tree-sitter';
import { AstRefKind, AstReference } from '../types';

export const pushRef = (refs: AstReference[], name: string, refKind: AstRefKind, n: Parser.SyntaxNode) => {
  const nm = String(name ?? '').trim();
  if (!nm) return;
  refs.push({
    name: nm,
    refKind,
    line: n.startPosition.row + 1,
    column: n.startPosition.column + 1,
  });
};

export const findFirstByType = (n: Parser.SyntaxNode, types: string[]): Parser.SyntaxNode | null => {
  if (types.includes(n.type)) return n;
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (!c) continue;
    const found = findFirstByType(c, types);
    if (found) return found;
  }
  return null;
};

export const parseHeritage = (head: string): { extends?: string[]; implements?: string[] } => {
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
