import path from 'path';
import fs from 'fs-extra';
import { resolveGitRoot } from '../../core/git';
import { GitAIV2MCPServer } from '../../mcp/server';
import { createLogger } from '../../core/log';
import type { CLIResult, CLIError } from '../types';
import { success, error } from '../types';

export async function handleServe(input: {
  disableMcpLog: boolean;
  http: boolean;
  port: number;
  stateless: boolean;
}): Promise<never> {
  const log = createLogger({ component: 'cli', cmd: 'serve' });
  log.info('serve_start', { 
    disableAccessLog: input.disableMcpLog,
    transport: input.http ? 'http' : 'stdio',
    port: input.http ? input.port : undefined,
    stateless: input.http ? input.stateless : undefined,
  });

  const server = new GitAIV2MCPServer(process.cwd(), {
    disableAccessLog: !!input.disableMcpLog,
    transport: input.http ? 'http' : 'stdio',
    port: input.port,
    stateless: input.stateless,
  });
  await server.start();
  throw new Error('Server should never return');
}

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

export async function handleAgentInstall(input: {
  path: string;
  to?: string;
  agent: string;
  overwrite: boolean;
}): Promise<CLIResult | CLIError> {
  const log = createLogger({ component: 'cli', cmd: 'agent:install' });
  const startedAt = Date.now();

  try {
    const repoRoot = await resolveGitRoot(path.resolve(input.path));
    const agent = String(input.agent).trim().toLowerCase();
    const defaultDirName = agent === 'trae' ? '.trae' : '.agents';
    const destDir = String(input.to ?? '').trim() ? path.resolve(String(input.to)) : path.join(repoRoot, defaultDirName);
    const overwrite = Boolean(input.overwrite);

    const packageRoot = await findPackageRoot(__dirname);
    const srcTemplateDir = path.join(packageRoot, 'templates', 'agents', 'common');
    const srcSkillsDir = path.join(srcTemplateDir, 'skills');
    const srcRulesDir = path.join(srcTemplateDir, 'rules');
    if (!await fs.pathExists(srcSkillsDir) || !await fs.pathExists(srcRulesDir)) {
      log.error('agent_install', { ok: false, error: 'template_missing', srcTemplateDir });
      return error('template_missing', { repoRoot, message: 'Template directory missing' });
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

    log.info('agent_install', {
      ok: true,
      repoRoot,
      agent,
      destDir,
      overwrite,
      installed,
      duration_ms: Date.now() - startedAt,
    });

    return success({ ok: true, repoRoot, agent, destDir, overwrite, installed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('agent_install', { ok: false, err: message });
    return error('agent_install_failed', { message });
  }
}
