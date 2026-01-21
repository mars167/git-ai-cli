import { Command } from 'commander';
import path from 'path';
import { inferScanRoot, resolveGitRoot } from '../core/git';
import { IndexerV2 } from '../core/indexer';

export const indexCommand = new Command('index')
  .description('Build LanceDB+SQ8 index for the current repository (HEAD working tree)')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .option('-d, --dim <dim>', 'Embedding dimension', '256')
  .option('--overwrite', 'Overwrite existing tables', false)
  .action(async (options) => {
    try {
      const repoRoot = await resolveGitRoot(path.resolve(options.path));
      const scanRoot = inferScanRoot(repoRoot);
      const dim = Number(options.dim);
      const overwrite = Boolean(options.overwrite);
      const indexer = new IndexerV2({ repoRoot, scanRoot, dim, overwrite });
      await indexer.run();
      console.log(JSON.stringify({ ok: true, repoRoot, scanRoot, dim, overwrite }, null, 2));
    } catch (e) {
      console.error('Indexing failed:', e);
      process.exit(1);
    }
  });
