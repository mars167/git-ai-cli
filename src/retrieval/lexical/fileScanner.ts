import path from 'path';
import { glob } from 'glob';
import type { RuntimeLanguage } from './types';

const DEFAULT_IGNORES = [
  '**/.git/**',
  '**/.git-ai/**',
  '**/node_modules/**',
  '**/dist/**',
];

const LANGUAGE_EXTENSIONS: Record<Exclude<RuntimeLanguage, 'all'>, string[]> = {
  ts: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  java: ['.java'],
  python: ['.py'],
  go: ['.go'],
  rust: ['.rs'],
  c: ['.c', '.h'],
  markdown: ['.md', '.mdx'],
  yaml: ['.yml', '.yaml'],
};

export function inferRuntimeLanguage(filePath: string): RuntimeLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) {
      return lang as RuntimeLanguage;
    }
  }
  return null;
}

export async function scanFiles(
  repoRoot: string,
  lang: RuntimeLanguage = 'all',
  pathPattern = '**/*',
): Promise<string[]> {
  const files = await glob(pathPattern, {
    cwd: repoRoot,
    nodir: true,
    dot: false,
    ignore: DEFAULT_IGNORES,
    posix: true,
  });

  if (lang === 'all') {
    return files.filter((file) => inferRuntimeLanguage(file) !== null);
  }

  return files.filter((file) => inferRuntimeLanguage(file) === lang);
}
