import { Command } from 'commander';
import path from 'path';
import { detectRepoGitContext } from '../core/dsr/gitContext';
import { generateDsrForCommit } from '../core/dsr/generate';
import { materializeDsrIndex } from '../core/dsr/indexMaterialize';
import { symbolEvolution } from '../core/dsr/query';
import { getDsrDirectoryState } from '../core/dsr/state';

export const dsrCommand = new Command('dsr')
  .description('Deterministic Semantic Record (per-commit, immutable, Git-addressable)');

dsrCommand
  .command('context')
  .description('Discover repository root, HEAD, branch, and DSR directory state')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (options) => {
    const start = path.resolve(options.path);
    const ctx = await detectRepoGitContext(start);
    const state = await getDsrDirectoryState(ctx.repo_root);
    const out = {
      commit_hash: ctx.head_commit,
      repo_root: ctx.repo_root,
      branch: ctx.branch,
      detached: ctx.detached,
      dsr_directory_state: state,
    };
    if (options.json) {
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    const lines: string[] = [];
    lines.push(`repo: ${out.repo_root}`);
    lines.push(`head: ${out.commit_hash}`);
    lines.push(`branch: ${out.detached ? '(detached)' : out.branch}`);
    lines.push(`dsrCacheRoot: ${out.dsr_directory_state.cache_root} (${out.dsr_directory_state.cache_root_exists ? 'exists' : 'missing'})`);
    lines.push(`dsrDir: ${out.dsr_directory_state.dsr_dir} (${out.dsr_directory_state.dsr_dir_exists ? 'exists' : 'missing'})`);
    lines.push(`dsrFiles: ${String(out.dsr_directory_state.dsr_file_count)}`);
    console.log(lines.join('\n'));
    process.exit(0);
  });

dsrCommand
  .command('generate')
  .description('Generate DSR for exactly one commit')
  .argument('<commit>', 'Commit hash (any rev that resolves to a commit)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (commit: string, options) => {
    const start = path.resolve(options.path);
    const ctx = await detectRepoGitContext(start);
    const res = await generateDsrForCommit(ctx.repo_root, String(commit));
    const out = {
      commit_hash: res.dsr.commit_hash,
      file_path: res.file_path,
      existed: res.existed,
      counts: {
        affected_symbols: res.dsr.affected_symbols.length,
        ast_operations: res.dsr.ast_operations.length,
      },
      semantic_change_type: res.dsr.semantic_change_type,
      risk_level: res.dsr.risk_level,
    };
    if (options.json) {
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    const lines: string[] = [];
    lines.push(`commit: ${out.commit_hash}`);
    lines.push(`dsr: ${out.file_path}`);
    lines.push(`status: ${out.existed ? 'exists' : 'generated'}`);
    lines.push(`ops: ${String(out.counts.ast_operations)}`);
    lines.push(`affected_symbols: ${String(out.counts.affected_symbols)}`);
    lines.push(`semantic_change_type: ${out.semantic_change_type}`);
    lines.push(`risk_level: ${out.risk_level ?? 'unknown'}`);
    console.log(lines.join('\n'));
    process.exit(0);
  });

dsrCommand
  .command('rebuild-index')
  .description('Rebuild performance-oriented DSR index from DSR files')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (options) => {
    const start = path.resolve(options.path);
    const ctx = await detectRepoGitContext(start);
    const res = await materializeDsrIndex(ctx.repo_root);
    if (options.json) {
      console.log(JSON.stringify({ repo_root: ctx.repo_root, ...res }, null, 2));
      process.exit(res.enabled ? 0 : 2);
    }
    if (!res.enabled) {
      console.error(res.skippedReason ?? 'rebuild-index skipped');
      process.exit(2);
    }
    const lines: string[] = [];
    lines.push(`repo: ${ctx.repo_root}`);
    lines.push(`engine: ${res.engine}`);
    if (res.dbPath) lines.push(`db: ${res.dbPath}`);
    if (res.exportPath) lines.push(`export: ${res.exportPath}`);
    if (res.counts) {
      lines.push(`commits: ${String(res.counts.commits)}`);
      lines.push(`affected_symbols: ${String(res.counts.affected_symbols)}`);
      lines.push(`ast_operations: ${String(res.counts.ast_operations)}`);
    }
    console.log(lines.join('\n'));
    process.exit(0);
  });

const queryCommand = new Command('query').description('Read-only semantic queries over Git DAG + DSR');

queryCommand
  .command('symbol-evolution')
  .description('List commits where a symbol changed (requires DSR per traversed commit)')
  .argument('<symbol>', 'Symbol name')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('--all', 'Traverse all refs (default: from HEAD)', false)
  .option('--start <commit>', 'Start commit (default: HEAD)')
  .option('--limit <n>', 'Max commits to traverse', (v) => Number(v), 200)
  .option('--contains', 'Match by substring instead of exact match', false)
  .option('--json', 'Output machine-readable JSON', false)
  .action(async (symbol: string, options) => {
    const startDir = path.resolve(options.path);
    const ctx = await detectRepoGitContext(startDir);
    const res = await symbolEvolution(ctx.repo_root, String(symbol), {
      all: Boolean(options.all),
      start: options.start ? String(options.start) : undefined,
      limit: Number(options.limit),
      contains: Boolean(options.contains),
    });
    if (options.json) {
      console.log(JSON.stringify({ repo_root: ctx.repo_root, symbol, ...res }, null, 2));
      process.exit(res.ok ? 0 : 2);
    }
    if (!res.ok) {
      console.error(`missing DSR for commit: ${res.missing_dsrs?.[0] ?? 'unknown'}`);
      process.exit(2);
    }
    const hits = res.hits ?? [];
    const lines: string[] = [];
    lines.push(`repo: ${ctx.repo_root}`);
    lines.push(`symbol: ${symbol}`);
    lines.push(`hits: ${String(hits.length)}`);
    for (const h of hits.slice(0, 50)) {
      const opKinds = Array.from(new Set(h.operations.map((o) => o.op))).sort().join(',');
      lines.push(`${h.commit_hash} ${h.semantic_change_type} ${h.risk_level ?? ''} ops=${String(h.operations.length)} kinds=${opKinds} ${h.summary ?? ''}`.trim());
    }
    if (hits.length > 50) lines.push(`... (${hits.length - 50} more)`);
    console.log(lines.join('\n'));
    process.exit(0);
  });

dsrCommand.addCommand(queryCommand);
