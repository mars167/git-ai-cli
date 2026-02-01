import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { CPENode, CPEEdge, EdgeType, GraphLayer, astNodeId } from './types';

// CFG builder helpers

export interface CFGEdge {
  from: string;
  to: string;
  edgeType: 'TRUE_BRANCH' | 'FALSE_BRANCH' | 'NEXT_STATEMENT' | 'FALLTHROUGH';
}

export interface CFGNode {
  id: string;
  stmtType: string;
  startLine: number;
  endLine: number;
}

export interface CFGResult {
  nodes: CFGNode[];
  edges: CFGEdge[];
  entryPoint: string;
  exitPoints: string[];
}

interface BlockBuildResult {
  entryId: string | null;
  exits: string[];
}

interface LoopContext {
  continueTarget: string | null;
  breakTargets: string[];
}

const SIMPLE_STATEMENT_TYPES = new Set([
  'expression_statement',
  'variable_declaration',
  'lexical_declaration',
  'empty_statement',
  'debugger_statement',
]);

const LOOP_TYPES = new Set([
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
]);

const CONDITIONAL_TYPES = new Set(['if_statement', 'conditional_expression']);
const SHORT_CIRCUIT_TYPES = new Set(['logical_expression', 'conditional_expression']);
const FUNCTION_TYPES = new Set(['function_declaration', 'function', 'arrow_function', 'method_definition']);

function isStatementNode(node: Parser.SyntaxNode): boolean {
  if (node.type === 'statement_block') return true;
  if (node.type === 'block') return true;
  if (node.type.endsWith('_statement')) return true;
  if (node.type.endsWith('_declaration')) return true;
  if (CONDITIONAL_TYPES.has(node.type)) return true;
  if (SHORT_CIRCUIT_TYPES.has(node.type)) return true;
  if (LOOP_TYPES.has(node.type)) return true;
  if (node.type === 'switch_statement' || node.type === 'try_statement') return true;
  if (node.type === 'switch_case' || node.type === 'switch_default') return true;
  if (node.type === 'variable_declaration' || node.type === 'lexical_declaration') return true;
  return false;
}

function emitEdge(edges: CPEEdge[], from: string | null, to: string | null, type: EdgeType): void {
  if (!from || !to) return;
  if (from === to && type !== EdgeType.TRUE_BRANCH && type !== EdgeType.FALSE_BRANCH) return;
  edges.push({ from, to, type });
}

function collectNamedChildren(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const out: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) out.push(child);
  }
  return out;
}

// helper inlined to avoid unused warning


function buildBlock(nodes: Parser.SyntaxNode[], filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  let entryId: string | null = null;
  let exits: string[] = [];

  for (const stmt of nodes) {
    if (!isStatementNode(stmt)) {
      if (stmt.type === 'expression_statement' || stmt.type === 'return_statement') {
        const exprEdges = buildExpressionEdges(stmt, filePath, edges, loop);
        if (exprEdges.entryId) {
          if (!entryId) entryId = exprEdges.entryId;
          for (const exit of exits) {
            emitEdge(edges, exit, exprEdges.entryId, EdgeType.NEXT_STATEMENT);
          }
          exits = exprEdges.exits;
        }
      }
      continue;
    }
    const result = buildStatement(stmt, filePath, edges, loop);
    if (!result.entryId) continue;
    if (!entryId) entryId = result.entryId;
    for (const exit of exits) {
      emitEdge(edges, exit, result.entryId, EdgeType.NEXT_STATEMENT);
    }
    exits = result.exits;
  }

  return { entryId, exits };
}

function buildSimple(node: Parser.SyntaxNode, filePath: string): BlockBuildResult {
  const id = astNodeId(filePath, node);
  return { entryId: id, exits: [id] };
}

function buildReturn(node: Parser.SyntaxNode, filePath: string): BlockBuildResult {
  const id = astNodeId(filePath, node);
  return { entryId: id, exits: [] };
}

function buildThrow(node: Parser.SyntaxNode, filePath: string): BlockBuildResult {
  const id = astNodeId(filePath, node);
  return { entryId: id, exits: [] };
}

function buildBreak(node: Parser.SyntaxNode, filePath: string, loop?: LoopContext): BlockBuildResult {
  const id = astNodeId(filePath, node);
  if (loop) loop.breakTargets.push(id);
  return { entryId: id, exits: [] };
}

function buildContinue(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  const id = astNodeId(filePath, node);
  if (loop?.continueTarget) {
    emitEdge(edges, id, loop.continueTarget, EdgeType.NEXT_STATEMENT);
  }
  return { entryId: id, exits: [] };
}

function buildIf(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const consequence = node.childForFieldName('consequence') ?? node.childForFieldName('body');
  const alternate = node.childForFieldName('alternative');

  let trueResult: BlockBuildResult | null = null;
  let falseResult: BlockBuildResult | null = null;

  if (consequence) {
    const block = consequence.type === 'block' ? collectNamedChildren(consequence) : [consequence];
    trueResult = buildBlock(block, filePath, edges, loop);
    emitEdge(edges, id, trueResult.entryId, EdgeType.TRUE_BRANCH);
  }

  if (alternate) {
    const altBody = alternate.type === 'else_clause' ? alternate.namedChild(0) : alternate;
    if (altBody) {
      const block = altBody.type === 'block' ? collectNamedChildren(altBody) : [altBody];
      falseResult = buildBlock(block, filePath, edges, loop);
      emitEdge(edges, id, falseResult.entryId, EdgeType.FALSE_BRANCH);
    }
  } else {
    // explicit false branch to allow branch detection in CFG
    emitEdge(edges, id, id, EdgeType.FALSE_BRANCH);
  }

  const exits: string[] = [];
  if (trueResult) exits.push(...trueResult.exits);
  if (falseResult) exits.push(...falseResult.exits);
  if (!alternate) exits.push(id);

  return { entryId: id, exits };
}

function buildConditionalExpression(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const consequence = node.childForFieldName('consequence');
  const alternate = node.childForFieldName('alternative');
  if (consequence) emitEdge(edges, id, astNodeId(filePath, consequence), EdgeType.TRUE_BRANCH);
  if (alternate) emitEdge(edges, id, astNodeId(filePath, alternate), EdgeType.FALSE_BRANCH);
  return { entryId: id, exits: [id] };
}

function buildFunctionBody(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): void {
  const body = node.childForFieldName('body');
  if (!body) return;
  const block = body.type === 'block' ? collectNamedChildren(body) : [body];
  buildBlock(block, filePath, edges, undefined);
}

function buildClassBodies(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): void {
  const body = node.childForFieldName('body');
  if (!body) return;
  for (let i = 0; i < body.namedChildCount; i++) {
    const child = body.namedChild(i);
    if (!child) continue;
    if (child.type === 'method_definition') buildFunctionBody(child, filePath, edges);
  }
}

function buildDeclaratorBodies(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const declarator = node.namedChild(i);
    if (!declarator || declarator.type !== 'variable_declarator') continue;
    const value = declarator.childForFieldName('value');
    if (!value) continue;
    if (FUNCTION_TYPES.has(value.type)) buildFunctionBody(value, filePath, edges);
  }
}

function buildLoop(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const body = node.childForFieldName('body') ?? node.childForFieldName('consequence');
  const loopCtx: LoopContext = {
    continueTarget: id,
    breakTargets: [],
  };

  let bodyResult: BlockBuildResult | null = null;
  if (body) {
    const block = body.type === 'block' ? collectNamedChildren(body) : [body];
    bodyResult = buildBlock(block, filePath, edges, loopCtx);
    emitEdge(edges, id, bodyResult.entryId, EdgeType.TRUE_BRANCH);
    for (const exit of bodyResult.exits) {
      emitEdge(edges, exit, id, EdgeType.NEXT_STATEMENT);
    }
  }

  const exits = [...loopCtx.breakTargets, ...(loop ? [] : [id])];
  return { entryId: id, exits };
}

function buildDoWhile(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const body = node.childForFieldName('body');
  const loopCtx: LoopContext = {
    continueTarget: id,
    breakTargets: [],
  };

  let bodyResult: BlockBuildResult | null = null;
  if (body) {
    const block = body.type === 'block' ? collectNamedChildren(body) : [body];
    bodyResult = buildBlock(block, filePath, edges, loopCtx);
    emitEdge(edges, id, bodyResult.entryId, EdgeType.TRUE_BRANCH);
    for (const exit of bodyResult.exits) {
      emitEdge(edges, exit, id, EdgeType.NEXT_STATEMENT);
    }
  }

  const exits = [...loopCtx.breakTargets, ...(loop ? [] : [id])];
  return { entryId: id, exits };
}

function buildSwitch(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const body = node.childForFieldName('body');
  const caseNodes = body ? collectNamedChildren(body) : [];

  let hasDefault = false;
  const exits: string[] = [];
  const breakTargets: string[] = [];
  let previousCaseExit: string | null = null;

  for (const caseNode of caseNodes) {
    if (caseNode.type !== 'switch_case' && caseNode.type !== 'switch_default') continue;
    if (caseNode.type === 'switch_default') hasDefault = true;
    const statements = collectNamedChildren(caseNode).filter(isStatementNode);
    const caseEntry = statements[0] ?? caseNode;
    const caseEntryId = astNodeId(filePath, caseEntry);
    const caseResult = buildBlock(statements, filePath, edges, { continueTarget: null, breakTargets });
    emitEdge(edges, id, caseResult.entryId ?? caseEntryId, EdgeType.TRUE_BRANCH);
    if (previousCaseExit) emitEdge(edges, previousCaseExit, caseResult.entryId ?? caseEntryId, EdgeType.FALLTHROUGH);
    previousCaseExit = caseResult.exits.length > 0 ? caseResult.exits[caseResult.exits.length - 1]! : null;
    exits.push(...caseResult.exits);
  }

  if (!hasDefault) exits.push(id);
  exits.push(...breakTargets);
  return { entryId: id, exits };
}

function buildTry(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const body = node.childForFieldName('body');
  const handler = node.childForFieldName('handler');
  const finalizer = node.childForFieldName('finalizer');

  let bodyResult: BlockBuildResult | null = null;
  let handlerResult: BlockBuildResult | null = null;
  let finalResult: BlockBuildResult | null = null;

  if (body) {
    const block = body.type === 'block' ? collectNamedChildren(body) : [body];
    bodyResult = buildBlock(block, filePath, edges, loop);
    emitEdge(edges, id, bodyResult.entryId, EdgeType.TRUE_BRANCH);
  }

  if (handler) {
    const handlerBody = handler.childForFieldName('body') ?? handler;
    const block = handlerBody.type === 'block' ? collectNamedChildren(handlerBody) : [handlerBody];
    handlerResult = buildBlock(block, filePath, edges, loop);
    emitEdge(edges, id, handlerResult.entryId, EdgeType.FALSE_BRANCH);
  }

  if (finalizer) {
    const block = finalizer.type === 'block' ? collectNamedChildren(finalizer) : [finalizer];
    finalResult = buildBlock(block, filePath, edges, loop);
  }

  const exits: string[] = [];
  const bodyExits = bodyResult?.exits ?? [];
  const handlerExits = handlerResult?.exits ?? [];

  if (finalResult) {
    for (const exit of [...bodyExits, ...handlerExits]) {
      emitEdge(edges, exit, finalResult.entryId, EdgeType.NEXT_STATEMENT);
    }
    exits.push(...finalResult.exits);
  } else {
    exits.push(...bodyExits, ...handlerExits);
  }

  return { entryId: id, exits };
}

function buildLogicalExpression(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): BlockBuildResult {
  const id = astNodeId(filePath, node);
  const left = node.childForFieldName('left');
  const right = node.childForFieldName('right');
  const operator = extractLogicalOperator(node);
  if (left) emitEdge(edges, id, astNodeId(filePath, left), EdgeType.NEXT_STATEMENT);
  if (right) {
    if (operator === '||') {
      // only evaluate right when left is false
      emitEdge(edges, id, astNodeId(filePath, right), EdgeType.FALSE_BRANCH);
      emitEdge(edges, id, id, EdgeType.TRUE_BRANCH);
    } else {
      // && : only evaluate right when left is true
      emitEdge(edges, id, astNodeId(filePath, right), EdgeType.TRUE_BRANCH);
      emitEdge(edges, id, id, EdgeType.FALSE_BRANCH);
    }
  }
  return { entryId: id, exits: [id] };
}

function buildConditionalExpressionNode(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): BlockBuildResult {
  return buildConditionalExpression(node, filePath, edges);
}

function buildExpressionEdges(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  if (node.type === 'expression_statement' || node.type === 'return_statement') {
    const expr = node.namedChild(0);
    if (expr) return buildExpressionEdges(expr, filePath, edges, loop);
  }

  if (node.type === 'logical_expression') return buildLogicalExpression(node, filePath, edges);
  if (node.type === 'conditional_expression') return buildConditionalExpressionNode(node, filePath, edges);

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'logical_expression') return buildLogicalExpression(child, filePath, edges);
    if (child.type === 'conditional_expression') return buildConditionalExpressionNode(child, filePath, edges);
  }

  return { entryId: null, exits: [] };
}

function extractLogicalOperator(node: Parser.SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === '&&' || child.type === '||') return child.type;
  }
  return null;
}

function addShortCircuitEdges(root: Parser.SyntaxNode, filePath: string, edges: CPEEdge[]): void {
  const visit = (node: Parser.SyntaxNode) => {
    if (node.type === 'logical_expression' || node.type === 'binary_expression') {
      buildLogicalExpression(node, filePath, edges);
    } else if (node.type === 'conditional_expression' || node.type === 'ternary_expression') {
      buildConditionalExpression(node, filePath, edges);
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
}

function buildStatement(node: Parser.SyntaxNode, filePath: string, edges: CPEEdge[], loop?: LoopContext): BlockBuildResult {
  if (FUNCTION_TYPES.has(node.type)) {
    buildFunctionBody(node, filePath, edges);
    return buildSimple(node, filePath);
  }
  if (node.type === 'class_declaration') {
    buildClassBodies(node, filePath, edges);
    return buildSimple(node, filePath);
  }
  if (node.type === 'variable_declaration' || node.type === 'lexical_declaration') {
    buildDeclaratorBodies(node, filePath, edges);
    return buildSimple(node, filePath);
  }
  if (node.type === 'expression_statement') {
    const expr = node.namedChild(0);
    if (expr?.type === 'assignment_expression') {
      const value = expr.childForFieldName('right');
      if (value && FUNCTION_TYPES.has(value.type)) buildFunctionBody(value, filePath, edges);
    }
  }
  if (node.type === 'return_statement') return buildReturn(node, filePath);
  if (node.type === 'throw_statement') return buildThrow(node, filePath);
  if (node.type === 'break_statement') return buildBreak(node, filePath, loop);
  if (node.type === 'continue_statement') return buildContinue(node, filePath, edges, loop);
  if (node.type === 'if_statement') return buildIf(node, filePath, edges, loop);
  if (node.type === 'conditional_expression') return buildConditionalExpression(node, filePath, edges);
  if (LOOP_TYPES.has(node.type)) {
    if (node.type === 'do_statement') return buildDoWhile(node, filePath, edges, loop);
    return buildLoop(node, filePath, edges, loop);
  }
  if (node.type === 'switch_statement') return buildSwitch(node, filePath, edges);
  if (node.type === 'try_statement') return buildTry(node, filePath, edges, loop);
  if (node.type === 'block' || node.type === 'statement_block') {
    const block = collectNamedChildren(node);
    return buildBlock(block, filePath, edges, loop);
  }
  if (SIMPLE_STATEMENT_TYPES.has(node.type)) return buildSimple(node, filePath);

  return buildSimple(node, filePath);
}

function collectCfgNodes(
  root: Parser.SyntaxNode,
  filePath: string,
): { id: string; stmtType: string; startLine: number; endLine: number }[] {
  const out: { id: string; stmtType: string; startLine: number; endLine: number }[] = [];
  const visit = (node: Parser.SyntaxNode) => {
    if (isStatementNode(node)) {
      out.push({
        id: astNodeId(filePath, node),
        stmtType: node.type,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

function buildCfgInternal(filePath: string, root: Parser.SyntaxNode): {
  nodes: CPENode[];
  edges: CPEEdge[];
  entryId: string | null;
  exitIds: string[];
  rawNodes: CFGNode[];
} {
  const edges: CPEEdge[] = [];
  const topStatements = root.type === 'program' ? collectNamedChildren(root) : [root];
  const result = buildBlock(topStatements, filePath, edges, undefined);
  addShortCircuitEdges(root, filePath, edges);

  const cfgNodes = collectCfgNodes(root, filePath);
  const nodes: CPENode[] = cfgNodes.map((node) => ({
    id: node.id,
    kind: 'cfg',
    label: node.stmtType,
    startLine: node.startLine,
    endLine: node.endLine,
  }));

  return {
    nodes,
    edges,
    entryId: result.entryId,
    exitIds: result.exits,
    rawNodes: cfgNodes,
  };
}

export function buildCfgLayer(filePath: string, root: Parser.SyntaxNode): GraphLayer {
  const edgeTypes = [EdgeType.NEXT_STATEMENT, EdgeType.TRUE_BRANCH, EdgeType.FALSE_BRANCH, EdgeType.FALLTHROUGH];
  const internal = buildCfgInternal(filePath, root);
  return { nodes: internal.nodes, edges: internal.edges, edgeTypes };
}

export function buildCFG(filePath: string, content: string): CFGResult {
  const parser = new Parser();
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(content);
  const internal = buildCfgInternal(filePath, tree.rootNode);
  const nodes: CFGNode[] = internal.rawNodes.map((node) => ({
    id: node.id,
    stmtType: node.stmtType,
    startLine: node.startLine,
    endLine: node.endLine,
  }));
  const edges: CFGEdge[] = internal.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    edgeType: edge.type as CFGEdge['edgeType'],
  }));

  return {
    nodes,
    edges,
    entryPoint: internal.entryId ?? '',
    exitPoints: internal.exitIds,
  };
}
