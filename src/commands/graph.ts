import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { sha256Hex } from '../core/crypto';
import { buildChildrenQuery, buildFindSymbolsQuery, runAstGraphQuery } from '../core/astGraphQuery';

export const graphCommand = new Command('graph')
  .description('AST graph search powered by CozoDB')
  .addCommand(
    new Command('query')
      .description('Run a CozoScript query against the AST graph database')
      .argument('<script...>', 'CozoScript query')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--params <json>', 'JSON params object', '{}')
      .action(async (scriptParts, options) => {
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const query = Array.isArray(scriptParts) ? scriptParts.join(' ') : String(scriptParts ?? '');
        const params = JSON.parse(String(options.params ?? '{}'));
        const result = await runAstGraphQuery(repoRoot, query, params);
        console.log(JSON.stringify({ repoRoot, result }, null, 2));
      })
  )
  .addCommand(
    new Command('find')
      .description('Find symbols by name prefix')
      .argument('<prefix>', 'Name prefix (case-insensitive)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .action(async (prefix, options) => {
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const result = await runAstGraphQuery(repoRoot, buildFindSymbolsQuery(), { prefix: String(prefix) });
        console.log(JSON.stringify({ repoRoot, result }, null, 2));
      })
  )
  .addCommand(
    new Command('children')
      .description('List direct children in the AST containment graph')
      .argument('<id>', 'Parent id (ref_id or file_id)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--as-file', 'Treat <id> as a repository-relative file path and hash it to file_id', false)
      .action(async (id, options) => {
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const parentId = options.asFile ? sha256Hex(`file:${String(id)}`) : String(id);
        const result = await runAstGraphQuery(repoRoot, buildChildrenQuery(), { parent_id: parentId });
        console.log(JSON.stringify({ repoRoot, parent_id: parentId, result }, null, 2));
      })
  );

