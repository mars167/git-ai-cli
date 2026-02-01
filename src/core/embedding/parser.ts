import Parser from 'tree-sitter';
import { TypeScriptAdapter } from '../parser/typescript';

const adapter = new TypeScriptAdapter(false);

export function parseCodeToTree(code: string): Parser.Tree {
  const parser = new Parser();
  parser.setLanguage(adapter.getTreeSitterLanguage());
  return parser.parse(code ?? '');
}
