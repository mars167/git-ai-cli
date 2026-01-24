import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { sha256Hex } from '../core/crypto';
import { buildCallChainDownstreamByNameQuery, buildCallChainUpstreamByNameQuery, buildCalleesByNameQuery, buildCallersByNameQuery, buildChildrenQuery, buildFindReferencesQuery, buildFindSymbolsQuery, runAstGraphQuery } from '../core/astGraphQuery';
import { toPosixPath } from '../core/paths';
import { createLogger } from '../core/log';
import { checkIndex, resolveLangs } from '../core/indexCheck';

export const graphCommand = new Command('graph')
  .description('AST graph search powered by CozoDB')
  .addCommand(
    new Command('query')
      .description('Run a CozoScript query against the AST graph database')
      .argument('<script...>', 'CozoScript query')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--params <json>', 'JSON params object', '{}')
      .action(async (scriptParts, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph query' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const query = Array.isArray(scriptParts) ? scriptParts.join(' ') : String(scriptParts ?? '');
        const params = JSON.parse(String(options.params ?? '{}'));
        const result = await runAstGraphQuery(repoRoot, query, params);
        log.info('ast_graph_query', { ok: true, repoRoot, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, result }, null, 2));
      })
  )
  .addCommand(
    new Command('find')
      .description('Find symbols by name prefix')
      .argument('<prefix>', 'Name prefix (case-insensitive)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
      .action(async (prefix, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph find' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
          process.exit(2);
          return;
        }
        const langSel = String(options.lang ?? 'auto');
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildFindSymbolsQuery(lang), { prefix: String(prefix), lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        const result = { headers: ['ref_id', 'file', 'lang', 'name', 'kind', 'signature', 'start_line', 'end_line'], rows: allRows };
        log.info('ast_graph_find', { ok: true, repoRoot, prefix: String(prefix), lang: langSel, langs, rows: allRows.length, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, lang: langSel, result }, null, 2));
      })
  )
  .addCommand(
    new Command('children')
      .description('List direct children in the AST containment graph')
      .argument('<id>', 'Parent id (ref_id or file_id)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--as-file', 'Treat <id> as a repository-relative file path and hash it to file_id', false)
      .action(async (id, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph children' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const parentId = options.asFile ? sha256Hex(`file:${toPosixPath(String(id))}`) : String(id);
        const result = await runAstGraphQuery(repoRoot, buildChildrenQuery(), { parent_id: parentId });
        log.info('ast_graph_children', { ok: true, repoRoot, parent_id: parentId, rows: Array.isArray((result as any)?.rows) ? (result as any).rows.length : 0, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, parent_id: parentId, result }, null, 2));
      })
  )
  .addCommand(
    new Command('refs')
      .description('Find reference locations by name (calls/new/type)')
      .argument('<name>', 'Symbol name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--limit <n>', 'Limit results', '200')
      .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
      .action(async (name, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph refs' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
          process.exit(2);
          return;
        }
        const limit = Number(options.limit ?? 200);
        const langSel = String(options.lang ?? 'auto');
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildFindReferencesQuery(lang), { name: String(name), lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        const rows = allRows.slice(0, limit);
        log.info('ast_graph_refs', { ok: true, repoRoot, name: String(name), lang: langSel, langs, rows: rows.length, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, name: String(name), lang: langSel, result: { headers: ['file', 'line', 'col', 'ref_kind', 'from_id', 'from_kind', 'from_name', 'from_lang'], rows } }, null, 2));
      })
  )
  .addCommand(
    new Command('callers')
      .description('Find callers by callee name')
      .argument('<name>', 'Callee name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--limit <n>', 'Limit results', '200')
      .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
      .action(async (name, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph callers' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
          process.exit(2);
          return;
        }
        const limit = Number(options.limit ?? 200);
        const langSel = String(options.lang ?? 'auto');
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildCallersByNameQuery(lang), { name: String(name), lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        const rows = allRows.slice(0, limit);
        log.info('ast_graph_callers', { ok: true, repoRoot, name: String(name), lang: langSel, langs, rows: rows.length, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, name: String(name), lang: langSel, result: { headers: ['caller_id', 'caller_kind', 'caller_name', 'file', 'line', 'col', 'caller_lang'], rows } }, null, 2));
      })
  )
  .addCommand(
    new Command('callees')
      .description('Find callees by caller name (resolved by exact callee name match in graph)')
      .argument('<name>', 'Caller name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--limit <n>', 'Limit results', '200')
      .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
      .action(async (name, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph callees' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
          process.exit(2);
          return;
        }
        const limit = Number(options.limit ?? 200);
        const langSel = String(options.lang ?? 'auto');
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, buildCalleesByNameQuery(lang), { name: String(name), lang });
          const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rows) allRows.push(r);
        }
        const rows = allRows.slice(0, limit);
        log.info('ast_graph_callees', { ok: true, repoRoot, name: String(name), lang: langSel, langs, rows: rows.length, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, name: String(name), lang: langSel, result: { headers: ['caller_id', 'caller_lang', 'callee_id', 'callee_file', 'callee_name', 'callee_kind', 'file', 'line', 'col'], rows } }, null, 2));
      })
  )
  .addCommand(
    new Command('chain')
      .description('Compute call chain by symbol name (heuristic, name-based)')
      .argument('<name>', 'Start symbol name')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--direction <direction>', 'Direction: downstream|upstream', 'downstream')
      .option('--depth <n>', 'Max depth', '3')
      .option('--limit <n>', 'Limit results', '500')
      .option('--min-name-len <n>', 'Filter out edges with very short names (default: 1)', '1')
      .option('--lang <lang>', 'Language: auto|all|java|ts', 'auto')
      .action(async (name, options) => {
        const log = createLogger({ component: 'cli', cmd: 'ai graph chain' });
        const startedAt = Date.now();
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const status = await checkIndex(repoRoot);
        if (!status.ok) {
          process.stderr.write(JSON.stringify({ ...status, ok: false, reason: 'index_incompatible' }, null, 2) + '\n');
          process.exit(2);
          return;
        }
        const direction = String(options.direction ?? 'downstream');
        const maxDepth = Number(options.depth ?? 3);
        const limit = Number(options.limit ?? 500);
        const minNameLen = Math.max(1, Number(options.minNameLen ?? 1));
        const langSel = String(options.lang ?? 'auto');
        const langs = resolveLangs(status.found.meta ?? null, langSel as any);
        const query = direction === 'upstream' ? buildCallChainUpstreamByNameQuery() : buildCallChainDownstreamByNameQuery();
        const allRows: any[] = [];
        for (const lang of langs) {
          const result = await runAstGraphQuery(repoRoot, query, { name: String(name), max_depth: maxDepth, lang });
          const rawRows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
          for (const r of rawRows) allRows.push(r);
        }
        const filtered = minNameLen > 1
          ? allRows.filter((r: any[]) => String(r?.[3] ?? '').length >= minNameLen && String(r?.[4] ?? '').length >= minNameLen)
          : allRows;
        const rows = filtered.slice(0, limit);
        log.info('ast_graph_chain', { ok: true, repoRoot, name: String(name), lang: langSel, langs, direction, max_depth: maxDepth, rows: rows.length, min_name_len: minNameLen, duration_ms: Date.now() - startedAt });
        console.log(JSON.stringify({ repoRoot, name: String(name), lang: langSel, direction, max_depth: maxDepth, min_name_len: minNameLen, result: { headers: ['caller_id', 'callee_id', 'depth', 'caller_name', 'callee_name', 'lang'], rows } }, null, 2));
      })
  );
