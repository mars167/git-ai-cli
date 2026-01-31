import Parser from 'tree-sitter';
import { CPEEdge, EdgeType, GraphLayer, astNodeId } from './types';

const CFG_STATEMENT_TYPES = new Set([
  'expression_statement',
  'return_statement',
  'variable_declaration',
  'lexical_declaration',
  'if_statement',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'switch_statement',
  'break_statement',
  'continue_statement',
  'throw_statement',
  'try_statement',
  'block',
]);

const CONDITION_TYPES = new Set(['if_statement', 'while_statement', 'for_statement', 'for_in_statement', 'for_of_statement', 'do_statement']);

const BRANCH_NODE_TYPES = new Set(['if_statement', 'conditional_expression']);

interface StatementNode {
  node: Parser.SyntaxNode;
  id: string;
}

function flattenStatements(root: Parser.SyntaxNode, filePath: string): StatementNode[] {
  const statements: StatementNode[] = [];

  const visitBlock = (node: Parser.SyntaxNode) => {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (!child) continue;
      if (CFG_STATEMENT_TYPES.has(child.type) || child.isNamed) {
        statements.push({ node: child, id: astNodeId(filePath, child) });
      }
      if (child.type === 'block') {
        visitBlock(child);
      }
    }
  };

  if (root.type === 'program') {
    visitBlock(root);
  } else {
    visitBlock(root);
  }

  return statements;
}

export function buildCfgLayer(filePath: string, root: Parser.SyntaxNode): GraphLayer {
  const edges: CPEEdge[] = [];
  const edgeTypes = [EdgeType.NEXT_STATEMENT, EdgeType.TRUE_BRANCH, EdgeType.FALSE_BRANCH];
  const statements = flattenStatements(root, filePath);

  for (let i = 0; i < statements.length - 1; i++) {
    const current = statements[i]!;
    const next = statements[i + 1]!;
    if (current.id !== next.id) {
      edges.push({ from: current.id, to: next.id, type: EdgeType.NEXT_STATEMENT });
    }

    if (BRANCH_NODE_TYPES.has(current.node.type)) {
      const consequent = current.node.childForFieldName('consequence') ?? current.node.childForFieldName('body');
      const alternate = current.node.childForFieldName('alternative');
      if (consequent) {
        edges.push({ from: current.id, to: astNodeId(filePath, consequent), type: EdgeType.TRUE_BRANCH });
      }
      if (alternate) {
        edges.push({ from: current.id, to: astNodeId(filePath, alternate), type: EdgeType.FALSE_BRANCH });
      }
    }
  }

  for (const stmt of statements) {
    if (CONDITION_TYPES.has(stmt.node.type)) {
      const body = stmt.node.childForFieldName('body');
      if (body) {
        edges.push({ from: stmt.id, to: astNodeId(filePath, body), type: EdgeType.TRUE_BRANCH });
      }
    }
  }

  return { nodes: [], edges, edgeTypes };
}
