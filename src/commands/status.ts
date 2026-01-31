import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { checkIndex } from '../core/indexCheck';
import { ALL_INDEX_LANGS } from '../core/lancedb';

export const statusCommand = new Command('status')
  .description('Show repository index status')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const res = await checkIndex(repoRoot);
    if (options.json) {
      console.log(JSON.stringify({ repoRoot, ...res }, null, 2));
      process.exit(res.ok ? 0 : 2);
    }

    const meta = res.found.meta ?? null;
    const lines: string[] = [];
    lines.push(`repo: ${repoRoot}`);
    lines.push(`index: ${res.ok ? 'ok' : 'not_ready'}`);
    if (meta) {
      lines.push(`schema: ${String(meta.index_schema_version ?? 'unknown')} (expected ${res.expected.index_schema_version})`);
      if (meta.dim !== undefined) lines.push(`dim: ${String(meta.dim)}`);
      const rawLangs = Array.isArray((meta as any).languages) ? (meta as any).languages.map((v: any) => String(v)) : [];
      const supported = rawLangs.filter((l: string) => (ALL_INDEX_LANGS as readonly string[]).includes(l));
      const unsupported = rawLangs.filter((l: string) => !(ALL_INDEX_LANGS as readonly string[]).includes(l));
      if (supported.length > 0) lines.push(`languages: ${supported.join(', ')}`);
      if (unsupported.length > 0) lines.push(`unsupportedLanguages: ${unsupported.join(', ')}`);
      if (meta.dbDir) lines.push(`db: ${meta.dbDir}`);
      if (meta.scanRoot) lines.push(`scanRoot: ${meta.scanRoot}`);

      // Display commit information
      if (meta.commit_hash) {
        const shortHash = meta.commit_hash.substring(0, 7);
        const currentHash = res.found.currentCommitHash;
        if (currentHash) {
          const currentShort = currentHash.substring(0, 7);
          if (meta.commit_hash === currentHash) {
            lines.push(`commit: ${shortHash} (up-to-date)`);
          } else {
            lines.push(`commit: ${shortHash} (HEAD is ${currentShort})`);
          }
        } else {
          lines.push(`commit: ${shortHash}`);
        }
      } else if (res.found.currentCommitHash) {
        lines.push(`commit: not recorded (HEAD is ${res.found.currentCommitHash.substring(0, 7)})`);
      }
    } else {
      lines.push(`meta: missing (${res.found.metaPath})`);
    }
    if (!res.ok) {
      lines.push(`problems: ${res.problems.join(', ')}`);
      lines.push(`hint: ${res.hint}`);
    }
    if (res.warnings.length > 0) {
      lines.push(`warnings: ${res.warnings.join(', ')}`);
      if (res.warnings.some(w => w.startsWith('index_commit_mismatch'))) {
        lines.push(`hint: Index may be out of date. Run: git-ai ai index --incremental`);
      }
    }
    console.log(lines.join('\n'));
    process.exit(res.ok ? 0 : 2);
  });
