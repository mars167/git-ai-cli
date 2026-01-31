import Parser from 'tree-sitter';
import path from 'path';
import { CPENode, CPEEdge, EdgeType, GraphLayer, moduleNodeId, createModuleNode, symbolNodeId } from './types';
import { toPosixPath } from '../paths';

export interface CallGraphContext {
  filePath: string;
  lang: string;
  root: Parser.SyntaxNode;
}

interface SymbolEntry {
  id: string;
  name: string;
  file: string;
  kind: string;
}

const EXPORT_TYPES = new Set([
  'export_statement',
  'export_clause',
  'export_specifier',
  'export_default_declaration',
]);

const IMPORT_TYPES = new Set([
  'import_statement',
  'import_clause',
  'import_specifier',
  'namespace_import',
]);

function collectSymbolTable(contexts: CallGraphContext[]): Map<string, SymbolEntry> {
  const table = new Map<string, SymbolEntry>();
  for (const ctx of contexts) {
    const filePosix = toPosixPath(ctx.filePath);
    const visit = (node: Parser.SyntaxNode) => {
      if (node.type === 'function_declaration' || node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const symbol = {
            name: nameNode.text,
            kind: node.type === 'method_definition' ? 'method' : 'function',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: node.text.split('{')[0].trim(),
          };
          const id = symbolNodeId(filePosix, symbol);
          table.set(symbol.name, { id, name: symbol.name, file: filePosix, kind: symbol.kind });
        }
      }
      if (node.type === 'class_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const symbol = {
            name: nameNode.text,
            kind: 'class',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `class ${nameNode.text}`,
          };
          const id = symbolNodeId(filePosix, symbol);
          table.set(symbol.name, { id, name: symbol.name, file: filePosix, kind: symbol.kind });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };
    visit(ctx.root);
  }
  return table;
}

function collectImportMap(context: CallGraphContext): Map<string, string> {
  const imports = new Map<string, string>();
  const visit = (node: Parser.SyntaxNode) => {
    if (node.type === 'import_statement') {
      const source = node.childForFieldName('source');
      const moduleName = source ? source.text.replace(/['"]/g, '') : '';
      const clause = node.childForFieldName('clause');
      if (clause) {
        for (let i = 0; i < clause.namedChildCount; i++) {
          const child = clause.namedChild(i);
          if (!child) continue;
          if (child.type === 'import_specifier') {
            const nameNode = child.childForFieldName('name');
            const aliasNode = child.childForFieldName('alias');
            const name = aliasNode?.text ?? nameNode?.text;
            if (name) imports.set(name, moduleName);
          } else if (child.type === 'identifier') {
            imports.set(child.text, moduleName);
          } else if (child.type === 'namespace_import') {
            const nameNode = child.childForFieldName('name');
            if (nameNode) imports.set(nameNode.text, moduleName);
          }
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(context.root);
  return imports;
}

function resolveModulePath(fromFile: string, specifier: string): string {
  if (!specifier) return specifier;
  if (specifier.startsWith('.')) {
    const resolved = path.normalize(path.join(path.dirname(fromFile), specifier));
    return toPosixPath(resolved);
  }
  return specifier;
}

export function buildCallGraph(contexts: CallGraphContext[]): GraphLayer {
  const nodes: CPENode[] = [];
  const edges: CPEEdge[] = [];
  const edgeTypes = [EdgeType.CALLS, EdgeType.DEFINES];

  const symbolTable = collectSymbolTable(contexts);

  for (const ctx of contexts) {
    const importMap = collectImportMap(ctx);
    const visit = (node: Parser.SyntaxNode) => {
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function') ?? node.namedChild(0);
        if (fn && fn.type === 'identifier') {
          const target = symbolTable.get(fn.text);
          if (target) {
            const callerId = moduleNodeId(toPosixPath(ctx.filePath));
            const calleeId = target.id;
            edges.push({ from: callerId, to: calleeId, type: EdgeType.CALLS });
          }
        }
      }
      if (node.type === 'export_statement' || node.type === 'export_default_declaration') {
        const decl = node.childForFieldName('declaration');
        const nameNode = decl?.childForFieldName('name');
        if (nameNode) {
          const symbol = symbolTable.get(nameNode.text);
          if (symbol) {
            const moduleId = moduleNodeId(toPosixPath(ctx.filePath));
            edges.push({ from: moduleId, to: symbol.id, type: EdgeType.DEFINES });
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };

    visit(ctx.root);

    nodes.push(createModuleNode(toPosixPath(ctx.filePath)));
    for (const [, moduleName] of importMap) {
      if (!moduleName) continue;
      nodes.push(createModuleNode(resolveModulePath(ctx.filePath, moduleName)));
    }
  }

  return { nodes, edges, edgeTypes };
}

export function buildImportGraph(contexts: CallGraphContext[]): GraphLayer {
  const nodes: CPENode[] = [];
  const edges: CPEEdge[] = [];
  const edgeTypes = [EdgeType.IMPORTS, EdgeType.INHERITS, EdgeType.IMPLEMENTS];

  const symbolTable = collectSymbolTable(contexts);

  for (const ctx of contexts) {
    const filePosix = toPosixPath(ctx.filePath);
    const fileNode = createModuleNode(filePosix);
    nodes.push(fileNode);

    const visit = (node: Parser.SyntaxNode) => {
      if (IMPORT_TYPES.has(node.type) && node.type === 'import_statement') {
        const source = node.childForFieldName('source');
        const moduleName = source ? source.text.replace(/['"]/g, '') : '';
        if (moduleName) {
          const resolved = resolveModulePath(ctx.filePath, moduleName);
          nodes.push(createModuleNode(resolved));
          edges.push({ from: fileNode.id, to: moduleNodeId(resolved), type: EdgeType.IMPORTS });
        }
      }

      if (node.type === 'class_declaration') {
        const extendsNode = node.childForFieldName('superclass');
        if (extendsNode) {
          const target = symbolTable.get(extendsNode.text);
          if (target) edges.push({ from: fileNode.id, to: target.id, type: EdgeType.INHERITS });
        }
        const implNode = node.childForFieldName('interfaces');
        if (implNode) {
          for (let i = 0; i < implNode.namedChildCount; i++) {
            const iface = implNode.namedChild(i);
            if (!iface) continue;
            const target = symbolTable.get(iface.text);
            if (target) edges.push({ from: fileNode.id, to: target.id, type: EdgeType.IMPLEMENTS });
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };

    visit(ctx.root);
  }

  return { nodes, edges, edgeTypes };
}
