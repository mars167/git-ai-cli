import Parser from 'tree-sitter';
import { CodeParser } from '../parser';
import { toPosixPath } from '../paths';
import { buildAstLayer } from './astLayer';
import { buildCfgLayer } from './cfgLayer';
import { buildDfgLayer } from './dfgLayer';
import { buildCallGraph, buildImportGraph, CallGraphContext } from './callGraph';
import { CodePropertyGraph, GraphLayer } from './types';

export interface CpgFileInput {
  filePath: string;
  content: string;
  lang: string;
}

function mergeLayers(layers: GraphLayer[]): GraphLayer {
  const nodesMap = new Map<string, any>();
  const edges: any[] = [];
  const edgeTypes = new Set<string>();

  for (const layer of layers) {
    for (const node of layer.nodes) nodesMap.set(node.id, node);
    for (const edge of layer.edges) edges.push(edge);
    for (const type of layer.edgeTypes) edgeTypes.add(type);
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    edgeTypes: Array.from(edgeTypes) as any,
  };
}

export function buildCpgForFile(filePath: string, lang: string, root: Parser.SyntaxNode): CodePropertyGraph {
  const ast = buildAstLayer(filePath, lang, root);
  const cfg = buildCfgLayer(filePath, root);
  const dfg = buildDfgLayer(filePath, root);
  return {
    ast,
    cfg,
    dfg,
    callGraph: { nodes: [], edges: [], edgeTypes: [] },
    importGraph: { nodes: [], edges: [], edgeTypes: [] },
  };
}

export function buildCpgForFiles(files: CpgFileInput[]): CodePropertyGraph {
  const parser = new CodeParser();
  const contexts: CallGraphContext[] = [];
  const astLayers: GraphLayer[] = [];
  const cfgLayers: GraphLayer[] = [];
  const dfgLayers: GraphLayer[] = [];

  for (const file of files) {
    const filePath = toPosixPath(file.filePath);
    let tree: Parser.Tree | null = null;
    try {
      const adapter = (parser as any).pickAdapter?.(filePath);
      if (adapter) {
        (parser as any).parser.setLanguage(adapter.getTreeSitterLanguage());
        tree = (parser as any).parser.parse(file.content);
      }
    } catch {
      tree = null;
    }
    if (!tree) continue;
    const root = tree.rootNode;
    const ast = buildAstLayer(filePath, file.lang, root);
    const cfg = buildCfgLayer(filePath, root);
    const dfg = buildDfgLayer(filePath, root);
    astLayers.push(ast);
    cfgLayers.push(cfg);
    dfgLayers.push(dfg);
    contexts.push({ filePath, lang: file.lang, root });
  }

  const callGraph = buildCallGraph(contexts);
  const importGraph = buildImportGraph(contexts);

  return {
    ast: mergeLayers(astLayers),
    cfg: mergeLayers(cfgLayers),
    dfg: mergeLayers(dfgLayers),
    callGraph,
    importGraph,
  };
}
