import { Command } from 'commander';
import path from 'path';
import fs from 'fs-extra';
import { resolveGitRoot } from '../core/git';

async function findPackageRoot(startDir: string): Promise<string> {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const pj = path.join(cur, 'package.json');
    if (await fs.pathExists(pj)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir);
}

async function listDirNames(p: string): Promise<string[]> {
  if (!await fs.pathExists(p)) return [];
  const entries = await fs.readdir(p);
  const out: string[] = [];
  for (const n of entries) {
    const full = path.join(p, n);
    try {
      const st = await fs.stat(full);
      if (st.isDirectory()) out.push(n);
    } catch {
    }
  }
  return out.sort();
}

export const agentCommand = new Command('agent')
  .description('Install Agent skills/rules templates into a target directory')
  .alias('trae')
  .addCommand(
    new Command('install')
      .description('Install skills/rules templates (default: <repoRoot>/.trae)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--to <dir>', 'Destination .trae directory (overrides --path)', '')
      .option('--overwrite', 'Overwrite existing files', false)
      .action(async (options) => {
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const destTraeDir = String(options.to ?? '').trim() ? path.resolve(String(options.to)) : path.join(repoRoot, '.trae');
        const overwrite = Boolean(options.overwrite ?? false);

        const packageRoot = await findPackageRoot(__dirname);
        const srcTraeDir = path.join(packageRoot, '.trae');
        const srcSkillsDir = path.join(srcTraeDir, 'skills');
        const srcRulesDir = path.join(srcTraeDir, 'rules');
        if (!await fs.pathExists(srcSkillsDir) || !await fs.pathExists(srcRulesDir)) {
          console.log(JSON.stringify({ ok: false, repoRoot, error: 'template_missing', srcTraeDir }, null, 2));
          process.exitCode = 2;
          return;
        }

        const dstSkillsDir = path.join(destTraeDir, 'skills');
        const dstRulesDir = path.join(destTraeDir, 'rules');
        await fs.ensureDir(destTraeDir);
        await fs.copy(srcSkillsDir, dstSkillsDir, { overwrite });
        await fs.copy(srcRulesDir, dstRulesDir, { overwrite });

        const installed = {
          skills: await listDirNames(dstSkillsDir),
          rules: await listDirNames(dstRulesDir),
        };
        console.log(JSON.stringify({ ok: true, repoRoot, destTraeDir, overwrite, installed }, null, 2));
      })
  );
