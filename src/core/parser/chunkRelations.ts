import { CodeChunk } from './chunker';

/**
 * Infer relationships between chunks based on content and AST path
 */
export interface ChunkRelations {
  callerMap: Map<string, string[]>;  // chunkId -> callee chunkIds
  calleeMap: Map<string, string[]>;  // chunkId -> caller chunkIds
  parentMap: Map<string, string>;    // chunkId -> parent chunkId
  childMap: Map<string, string[]>;   // chunkId -> child chunkIds
  typeMap: Map<string, string[]>;    // type -> chunkIds
  fileMap: Map<string, string[]>;    // filePath -> chunkIds
}

/**
 * Build relationships between chunks
 */
export function inferChunkRelations(chunks: CodeChunk[]): ChunkRelations {
  const relations: ChunkRelations = {
    callerMap: new Map(),
    calleeMap: new Map(),
    parentMap: new Map(),
    childMap: new Map(),
    typeMap: new Map(),
    fileMap: new Map(),
  };
  
  // Build file map
  for (const chunk of chunks) {
    if (!relations.fileMap.has(chunk.filePath)) {
      relations.fileMap.set(chunk.filePath, []);
    }
    relations.fileMap.get(chunk.filePath)!.push(chunk.id);
  }
  
  // Build type map
  for (const chunk of chunks) {
    if (!relations.typeMap.has(chunk.nodeType)) {
      relations.typeMap.set(chunk.nodeType, []);
    }
    relations.typeMap.get(chunk.nodeType)!.push(chunk.id);
  }
  
  // Build parent-child relationships based on AST path nesting
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Find parent (chunk whose AST path is a prefix of this chunk's path)
    for (let j = 0; j < i; j++) {
      const other = chunks[j];
      if (other.filePath !== chunk.filePath) continue;
      
      if (isParentPath(other.astPath, chunk.astPath)) {
        relations.parentMap.set(chunk.id, other.id);
        
        if (!relations.childMap.has(other.id)) {
          relations.childMap.set(other.id, []);
        }
        relations.childMap.get(other.id)!.push(chunk.id);
        break;
      }
    }
  }
  
  // Infer call relationships from symbol references
  for (const chunk of chunks) {
    const calls: string[] = [];
    
    for (const ref of chunk.symbolReferences) {
      // Find chunks that define this symbol
      for (const other of chunks) {
        if (other.id === chunk.id) continue;
        if (extractDefNames(other.content).includes(ref)) {
          calls.push(other.id);
        }
      }
    }
    
    if (calls.length > 0) {
      relations.callerMap.set(chunk.id, [...new Set(calls)]);
      for (const calleeId of calls) {
        if (!relations.calleeMap.has(calleeId)) {
          relations.calleeMap.set(calleeId, []);
        }
        relations.calleeMap.get(calleeId)!.push(chunk.id);
      }
    }
  }
  
  return relations;
}

/**
 * Check if pathA is a parent prefix of pathB
 */
function isParentPath(pathA: string[], pathB: string[]): boolean {
  if (pathA.length >= pathB.length) return false;
  for (let i = 0; i < pathA.length; i++) {
    if (pathA[i] !== pathB[i]) return false;
  }
  return true;
}

/**
 * Extract definition names from chunk content
 */
function extractDefNames(content: string): string[] {
  const names: string[] = [];
  
  // Match function declarations
  const fnMatch = content.match(/function\s+(\w+)/g);
  if (fnMatch) {
    for (const m of fnMatch) {
      names.push(m.replace('function ', ''));
    }
  }
  
  // Match class declarations
  const classMatch = content.match(/class\s+(\w+)/g);
  if (classMatch) {
    for (const m of classMatch) {
      names.push(m.replace('class ', ''));
    }
  }
  
  // Match method definitions (simplified)
  const methodMatch = content.match(/(\w+)\s*\([^)]*\)\s*\{/g);
  if (methodMatch) {
    for (const m of methodMatch) {
      const match = m.match(/^(\w+)/);
      if (match) names.push(match[1]);
    }
  }
  
  return [...new Set(names)];
}

/**
 * Find related chunks for a given chunk
 */
export function getRelatedChunks(
  chunkId: string,
  relations: ChunkRelations,
  maxDepth: number = 2
): string[] {
  const visited = new Set<string>([chunkId]);
  const queue: { id: string; depth: number }[] = [{ id: chunkId, depth: 0 }];
  const result: string[] = [];
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    
    if (depth > 0) {
      result.push(id);
    }
    
    if (depth >= maxDepth) continue;
    
    // Get all related chunk IDs
    const related: string[] = [];
    
    // Parents
    const parent = relations.parentMap.get(id);
    if (parent && !visited.has(parent)) {
      related.push(parent);
    }
    
    // Children
    const children = relations.childMap.get(id) || [];
    for (const child of children) {
      if (!visited.has(child)) related.push(child);
    }
    
    // Callers
    const callers = relations.calleeMap.get(id) || [];
    for (const caller of callers) {
      if (!visited.has(caller)) related.push(caller);
    }
    
    // Callees
    const callersOf = relations.callerMap.get(id) || [];
    for (const callee of callersOf) {
      if (!visited.has(callee)) related.push(callee);
    }
    
    for (const rid of related) {
      visited.add(rid);
      queue.push({ id: rid, depth: depth + 1 });
    }
  }
  
  return result;
}

/**
 * Get chunks that reference a given symbol
 */
export function getChunksReferencingSymbol(
  symbolName: string,
  chunks: CodeChunk[]
): CodeChunk[] {
  return chunks.filter(chunk => chunk.symbolReferences.includes(symbolName));
}

/**
 * Get chunks that define a given symbol
 */
export function getChunksDefiningSymbol(
  symbolName: string,
  chunks: CodeChunk[]
): CodeChunk[] {
  return chunks.filter(chunk => {
    const defs = extractDefNames(chunk.content);
    return defs.includes(symbolName);
  });
}
