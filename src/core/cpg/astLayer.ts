import Parser from 'tree-sitter';
import { CPENode, CPEEdge, EdgeType, GraphLayer, astNodeId, createAstNode } from './types';

interface AstLayerOptions {
  includeNextToken?: boolean;
}

export function buildAstLayer(filePath: string, lang: string, root: Parser.SyntaxNode, options?: AstLayerOptions): GraphLayer {
  const nodes: CPENode[] = [];
  const edges: CPEEdge[] = [];
  const edgeTypes = [EdgeType.CHILD, EdgeType.NEXT_TOKEN];
  const includeNextToken = options?.includeNextToken ?? true;
  const visited = new Set<string>();

  const pushNode = (node: Parser.SyntaxNode) => {
    const id = astNodeId(filePath, node);
    if (visited.has(id)) return id;
    visited.add(id);
    nodes.push(createAstNode(filePath, lang, node));
    return id;
  };

  const traverse = (node: Parser.SyntaxNode) => {
    const parentId = pushNode(node);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) continue;
      const childId = pushNode(child);
      edges.push({ from: parentId, to: childId, type: EdgeType.CHILD });
      traverse(child);
    }
  };

  const linkNextTokens = () => {
    const tokens: Parser.SyntaxNode[] = [];
    const walk = (node: Parser.SyntaxNode) => {
      if (node.childCount === 0) {
        tokens.push(node);
        return;
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(root);
    for (let i = 0; i < tokens.length - 1; i++) {
      const fromId = astNodeId(filePath, tokens[i]!);
      const toId = astNodeId(filePath, tokens[i + 1]!);
      if (fromId === toId) continue;
      edges.push({ from: fromId, to: toId, type: EdgeType.NEXT_TOKEN });
    }
  };

  traverse(root);
  if (includeNextToken) linkNextTokens();

  return { nodes, edges, edgeTypes };
}
