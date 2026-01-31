import Parser from 'tree-sitter';

// Configuration for AST-aware chunking
export interface ChunkingConfig {
  maxTokens: number;
  minTokens: number;
  priorityConstructs: string[];
  preserveContext: boolean;
  overlapTokens: number;
}

export interface CodeChunk {
  id: string;
  content: string;
  astPath: string[];
  filePath: string;
  startLine: number;
  endLine: number;
  symbolReferences: string[];
  relatedChunkIds: string[];
  tokenCount: number;
  nodeType: string;
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  totalTokens: number;
  totalChunks: number;
}

export const defaultChunkingConfig: ChunkingConfig = {
  maxTokens: 512,
  minTokens: 50,
  priorityConstructs: [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'module',
    'namespace',
    'arrow_function',
  ],
  preserveContext: true,
  overlapTokens: 32,
};

export function countTokens(text: string): number {
  return text.split(/\s+/).filter(t => t.length > 0).length;
}

export function getAstPath(node: Parser.SyntaxNode): string[] {
  const path: string[] = [];
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    path.unshift(current.type);
    current = current.parent;
  }
  return path;
}

function isDefinitionNode(node: Parser.SyntaxNode): boolean {
  const defTypes = [
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'module',
    'namespace',
    'arrow_function',
    'const_declaration',
    'let_declaration',
    'variable_declaration',
  ];
  return defTypes.includes(node.type);
}

export function findTopLevelDefinitions(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const definitions: Parser.SyntaxNode[] = [];
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child && isDefinitionNode(child)) {
      definitions.push(child);
    }
  }
  return definitions;
}

function buildChunkContent(
  node: Parser.SyntaxNode,
  filePath: string
): { text: string; startLine: number; endLine: number } {
  return {
    text: node.text,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
  };
}

function generateChunkId(
  filePath: string,
  nodeType: string,
  startLine: number,
  contentHash: string
): string {
  return `${filePath}:${nodeType}:${startLine}:${contentHash.slice(0, 8)}`;
}

function hashContent(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function extractSymbolReferences(node: Parser.SyntaxNode): string[] {
  const symbols: string[] = [];
  const traverse = (n: Parser.SyntaxNode) => {
    if (n.type === 'identifier') {
      symbols.push(n.text);
    }
    for (let i = 0; i < n.childCount; i++) {
      traverse(n.child(i)!);
    }
  };
  traverse(node);
  return [...new Set(symbols)];
}

export function astAwareChunking(
  tree: Parser.Tree,
  filePath: string,
  config: ChunkingConfig = defaultChunkingConfig
): ChunkingResult {
  const chunks: CodeChunk[] = [];
  const root = tree.rootNode;
  
  const topLevelDefs = findTopLevelDefinitions(root);
  
  for (const def of topLevelDefs) {
    const defChunks = chunkNode(def, filePath, config);
    chunks.push(...defChunks);
  }
  
  // Handle remaining content
  const coveredLines = new Set<number>();
  for (const chunk of chunks) {
    for (let line = chunk.startLine; line <= chunk.endLine; line++) {
      coveredLines.add(line);
    }
  }
  
  const remainingChunks = chunkRemainingContent(root, filePath, coveredLines, config);
  chunks.push(...remainingChunks);
  
  chunks.sort((a, b) => a.startLine - b.startLine);
  
  return {
    chunks,
    totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    totalChunks: chunks.length,
  };
}

function chunkNode(
  node: Parser.SyntaxNode,
  filePath: string,
  config: ChunkingConfig
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const { text, startLine, endLine } = buildChunkContent(node, filePath);
  const tokenCount = countTokens(text);
  const astPath = getAstPath(node);
  const contentHash = hashContent(text);
  
  if (tokenCount <= config.maxTokens) {
    const chunk: CodeChunk = {
      id: generateChunkId(filePath, node.type, startLine, contentHash),
      content: text,
      astPath,
      filePath,
      startLine,
      endLine,
      symbolReferences: extractSymbolReferences(node),
      relatedChunkIds: [],
      tokenCount,
      nodeType: node.type,
    };
    chunks.push(chunk);
    return chunks;
  }
  
  // Try to split by children
  const childChunks: CodeChunk[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && isDefinitionNode(child)) {
      const subChunks = chunkNode(child, filePath, config);
      childChunks.push(...subChunks);
    }
  }
  
  if (childChunks.length > 0) {
    for (const childChunk of childChunks) {
      childChunk.astPath = getAstPath(node).concat(childChunk.astPath);
      chunks.push(childChunk);
    }
    
    const usedLines = new Set<number>();
    for (const chunk of childChunks) {
      for (let line = chunk.startLine; line <= chunk.endLine; line++) {
        usedLines.add(line);
      }
    }
    
    const remaining = chunkRemainingContent(node, filePath, usedLines, config);
    chunks.push(...remaining);
  } else {
    const forcedChunks = createForcedChunks(node, filePath, config);
    chunks.push(...forcedChunks);
  }
  
  return chunks;
}

function chunkRemainingContent(
  node: Parser.SyntaxNode,
  filePath: string,
  coveredLines: Set<number>,
  config: ChunkingConfig,
  baseLine: number = node.startPosition.row + 1
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines: string[] = node.text.split('\n');
  let currentChunkLines: string[] = [];
  let chunkStartLine = baseLine;
  let currentLine = baseLine;
  
  for (let i = 0; i < lines.length; i++) {
    const lineNum = baseLine + i;
    
    if (coveredLines.has(lineNum)) {
      if (currentChunkLines.length > 0) {
        const chunkText = currentChunkLines.join('\n');
        const tokenCount = countTokens(chunkText);
        if (tokenCount >= config.minTokens) {
          const chunk: CodeChunk = {
            id: generateChunkId(filePath, 'fragment', chunkStartLine, hashContent(chunkText)),
            content: chunkText,
            astPath: [...getAstPath(node), 'fragment'],
            filePath,
            startLine: chunkStartLine,
            endLine: currentLine - 1,
            symbolReferences: [],
            relatedChunkIds: [],
            tokenCount,
            nodeType: 'fragment',
          };
          chunks.push(chunk);
        }
        currentChunkLines = [];
      }
    } else {
      if (currentChunkLines.length === 0) {
        chunkStartLine = lineNum;
      }
      currentChunkLines.push(lines[i]);
    }
    currentLine = lineNum + 1;
  }
  
  if (currentChunkLines.length > 0) {
    const chunkText = currentChunkLines.join('\n');
    const tokenCount = countTokens(chunkText);
    if (tokenCount >= config.minTokens) {
      const chunk: CodeChunk = {
        id: generateChunkId(filePath, 'fragment', chunkStartLine, hashContent(chunkText)),
        content: chunkText,
        astPath: [...getAstPath(node), 'fragment'],
        filePath,
        startLine: chunkStartLine,
        endLine: currentLine - 1,
        symbolReferences: [],
        relatedChunkIds: [],
        tokenCount,
        nodeType: 'fragment',
      };
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

function createForcedChunks(
  node: Parser.SyntaxNode,
  filePath: string,
  config: ChunkingConfig
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = node.text.split('\n');
  const tokensPerLine = lines.map(l => countTokens(l));
  
  let currentChunkLines: string[] = [];
  let currentChunkTokens = 0;
  let chunkStartLine = node.startPosition.row + 1;
  
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokensPerLine[i];
    
    if (currentChunkTokens + lineTokens > config.maxTokens && currentChunkTokens > config.minTokens) {
      const chunkText = currentChunkLines.join('\n');
      const chunk: CodeChunk = {
        id: generateChunkId(filePath, 'forced_split', chunkStartLine, hashContent(chunkText)),
        content: chunkText,
        astPath: [...getAstPath(node), 'forced_split'],
        filePath,
        startLine: chunkStartLine,
        endLine: node.startPosition.row + i,
        symbolReferences: [],
        relatedChunkIds: [],
        tokenCount: currentChunkTokens,
        nodeType: 'forced_split',
      };
      chunks.push(chunk);
      
      const overlapStart = Math.max(0, currentChunkLines.length - Math.ceil(config.overlapTokens / 10));
      currentChunkLines = currentChunkLines.slice(overlapStart);
      currentChunkTokens = currentChunkLines.reduce((sum, l) => sum + countTokens(l), 0);
      chunkStartLine = node.startPosition.row + i - overlapStart;
    }
    
    currentChunkLines.push(lines[i]);
    currentChunkTokens += lineTokens;
  }
  
  if (currentChunkTokens >= config.minTokens) {
    const chunkText = currentChunkLines.join('\n');
    const chunk: CodeChunk = {
      id: generateChunkId(filePath, 'forced_split', chunkStartLine, hashContent(chunkText)),
      content: chunkText,
      astPath: [...getAstPath(node), 'forced_split'],
      filePath,
      startLine: chunkStartLine,
      endLine: node.endPosition.row + 1,
      symbolReferences: [],
      relatedChunkIds: [],
      tokenCount: currentChunkTokens,
      nodeType: 'forced_split',
    };
    chunks.push(chunk);
  }
  
  return chunks;
}
