# Windows 开发与安装指引

**简体中文** | [English](../windows-setup.md)

本指引介绍如何在 Windows 上设置 `git-ai` 的开发环境，特别是针对多语言支持（C、Go、Python、PHP、Rust）。

## 前置条件

1.  **Node.js**: 从 [nodejs.org](https://nodejs.org/) 安装 Node.js (推荐 LTS 版本)。
2.  **Git**: 从 [git-scm.com](https://git-scm.com/) 安装 Git for Windows。

## 原生依赖构建工具

`git-ai` 依赖以下包含原生绑定的库：
*   `tree-sitter`: 用于代码解析 (C++)
*   `cozo-node`: 图数据库引擎 (Rust/C++)

虽然这些库通常提供预编译二进制包，但在某些环境（如 Node 版本不匹配或特定系统架构）下可能需要从源码编译。因此建议准备好编译环境。

### 选项 1: 通过管理员 PowerShell 安装 (推荐)

以管理员身份打开 PowerShell 并运行：

```powershell
npm install --global --production windows-build-tools
```

*注意：此包有时会过时或有问题。如果卡住或失败，请使用选项 2。*

### 选项 2: 手动安装

1.  **Python**: 从 [python.org](https://www.python.org/) 或 Microsoft Store 安装 Python 3。
2.  **Visual Studio Build Tools**:
    *   下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)。
    *   运行安装程序并选择 **"Desktop development with C++" (使用 C++ 的桌面开发)** 工作负载。
    *   确保选中 "MSVC ... C++ x64/x86 build tools" 和 "Windows 10/11 SDK"。

## 安装

满足前置条件后：

```bash
git clone https://github.com/mars167/git-ai-cli.git
cd git-ai-cli-v2
npm install
npm run build
```

## 运行示例

要验证对不同语言的支持，可以运行解析测试：

```bash
npx ts-node test/verify_parsing.ts
```

要完整开发多语言示例，你可能需要安装各自的语言运行时：

*   **C**: 安装 MinGW 或使用 MSVC (cl.exe)。
*   **Go**: 从 [go.dev](https://go.dev/dl/) 安装。
*   **Python**: [python.org](https://www.python.org/)。
*   **PHP**: 从 [windows.php.net](https://windows.php.net/download/) 下载。添加到 PATH。
*   **Rust**: 通过 [rustup.rs](https://rustup.rs/) 安装。

## 排障

*   **node-gyp 错误**: 确保 Python 和 Visual Studio Build Tools 已正确安装并在 PATH 中。你可以配置 npm 使用特定 python 版本：`npm config set python python3`。
*   **路径问题**: 如果全局运行，确保 `git-ai` 二进制文件或 `npm bin` 在你的 PATH 中。
