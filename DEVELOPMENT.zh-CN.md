# 开发指引

**简体中文** | [English](./DEVELOPMENT.md)

## 先决条件
- Node.js 18+（建议 20+）
- Git（可选：git-lfs）

### Windows / Linux 安装注意
- `@lancedb/lancedb` 使用 N-API 预编译包，支持 win32/linux/darwin（x64/arm64）。如果安装失败，优先确认：Node 版本 >=18 且架构是 x64/arm64。
- `tree-sitter` / `tree-sitter-typescript` 依赖原生扩展，通常会拉取预编译包；若你的平台/Node 版本没有命中预编译包，则需要本机编译工具链：
  - Windows：安装 “Visual Studio Build Tools（C++）” 与 Python（node-gyp 需要）
  - Linux：安装 `build-essential`、`python3`（不同发行版包名略有差异）

## 安装依赖与构建

```bash
npm i
npm run build
```

本项目使用 TypeScript 编译输出到 `dist/`。

## 本地运行（开发态）

```bash
npm run start -- --help
```

建议用 `node dist/bin/git-ai.js ...` 验证打包后的行为：

```bash
npm run build
node dist/bin/git-ai.js --help
node dist/bin/git-ai.js ai --help
```

## 全局安装（本机验证）

```bash
npm i -g .
git-ai --version
```

## 端到端测试

```bash
npm test
```

测试会在临时目录创建两类仓库（Spring Boot / Vue）并验证：
- `git-ai` 代理 git 的常用命令
- `git-ai ai index/pack/unpack/hooks`
- MCP server 的工具暴露

## 常用开发工作流

### 1) 在任意仓库里跑索引

```bash
cd /path/to/repo
git-ai ai index --overwrite
git-ai ai pack
```

### 2) 安装 hooks（让索引随提交自动更新）

```bash
git-ai ai hooks install
git-ai ai hooks status
```

### 3) 启动 MCP Server（供 Agent 查询）

```bash
git-ai ai serve
```

如果宿主无法保证工作目录指向仓库目录，可以先让 Agent 调用 `set_repo({path: ...})`，或在工具参数里传 `path`。

## 发布注意事项（npm）
- 确保 `npm run build` 已生成 `dist/**`
- `package.json` 的 `files` 字段已包含 `dist/**` 与 `assets/**`
- 发布前确认未提交任何敏感信息（token/密钥）

### GitHub Actions（归档 + GitHub Packages）
仓库已提供发布工作流：当推送 tag `v*` 时，会：
- `npm ci` + `npm test`
- `npm pack` 生成 tgz 并作为 Release 资产上传
- 发布到 GitHub Packages（npm.pkg.github.com）

说明：
- GitHub Packages 的 npm 包名需要 scope，工作流会在发布时临时把包名改为 `@<repo_owner>/git-ai`（不修改仓库内源码包名）。
- 如需同时发布 npmjs.org，请在仓库 Secrets 配置 `NPM_TOKEN`。
