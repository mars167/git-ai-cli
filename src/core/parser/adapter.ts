import Parser from 'tree-sitter';
import { ParseResult } from '../types';

export interface LanguageAdapter {
  getLanguageId(): string;
  getTreeSitterLanguage(): any;
  getSupportedFileExtensions(): string[];
  extractSymbolsAndRefs(node: Parser.SyntaxNode): ParseResult;
}
