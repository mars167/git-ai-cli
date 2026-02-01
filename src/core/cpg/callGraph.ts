import Parser from 'tree-sitter';
import path from 'path';
import TypeScript from 'tree-sitter-typescript';
import { CPENode, CPEEdge, EdgeType, GraphLayer, moduleNodeId, createModuleNode, symbolNodeId } from './types';
import { toPosixPath } from '../paths';

export interface CallGraphContext {
  filePath: string;
  lang: string;
  root: Parser.SyntaxNode;
}

export interface FunctionInfo {
  id: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface CallEdge {
  from: string;
  to: string;
  line: number;
}

export interface ImportEdge {
  fromFile: string;
  toFile: string;
  importedSymbols: string[];
}

export interface CallGraph {
  functions: Map<string, FunctionInfo>;
  calls: CallEdge[];
  imports: ImportEdge[];
}

interface FunctionScope {
  id: string;
  name: string;
}

interface ImportBinding {
  modulePath: string;
  importedName: string;
  localName: string;
}

interface SymbolEntry {
  id: string;
  name: string;
  file: string;
  kind: string;
  startLine: number;
  endLine: number;
}

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'function',
  'arrow_function',
  'method_definition',
]);

const EXPORT_TYPES = new Set([
  'export_statement',
  'export_clause',
  'export_specifier',
  'export_default_declaration',
  'export_assignment',
]);

const IMPORT_TYPES = new Set([
  'import_statement',
  'import_clause',
  'import_specifier',
  'namespace_import',
]);

function resolveModulePath(fromFile: string, specifier: string): string {
  if (!specifier) return specifier;
  if (specifier.startsWith('.')) {
    const resolved = path.normalize(path.join(path.dirname(fromFile), specifier));
    return toPosixPath(resolved);
  }
  return specifier;
}

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
          table.set(`${filePosix}:${symbol.name}`, {
            id,
            name: symbol.name,
            file: filePosix,
            kind: symbol.kind,
            startLine: symbol.startLine,
            endLine: symbol.endLine,
          });
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
          table.set(`${filePosix}:${symbol.name}`, {
            id,
            name: symbol.name,
            file: filePosix,
            kind: symbol.kind,
            startLine: symbol.startLine,
            endLine: symbol.endLine,
          });
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

function collectImports(context: CallGraphContext): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (node.type === 'import_statement') {
      const source = node.childForFieldName('source');
      const moduleName = source ? source.text.replace(/['"]/g, '') : '';
      
      let clause = node.childForFieldName('clause') ?? node.childForFieldName('declaration');
      if (!clause) {
        for (let k = 0; k < node.namedChildCount; k++) {
          const c = node.namedChild(k);
          if (c?.type === 'import_clause') {
            clause = c;
            break;
          }
        }
      }

      if (moduleName && clause) {
        for (let i = 0; i < clause.namedChildCount; i++) {
          const child = clause.namedChild(i);
          if (!child) continue;

          if (child.type === 'identifier') {
            bindings.push({ modulePath: moduleName, importedName: 'default', localName: child.text });
          } else if (child.type === 'named_imports') {
            for (let j = 0; j < child.namedChildCount; j++) {
              const spec = child.namedChild(j);
              if (spec?.type === 'import_specifier') {
                const nameNode = spec.childForFieldName('name');
                const aliasNode = spec.childForFieldName('alias');
                const importedName = nameNode?.text ?? '';
                const localName = aliasNode?.text ?? importedName;
                if (localName) bindings.push({ modulePath: moduleName, importedName, localName });
              }
            }
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
  return bindings;
}

function collectCommonJsImports(context: CallGraphContext): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (node.type === 'call_expression') {
      const callee = node.childForFieldName('function') ?? node.namedChild(0);
      if (callee?.type === 'identifier' && callee.text === 'require') {
        const args = node.childForFieldName('arguments');
        const arg = args?.namedChild(0);
        if (arg?.type === 'string') {
          const moduleName = arg.text.replace(/['"]/g, '');
          const parent = node.parent;
          if (parent?.type === 'variable_declarator') {
            const nameNode = parent.childForFieldName('name');
            if (nameNode?.type === 'identifier') {
              bindings.push({ modulePath: moduleName, importedName: 'default', localName: nameNode.text });
            }
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
  return bindings;
}

function collectFunctionScopes(context: CallGraphContext, symbolTable: Map<string, SymbolEntry>): FunctionInfo[] {
  const funcs: FunctionInfo[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const symbol = symbolTable.get(`${toPosixPath(context.filePath)}:${nameNode.text}`);
        const id = symbol?.id ?? symbolNodeId(toPosixPath(context.filePath), {
          name: nameNode.text,
          kind: node.type === 'method_definition' ? 'method' : 'function',
          signature: node.text.split('{')[0].trim(),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
        funcs.push({
          id,
          name: nameNode.text,
          filePath: toPosixPath(context.filePath),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
    }
    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const symbol = symbolTable.get(`${toPosixPath(context.filePath)}:${nameNode.text}`);
        const id = symbol?.id ?? symbolNodeId(toPosixPath(context.filePath), {
          name: nameNode.text,
          kind: 'class',
          signature: `class ${nameNode.text}`,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
        funcs.push({
          id,
          name: nameNode.text,
          filePath: toPosixPath(context.filePath),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(context.root);
  return funcs;
}

function findNearestFunction(node: Parser.SyntaxNode, symbolTable: Map<string, SymbolEntry>, filePath: string): FunctionScope | null {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (FUNCTION_NODE_TYPES.has(current.type)) {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        const symbol = symbolTable.get(`${toPosixPath(filePath)}:${nameNode.text}`);
        const id = symbol?.id ?? symbolNodeId(toPosixPath(filePath), {
          name: nameNode.text,
          kind: current.type === 'method_definition' ? 'method' : 'function',
          signature: current.text.split('{')[0].trim(),
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
        });
        return { id, name: nameNode.text };
      }
    }
    current = current.parent;
  }
  return null;
}

function extractCalleeName(node: Parser.SyntaxNode): string | null {
  if (node.type === 'identifier') return node.text;
  if (node.type === 'member_expression' || node.type === 'optional_chain') {
    const prop = node.childForFieldName('property');
    if (prop) return prop.text;
    const last = node.namedChild(node.namedChildCount - 1);
    if (last) return last.text;
  }
  return null;
}

function resolveCallTarget(
  calleeNode: Parser.SyntaxNode,
  importBindings: ImportBinding[],
  symbolTable: Map<string, SymbolEntry>,
  currentFile: string,
): SymbolEntry | null {
  const filePosix = toPosixPath(currentFile);
  const lookup = (name: string, file?: string) => {
    if (file) {
      let qualified = `${file}:${name}`;
      if (symbolTable.has(qualified)) return symbolTable.get(qualified);

      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.d.ts'];
      for (const ext of extensions) {
        qualified = `${file}${ext}:${name}`;
        if (symbolTable.has(qualified)) return symbolTable.get(qualified);
      }

      for (const ext of extensions) {
        qualified = `${file}/index${ext}:${name}`;
        if (symbolTable.has(qualified)) return symbolTable.get(qualified);
      }
    }
    return undefined;
  };

  if (calleeNode.type === 'identifier') {
    const direct = lookup(calleeNode.text, filePosix);
    if (direct) return direct;
    
    const imported = importBindings.find((binding) => binding.localName === calleeNode.text);
    if (imported) {
      const resolvedModule = resolveModulePath(filePosix, imported.modulePath);
      const resolvedName = imported.importedName === 'default' ? 'default' : (imported.importedName || imported.localName);
      if (imported.importedName === '*') return null;
      return lookup(resolvedName, resolvedModule) ?? null;
    }
  }

  if (calleeNode.type === 'member_expression' || calleeNode.type === 'optional_chain') {
    const objectNode = calleeNode.childForFieldName('object');
    const propNode = calleeNode.childForFieldName('property') ?? calleeNode.namedChild(calleeNode.namedChildCount - 1);
    if (objectNode?.type === 'identifier') {
      const binding = importBindings.find((entry) => entry.localName === objectNode.text);
      if (binding) {
        const resolvedModule = resolveModulePath(filePosix, binding.modulePath);
        const resolved = propNode ? lookup(propNode.text, resolvedModule) : null;
        return resolved ?? null;
      }
    }
  }

  const fallback = extractCalleeName(calleeNode);
  if (fallback) return lookup(fallback, filePosix) ?? null;
  return null;
}

function buildCallGraphLayer(contexts: CallGraphContext[]): { graph: CallGraph; layer: GraphLayer } {
  const nodes: CPENode[] = [];
  const edges: CPEEdge[] = [];
  const edgeTypes = [EdgeType.CALLS, EdgeType.DEFINES];
  const functions = new Map<string, FunctionInfo>();
  const calls: CallEdge[] = [];
  const imports: ImportEdge[] = [];

  const symbolTable = collectSymbolTable(contexts);

  for (const ctx of contexts) {
    const filePosix = toPosixPath(ctx.filePath);
    const moduleId = moduleNodeId(filePosix);
    const importBindings = [...collectImports(ctx), ...collectCommonJsImports(ctx)];
    const importsByModule = new Map<string, Set<string>>();
    for (const binding of importBindings) {
      const resolved = resolveModulePath(filePosix, binding.modulePath);
      const set = importsByModule.get(resolved) ?? new Set<string>();
      set.add(binding.importedName || binding.localName);
      importsByModule.set(resolved, set);
    }
    for (const [toFile, symbols] of importsByModule) {
      imports.push({ fromFile: filePosix, toFile, importedSymbols: Array.from(symbols.values()) });
    }

    const fileFunctions = collectFunctionScopes(ctx, symbolTable);
    for (const fn of fileFunctions) {
      functions.set(fn.id, fn);
      nodes.push({ id: fn.id, kind: 'symbol', label: fn.name, file: fn.filePath, startLine: fn.startLine, endLine: fn.endLine });
    }

    const visit = (node: Parser.SyntaxNode) => {
      if (node.type === 'call_expression') {
        const fnNode = node.childForFieldName('function') ?? node.namedChild(0);
        if (fnNode) {
          const resolved = resolveCallTarget(fnNode, importBindings, symbolTable, ctx.filePath);
          if (resolved) {
            const caller = findNearestFunction(node, symbolTable, ctx.filePath) ?? { id: moduleId, name: filePosix };
            edges.push({ from: caller.id, to: resolved.id, type: EdgeType.CALLS });
            calls.push({ from: caller.id, to: resolved.id, line: node.startPosition.row + 1 });
          }
        }
      }
      if (node.type === 'new_expression') {
        const ctor = node.childForFieldName('constructor') ?? node.namedChild(0);
        if (ctor) {
          const resolved = resolveCallTarget(ctor, importBindings, symbolTable, ctx.filePath);
          if (resolved) {
            const caller = findNearestFunction(node, symbolTable, ctx.filePath) ?? { id: moduleId, name: filePosix };
            edges.push({ from: caller.id, to: resolved.id, type: EdgeType.CALLS });
            calls.push({ from: caller.id, to: resolved.id, line: node.startPosition.row + 1 });
          }
        }
      }
      if (EXPORT_TYPES.has(node.type)) {
        const decl = node.childForFieldName('declaration');
        const nameNode = decl?.childForFieldName('name');
        if (nameNode) {
          const symbol = symbolTable.get(nameNode.text);
          if (symbol) edges.push({ from: moduleId, to: symbol.id, type: EdgeType.DEFINES });
        }
      }
      if (node.type === 'class_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const symbol = symbolTable.get(nameNode.text);
          if (symbol) edges.push({ from: moduleId, to: symbol.id, type: EdgeType.DEFINES });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };
    visit(ctx.root);

    nodes.push(createModuleNode(filePosix));
  }

  const graph: CallGraph = { functions, calls, imports };
  const layer: GraphLayer = { nodes, edges, edgeTypes };
  return { graph, layer };
}

export function buildCallGraph(contexts: CallGraphContext[]): GraphLayer {
  return buildCallGraphLayer(contexts).layer;
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

export class CallGraphBuilder {
  private contexts: CallGraphContext[] = [];
  private graph: CallGraph | null = null;

  constructor(private repoRoot: string) {}

  addFile(filePath: string, content: string): void {
    const parser = new Parser();
    parser.setLanguage(TypeScript.typescript);
    const tree = parser.parse(content);
    const filePosix = toPosixPath(path.isAbsolute(filePath) ? filePath : path.join(this.repoRoot, filePath));
    this.contexts.push({ filePath: filePosix, lang: 'typescript', root: tree.rootNode });
  }

  build(): CallGraph {
    if (!this.graph) {
      this.graph = buildCallGraphLayer(this.contexts).graph;
    }
    return this.graph;
  }

  getCallees(functionId: string): string[] {
    const graph = this.build();
    const callees = new Set<string>();
    for (const call of graph.calls) {
      if (call.from === functionId) callees.add(call.to);
    }
    return Array.from(callees);
  }

  getCallers(functionId: string): string[] {
    const graph = this.build();
    const callers = new Set<string>();
    for (const call of graph.calls) {
      if (call.to === functionId) callers.add(call.from);
    }
    return Array.from(callers);
  }
}
