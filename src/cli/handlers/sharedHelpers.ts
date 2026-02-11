import path from 'path';
import fs from 'fs-extra';
import type { IndexLang } from '../../core/lancedb';
import { generateRepoMap, type FileRank } from '../../core/repoMap';
import type { CLIError } from '../types';

export function isCLIError(value: unknown): value is CLIError {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as any).ok === false;
}

export async function buildRepoMapAttachment(
  repoRoot: string,
  options: { wiki: string; repoMapFiles: number; repoMapSymbols: number }
): Promise<{ enabled: boolean; wikiDir: string; files: FileRank[] } | { enabled: boolean; skippedReason: string }> {
  try {
    const wikiDir = resolveWikiDir(repoRoot, options.wiki);
    const files = await generateRepoMap({
      repoRoot,
      maxFiles: options.repoMapFiles,
      maxSymbolsPerFile: options.repoMapSymbols,
      wikiDir,
    });
    return { enabled: true, wikiDir, files };
  } catch (e: any) {
    return { enabled: false, skippedReason: String(e?.message ?? e) };
  }
}

/**
 * Resolve wiki directory, ensuring the resolved path stays within repoRoot
 * to prevent path traversal attacks.
 */
export function resolveWikiDir(repoRoot: string, wikiOpt: string): string {
  const w = String(wikiOpt ?? '').trim();
  if (w) {
    const resolved = path.resolve(repoRoot, w);
    // Prevent path traversal outside repoRoot
    if (!resolved.startsWith(repoRoot + path.sep) && resolved !== repoRoot) {
      return '';
    }
    return resolved;
  }
  const candidates = [path.join(repoRoot, 'docs', 'wiki'), path.join(repoRoot, 'wiki')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

export function inferLangFromFile(file: string): IndexLang {
  const f = String(file);
  if (f.endsWith('.md') || f.endsWith('.mdx')) return 'markdown';
  if (f.endsWith('.yml') || f.endsWith('.yaml')) return 'yaml';
  if (f.endsWith('.java')) return 'java';
  if (f.endsWith('.c') || f.endsWith('.h')) return 'c';
  if (f.endsWith('.go')) return 'go';
  if (f.endsWith('.py')) return 'python';
  if (f.endsWith('.rs')) return 'rust';
  return 'ts';
}

export function filterWorkspaceRowsByLang(rows: any[], langSel: string): any[] {
  const sel = String(langSel ?? 'auto');
  if (sel === 'auto' || sel === 'all') return rows;
  const target = sel as IndexLang;
  return rows.filter(r => inferLangFromFile(String((r as any).file ?? '')) === target);
}
