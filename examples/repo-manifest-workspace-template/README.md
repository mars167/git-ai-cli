# Repo Manifest Workspace Template

这个模版用于验证 “manifest 仓库（`.repo/manifests`）通过 ref 指针按需查询子仓库索引” 的能力。

## 使用

在本仓库根目录先构建一次：

```bash
npm run build
```

初始化一个本地 workspace（会创建在 `examples/repo-manifest-workspace-template/ws/`，并自动 `git init` + `commit`）：

```bash
node examples/repo-manifest-workspace-template/init-workspace.mjs
```

在 manifest 仓库里运行查询（注意：运行目录是 `ws/.repo/manifests`）。若子仓库缺少索引，会在子仓库内按需构建索引：

```bash
cd examples/repo-manifest-workspace-template/ws/.repo/manifests
node ../../../../../dist/bin/git-ai.js ai query BController --limit 20
```

预期：`ai query` 的结果里会出现 `project-b/src/main/java/.../BController.java` 之类的路径（来自 workspace 的子仓库）。
