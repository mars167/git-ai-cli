import { runAstGraphQuery } from './astGraphQuery';
import path from 'path';
import fs from 'fs-extra';

export interface RepoMapOptions {
  repoRoot: string;
  maxFiles?: number;
  maxSymbolsPerFile?: number;
  wikiDir?: string;
}

export interface SymbolRank {
  id: string;
  name: string;
  kind: string;
  file: string;
  rank: number;
  signature?: string;
  start_line: number;
  end_line: number;
}

export interface FileRank {
  path: string;
  rank: number;
  symbols: SymbolRank[];
  wikiLink?: string;
}

export async function generateRepoMap(options: RepoMapOptions): Promise<FileRank[]> {
  const { repoRoot, maxFiles = 20, maxSymbolsPerFile = 5, wikiDir } = options;

  const symbolsQuery = `?[ref_id, file, name, kind, signature, start_line, end_line] := *ast_symbol{ref_id, file, name, kind, signature, start_line, end_line}`;
  const symbolsRes = await runAstGraphQuery(repoRoot, symbolsQuery);
  const symbolsRaw = Array.isArray(symbolsRes?.rows) ? symbolsRes.rows : [];
  
  const symbolMap = new Map<string, any>();
  for (const row of symbolsRaw) {
    symbolMap.set(row[0], {
      id: row[0],
      file: row[1],
      name: row[2],
      kind: row[3],
      signature: row[4],
      start_line: row[5],
      end_line: row[6],
      inDegree: 0,
      outEdges: new Set<string>(),
    });
  }

  const relationsQuery = `
    ?[from_id, to_id] := *ast_call_name{caller_id: from_id, callee_name: name}, *ast_symbol{ref_id: to_id, name}
    ?[from_id, to_id] := *ast_ref_name{from_id, name}, *ast_symbol{ref_id: to_id, name}
  `;
  const relationsRes = await runAstGraphQuery(repoRoot, relationsQuery);
  const relationsRaw = Array.isArray(relationsRes?.rows) ? relationsRes.rows : [];

  for (const [fromId, toId] of relationsRaw) {
    if (symbolMap.has(fromId) && symbolMap.has(toId) && fromId !== toId) {
      const fromNode = symbolMap.get(fromId);
      const toNode = symbolMap.get(toId);
      if (!fromNode.outEdges.has(toId)) {
        fromNode.outEdges.add(toId);
        toNode.inDegree += 1;
      }
    }
  }

  const nodes = Array.from(symbolMap.values());
  const N = nodes.length;
  if (N === 0) return [];

  let ranks = new Map<string, number>();
  nodes.forEach(n => ranks.set(n.id, 1 / N));

  const damping = 0.85;
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    const newRanks = new Map<string, number>();
    nodes.forEach(n => newRanks.set(n.id, (1 - damping) / N));

    for (const node of nodes) {
      const currentRank = ranks.get(node.id)!;
      if (node.outEdges.size > 0) {
        const share = (currentRank * damping) / node.outEdges.size;
        for (const targetId of node.outEdges) {
          newRanks.set(targetId, newRanks.get(targetId)! + share);
        }
      } else {
        const share = (currentRank * damping) / N;
        for (const n2 of nodes) {
          newRanks.set(n2.id, newRanks.get(n2.id)! + share);
        }
      }
    }
    ranks = newRanks;
  }

  const fileMap = new Map<string, { rank: number; symbols: SymbolRank[] }>();
  for (const node of nodes) {
    const rank = ranks.get(node.id)!;
    if (!fileMap.has(node.file)) {
      fileMap.set(node.file, { rank: 0, symbols: [] });
    }
    const fileInfo = fileMap.get(node.file)!;
    fileInfo.rank += rank;
    fileInfo.symbols.push({
      id: node.id,
      name: node.name,
      kind: node.kind,
      file: node.file,
      rank: rank,
      signature: node.signature,
      start_line: node.start_line,
      end_line: node.end_line,
    });
  }

  let wikiPages: Array<{ file: string; content: string }> = [];
  if (wikiDir && fs.existsSync(wikiDir)) {
    const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md') && f !== 'index.md');
    wikiPages = files.map(f => ({
      file: f,
      content: fs.readFileSync(path.join(wikiDir, f), 'utf8').toLowerCase(),
    }));
  }

  const result: FileRank[] = Array.from(fileMap.entries())
    .map(([filePath, info]) => {
      const sortedSymbols = info.symbols
        .sort((a, b) => b.rank - a.rank)
        .slice(0, maxSymbolsPerFile);
      
      let wikiLink: string | undefined;
      const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
      
      const matchedByFile = wikiPages.find(p => p.file.toLowerCase().includes(baseName));
      if (matchedByFile) {
        wikiLink = matchedByFile.file;
      } else {
        const mentioner = wikiPages.find(p => 
          p.content.includes(baseName) || 
          sortedSymbols.some(s => s.name.length > 3 && p.content.includes(s.name.toLowerCase()))
        );
        if (mentioner) {
          wikiLink = mentioner.file;
        }
      }

      return {
        path: filePath,
        rank: info.rank,
        symbols: sortedSymbols,
        wikiLink,
      };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, maxFiles);

  return result;
}

export function formatRepoMap(fileRanks: FileRank[]): string {
  if (fileRanks.length === 0) return 'No symbols found to map.';

  let output = 'Repository Map (ranked by importance)\n';
  output += '====================================\n\n';

  for (const file of fileRanks) {
    output += `${file.path} (score: ${(file.rank * 100).toFixed(2)})\n`;
    if (file.wikiLink) {
      output += `   wiki: ${file.wikiLink}\n`;
    }
    for (const sym of file.symbols) {
      const indent = '   ';
      const kindIcon = getKindIcon(sym.kind);
      output += `${indent}${kindIcon} ${sym.name} [L${sym.start_line}]\n`;
    }
    output += '\n';
  }

  return output;
}

function getKindIcon(kind: string): string {
  switch (kind.toLowerCase()) {
    case 'function':
    case 'method':
      return 'ƒ';
    case 'class':
      return '©';
    case 'interface':
      return 'ɪ';
    case 'variable':
    case 'constant':
      return 'ν';
    default:
      return '•';
  }
}
