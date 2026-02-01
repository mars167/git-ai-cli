import Parser from 'tree-sitter';
import { sha256Hex } from '../crypto';
import type { StructuralConfig, StructuralEmbedder } from './types';

interface NodeFeatures {
  type: string;
  childTypes: string[];
  depth: number;
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm <= 0) return vec.slice();
  return vec.map((v) => v / norm);
}

function hashToIndex(hash: string, dim: number): number {
  const idx = parseInt(hash.slice(0, 8), 16) >>> 0;
  return idx % dim;
}

function nodeFeatures(node: Parser.SyntaxNode): NodeFeatures {
  const childTypes: string[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) childTypes.push(child.type);
  }
  let depth = 0;
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return { type: node.type, childTypes, depth };
}

function wlHash(type: string, neighborHashes: string[], iteration: number): string {
  const base = [type, iteration.toString(), ...neighborHashes.sort()].join('|');
  return sha256Hex(base);
}

export class WlStructuralEmbedder implements StructuralEmbedder {
  private config: StructuralConfig;

  constructor(config: StructuralConfig) {
    this.config = config;
  }

  embed(tree: Parser.Tree): number[] {
    return this.embedNode(tree.rootNode);
  }

  embedNode(node: Parser.SyntaxNode): number[] {
    return this.embedSubtree(node);
  }

  embedSubtree(node: Parser.SyntaxNode): number[] {
    const dim = this.config.dim;
    const iterations = Math.max(1, this.config.wlIterations);
    const nodes: Parser.SyntaxNode[] = [];
    const traverse = (n: Parser.SyntaxNode) => {
      nodes.push(n);
      for (let i = 0; i < n.namedChildCount; i++) {
        const child = n.namedChild(i);
        if (child) traverse(child);
      }
    };
    traverse(node);

    const currentHashes = new Map<Parser.SyntaxNode, string>();
    for (const n of nodes) {
      const features = nodeFeatures(n);
      const base = [features.type, features.childTypes.join(','), features.depth.toString()].join('|');
      currentHashes.set(n, sha256Hex(base));
    }

    for (let iter = 0; iter < iterations; iter++) {
      const next = new Map<Parser.SyntaxNode, string>();
      for (const n of nodes) {
        const neighborHashes: string[] = [];
        for (let i = 0; i < n.namedChildCount; i++) {
          const child = n.namedChild(i);
          if (child) neighborHashes.push(currentHashes.get(child) ?? '');
        }
        next.set(n, wlHash(n.type, neighborHashes, iter));
      }
      for (const [n, h] of next.entries()) currentHashes.set(n, h);
    }

    const vec = new Array(dim).fill(0);
    for (const n of nodes) {
      const h = currentHashes.get(n) ?? '';
      const idx = hashToIndex(h, dim);
      const sign = (parseInt(h.slice(0, 2), 16) & 1) === 0 ? 1 : -1;
      vec[idx] += sign;
      const features = nodeFeatures(n);
      const depthIdx = (features.depth * 7) % dim;
      vec[depthIdx] += 0.5;
    }

    return normalize(vec);
  }
}

export function defaultStructuralConfig(): StructuralConfig {
  return { dim: 256, wlIterations: 2 };
}
