import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { CPENode, CPEEdge, EdgeType, GraphLayer, astNodeId } from './types';

interface VarDef {
  id: string;
  name: string;
  node: Parser.SyntaxNode;
}

interface VarUse {
  id: string;
  name: string;
  node: Parser.SyntaxNode;
}

const IDENTIFIER_TYPES = new Set(['identifier', 'property_identifier']);

const ASSIGNMENT_TYPES = new Set([
  'assignment_expression',
  'augmented_assignment_expression',
  'variable_declarator',
]);

const ASSIGNMENT_OPERATORS = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '||=',
  '&&=',
  '??=',
  '|=',
  '&=',
  '^=',
  '<<=',
  '>>=',
  '>>>=',
]);

function isIdentifier(node: Parser.SyntaxNode): boolean {
  return IDENTIFIER_TYPES.has(node.type) || node.type === 'shorthand_property_identifier';
}

function collectIdentifiers(node: Parser.SyntaxNode, out: Parser.SyntaxNode[]): void {
  if (isIdentifier(node)) out.push(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectIdentifiers(child, out);
  }
}

function collectPatternIdentifiers(node: Parser.SyntaxNode, out: Parser.SyntaxNode[]): void {
  if (isIdentifier(node)) {
    out.push(node);
    return;
  }
  if (node.type === 'shorthand_property_identifier') {
    out.push(node);
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    collectPatternIdentifiers(child, out);
  }
}

function collectAssignments(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const nodes: Parser.SyntaxNode[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (ASSIGNMENT_TYPES.has(node.type)) nodes.push(node);
    if (node.type === 'formal_parameters') nodes.push(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
  return nodes;
}

function getAssignmentOperator(node: Parser.SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (ASSIGNMENT_OPERATORS.has(child.type)) return child.type;
  }
  return null;
}

function isCompoundAssignment(node: Parser.SyntaxNode): boolean {
  if (node.type === 'augmented_assignment_expression') return true;
  if (node.type !== 'assignment_expression') return false;
  const op = getAssignmentOperator(node);
  return op !== null && op !== '=';
}

function extractDefinitions(node: Parser.SyntaxNode, filePath: string): VarDef[] {
  const defs: VarDef[] = [];
  if (node.type === 'formal_parameters') {
    for (let i = 0; i < node.namedChildCount; i++) {
      const param = node.namedChild(i);
      if (!param) continue;
      const ids: Parser.SyntaxNode[] = [];
      const paramNode = param.childForFieldName('name') ?? param;
      collectPatternIdentifiers(paramNode, ids);
      for (const id of ids) {
        defs.push({ id: astNodeId(filePath, id), name: id.text, node: id });
      }
    }
    return defs;
  }

  const left = node.childForFieldName('left') ?? node.childForFieldName('name');
  if (!left) return defs;
  const ids: Parser.SyntaxNode[] = [];
  collectPatternIdentifiers(left, ids);
  for (const id of ids) {
    defs.push({ id: astNodeId(filePath, id), name: id.text, node: id });
  }
  return defs;
}

function extractUses(node: Parser.SyntaxNode, filePath: string): VarUse[] {
  const uses: VarUse[] = [];
  if (node.type === 'formal_parameters') return uses;
  const assignmentLeft = node.childForFieldName('left') ?? node.childForFieldName('name');
  const right = node.childForFieldName('right') ?? node.childForFieldName('value');
  if (!right) {
    if (isCompoundAssignment(node) && assignmentLeft) {
      const leftIds: Parser.SyntaxNode[] = [];
      collectIdentifiers(assignmentLeft, leftIds);
      for (const id of leftIds) {
        uses.push({ id: astNodeId(filePath, id), name: id.text, node: id });
      }
    }
    return uses;
  }
  const ids: Parser.SyntaxNode[] = [];
  collectIdentifiers(right, ids);
  for (const id of ids) {
    if (assignmentLeft && id.startIndex >= assignmentLeft.startIndex && id.endIndex <= assignmentLeft.endIndex) {
      continue;
    }
    uses.push({ id: astNodeId(filePath, id), name: id.text, node: id });
  }

  if (isCompoundAssignment(node) && assignmentLeft) {
    const leftIds: Parser.SyntaxNode[] = [];
    collectIdentifiers(assignmentLeft, leftIds);
    for (const id of leftIds) {
      uses.push({ id: astNodeId(filePath, id), name: id.text, node: id });
    }
  }
  return uses;
}

function addDefinedByEdges(edges: CPEEdge[], filePath: string, defs: VarDef[], assignmentNode: Parser.SyntaxNode): void {
  const assignmentId = astNodeId(filePath, assignmentNode);
  for (const def of defs) {
    edges.push({ from: def.id, to: assignmentId, type: EdgeType.DEFINED_BY });
  }
}

function buildDfgInternal(filePath: string, root: Parser.SyntaxNode): {
  nodes: CPENode[];
  edges: CPEEdge[];
} {
  const edges: CPEEdge[] = [];
  const nodes: CPENode[] = [];
  const seenNodes = new Set<string>();

  const assignments = collectAssignments(root);
  for (const assignment of assignments) {
    const defs = extractDefinitions(assignment, filePath);
    const uses = extractUses(assignment, filePath);

    for (const def of defs) {
      if (!seenNodes.has(def.id)) {
        nodes.push({
          id: def.id,
          kind: 'dfg',
          label: def.name,
          startLine: def.node.startPosition.row + 1,
          endLine: def.node.endPosition.row + 1,
        });
        seenNodes.add(def.id);
      }
      for (const use of uses) {
        if (!seenNodes.has(use.id)) {
          nodes.push({
            id: use.id,
            kind: 'dfg',
            label: use.name,
            startLine: use.node.startPosition.row + 1,
            endLine: use.node.endPosition.row + 1,
          });
          seenNodes.add(use.id);
        }
        edges.push({ from: use.id, to: def.id, type: EdgeType.COMPUTED_FROM });
      }
    }

    if (defs.length > 0) {
      addDefinedByEdges(edges, filePath, defs, assignment);
    }
  }

  return { nodes, edges };
}

export function buildDfgLayer(filePath: string, root: Parser.SyntaxNode): GraphLayer {
  const edgeTypes = [EdgeType.COMPUTED_FROM, EdgeType.DEFINED_BY];
  const internal = buildDfgInternal(filePath, root);
  return { nodes: internal.nodes, edges: internal.edges, edgeTypes };
}

export interface DFGEdge {
  from: string;
  to: string;
  varName: string;
}

export interface DFGNode {
  id: string;
  varName: string;
  defLine: number;
  useLines: number[];
}

export interface DFGResult {
  nodes: DFGNode[];
  edges: DFGEdge[];
}

export function buildDFG(filePath: string, content: string): DFGResult {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(content);
  const root = tree.rootNode;
  const nodeMap = new Map<string, DFGNode>();
  const edges: DFGEdge[] = [];

  const assignments = collectAssignments(root);
  for (const assignment of assignments) {
    const defs = extractDefinitions(assignment, filePath);
    const uses = extractUses(assignment, filePath);

    for (const def of defs) {
      let defNode = nodeMap.get(def.id);
      if (!defNode) {
        defNode = {
          id: def.id,
          varName: def.name,
          defLine: def.node.startPosition.row + 1,
          useLines: [],
        };
        nodeMap.set(def.id, defNode);
      }

      for (const use of uses) {
        edges.push({ from: def.id, to: use.id, varName: def.name });
        const useLine = use.node.startPosition.row + 1;
        if (!defNode.useLines.includes(useLine)) {
          defNode.useLines.push(useLine);
        }
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}
