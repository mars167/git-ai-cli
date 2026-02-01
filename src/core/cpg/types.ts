import Parser from 'tree-sitter';
import { sha256Hex } from '../crypto';
import { toPosixPath } from '../paths';

export enum EdgeType {
  CHILD = 'CHILD',
  NEXT_TOKEN = 'NEXT_TOKEN',
  NEXT_STATEMENT = 'NEXT_STATEMENT',
  TRUE_BRANCH = 'TRUE_BRANCH',
  FALSE_BRANCH = 'FALSE_BRANCH',
  FALLTHROUGH = 'FALLTHROUGH',
  COMPUTED_FROM = 'COMPUTED_FROM',
  DEFINED_BY = 'DEFINED_BY',
  CALLS = 'CALLS',
  DEFINES = 'DEFINES',
  IMPORTS = 'IMPORTS',
  INHERITS = 'INHERITS',
  IMPLEMENTS = 'IMPLEMENTS',
}

export type CpgLayerName = 'ast' | 'cfg' | 'dfg' | 'callGraph' | 'importGraph';

export interface CPENode {
  id: string;
  kind: string;
  label?: string;
  file?: string;
  lang?: string;
  startLine?: number;
  endLine?: number;
  startCol?: number;
  endCol?: number;
}

export interface CPEEdge {
  from: string;
  to: string;
  type: EdgeType;
}

export interface GraphLayer {
  nodes: CPENode[];
  edges: CPEEdge[];
  edgeTypes: EdgeType[];
}

export interface CodePropertyGraph {
  ast: GraphLayer;
  cfg: GraphLayer;
  dfg: GraphLayer;
  callGraph: GraphLayer;
  importGraph: GraphLayer;
}

export interface CpgGraphData {
  nodes: Array<[string, string, string, string, string, number, number, number, number]>;
  edges: Array<[string, string, string, string]>;
}

export interface SymbolDescriptor {
  name: string;
  kind: string;
  signature: string;
  startLine: number;
  endLine: number;
}

export function fileNodeId(filePath: string): string {
  const filePosix = toPosixPath(filePath);
  return sha256Hex(`file:${filePosix}`);
}

export function moduleNodeId(name: string): string {
  return sha256Hex(`module:${name}`);
}

export function astNodeId(filePath: string, node: Parser.SyntaxNode): string {
  const filePosix = toPosixPath(filePath);
  const start = `${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
  const end = `${node.endPosition.row + 1}:${node.endPosition.column + 1}`;
  return sha256Hex(`cpg:${filePosix}:${node.type}:${start}:${end}`);
}

export function buildSymbolChunkText(filePath: string, symbol: { name: string; kind: string; signature: string }): string {
  const filePosix = toPosixPath(filePath);
  return `file:${filePosix}\nkind:${symbol.kind}\nname:${symbol.name}\nsignature:${symbol.signature}`;
}

export function symbolNodeId(filePath: string, symbol: SymbolDescriptor): string {
  const filePosix = toPosixPath(filePath);
  const chunk = buildSymbolChunkText(filePosix, symbol);
  const contentHash = sha256Hex(chunk);
  return sha256Hex(`${filePosix}:${symbol.name}:${symbol.kind}:${symbol.startLine}:${symbol.endLine}:${contentHash}`);
}

export function createFileNode(filePath: string, lang: string): CPENode {
  const filePosix = toPosixPath(filePath);
  return {
    id: fileNodeId(filePosix),
    kind: 'file',
    label: filePosix,
    file: filePosix,
    lang,
    startLine: 0,
    endLine: 0,
    startCol: 0,
    endCol: 0,
  };
}

export function createModuleNode(name: string): CPENode {
  return {
    id: moduleNodeId(name),
    kind: 'module',
    label: name,
    file: '',
    lang: '',
    startLine: 0,
    endLine: 0,
    startCol: 0,
    endCol: 0,
  };
}

export function createAstNode(filePath: string, lang: string, node: Parser.SyntaxNode): CPENode {
  const filePosix = toPosixPath(filePath);
  return {
    id: astNodeId(filePosix, node),
    kind: 'ast',
    label: node.type,
    file: filePosix,
    lang,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startCol: node.startPosition.column + 1,
    endCol: node.endPosition.column + 1,
  };
}

export function createSymbolNode(filePath: string, lang: string, symbol: SymbolDescriptor): CPENode {
  const filePosix = toPosixPath(filePath);
  return {
    id: symbolNodeId(filePosix, symbol),
    kind: 'symbol',
    label: symbol.name,
    file: filePosix,
    lang,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    startCol: 0,
    endCol: 0,
  };
}
