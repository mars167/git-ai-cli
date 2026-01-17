import { Command } from 'commander';
import path from 'path';
import { resolveGitRoot } from '../core/git';
import { unpackLanceDb } from '../core/archive';

export const unpackCommand = new Command('unpack')
  .description('Unpack .git-ai/lancedb.tar.gz into .git-ai/lancedb')
  .option('-p, --path <path>', 'Path inside the repository', '.')
  .action(async (options) => {
    const repoRoot = await resolveGitRoot(path.resolve(options.path));
    const unpacked = await unpackLanceDb(repoRoot);
    console.log(JSON.stringify({ repoRoot, ...unpacked }, null, 2));
  });

