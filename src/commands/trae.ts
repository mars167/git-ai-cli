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
      .description('Install skills/rules templates (default: <repoRoot>/.agents)')
      .option('-p, --path <path>', 'Path inside the repository', '.')
      .option('--to <dir>', 'Destination directory (overrides default)', '')
      .option('--agent <agent>', 'Template layout: agents|trae', 'agents')
      .option('--overwrite', 'Overwrite existing files', false)
      .action(async (options) => {
        const repoRoot = await resolveGitRoot(path.resolve(options.path));
        const agent = String((options as any).agent ?? 'agents').trim().toLowerCase();
        const defaultDirName = agent === 'trae' ? '.trae' : '.agents';
        const destDir = String(options.to ?? '').trim() ? path.resolve(String(options.to)) : path.join(repoRoot, defaultDirName);
        const overwrite = Boolean(options.overwrite ?? false);

        const packageRoot = await findPackageRoot(__dirname);
        const srcTemplateDir = path.join(packageRoot, 'templates', 'agents', 'common');
        const srcSkillsDir = path.join(srcTemplateDir, 'skills');
        const srcRulesDir = path.join(srcTemplateDir, 'rules');
        if (!await fs.pathExists(srcSkillsDir) || !await fs.pathExists(srcRulesDir)) {
          console.log(JSON.stringify({ ok: false, repoRoot, error: 'template_missing', srcTemplateDir }, null, 2));
          process.exitCode = 2;
          return;
        }

        const dstSkillsDir = path.join(destDir, 'skills');
        const dstRulesDir = path.join(destDir, 'rules');
        await fs.ensureDir(destDir);
        await fs.copy(srcSkillsDir, dstSkillsDir, { overwrite });
        await fs.copy(srcRulesDir, dstRulesDir, { overwrite });

        const installed = {
          skills: await listDirNames(dstSkillsDir),
          rules: await listDirNames(dstRulesDir),
        };
        console.log(JSON.stringify({ ok: true, repoRoot, agent, destDir, overwrite, installed }, null, 2));
      })
  );
