import Parser from 'tree-sitter';
import { CPEEdge, EdgeType, GraphLayer, astNodeId } from './types';

const ASSIGNMENT_TYPES = new Set([
  'assignment_expression',
  'augmented_assignment_expression',
  'variable_declarator',
]);

const IDENTIFIER_TYPES = new Set(['identifier', 'property_identifier']);

function collectIdentifiers(node: Parser.SyntaxNode, out: Parser.SyntaxNode[]): void {
  if (IDENTIFIER_TYPES.has(node.type)) {
    out.push(node);
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectIdentifiers(child, out);
  }
}

function findAssignments(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const nodes: Parser.SyntaxNode[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (ASSIGNMENT_TYPES.has(node.type)) nodes.push(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
  return nodes;
}

export function buildDfgLayer(filePath: string, root: Parser.SyntaxNode): GraphLayer {
  const edges: CPEEdge[] = [];
  const edgeTypes = [EdgeType.COMPUTED_FROM, EdgeType.DEFINED_BY];

  const assignments = findAssignments(root);
  for (const assignment of assignments) {
    const left = assignment.childForFieldName('left') ?? assignment.childForFieldName('name');
    const right = assignment.childForFieldName('right') ?? assignment.childForFieldName('value');
    if (!left) continue;

    const defs: Parser.SyntaxNode[] = [];
    collectIdentifiers(left, defs);

    if (right) {
      const uses: Parser.SyntaxNode[] = [];
      collectIdentifiers(right, uses);

      for (const def of defs) {
        for (const use of uses) {
          edges.push({ from: astNodeId(filePath, use), to: astNodeId(filePath, def), type: EdgeType.COMPUTED_FROM });
        }
      }
    }

    const nameNode = left.type === 'identifier' ? left : left.namedChild(0);
    if (nameNode && nameNode.type === 'identifier') {
      edges.push({ from: astNodeId(filePath, nameNode), to: astNodeId(filePath, assignment), type: EdgeType.DEFINED_BY });
    }
  }

  return { nodes: [], edges, edgeTypes };
}
