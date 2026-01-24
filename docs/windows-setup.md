# Windows Development and Installation Guide

[简体中文](./zh-CN/windows-setup.md) | **English**

This guide describes how to set up the development environment for `git-ai` on Windows, specifically for the multi-language support (C, Go, Python, PHP, Rust).

## Prerequisites

1.  **Node.js**: Install Node.js (LTS version recommended) from [nodejs.org](https://nodejs.org/).
2.  **Git**: Install Git for Windows from [git-scm.com](https://git-scm.com/).

## Build Tools for Native Dependencies

`git-ai` relies on libraries with native bindings:
*   `tree-sitter`: For code parsing (C++)
*   `cozo-node`: Graph database engine (Rust/C++)

While these libraries typically provide prebuilt binaries, you may need to build from source in certain environments (e.g., mismatched Node versions or specific architectures). Therefore, setting up a build environment is recommended.

### Option 1: Install via Admin PowerShell (Recommended)

Open PowerShell as Administrator and run:

```powershell
npm install --global --production windows-build-tools
```

*Note: This package is sometimes deprecated or problematic. If it hangs or fails, use Option 2.*

### Option 2: Manual Installation

1.  **Python**: Install Python 3 from [python.org](https://www.python.org/) or the Microsoft Store.
2.  **Visual Studio Build Tools**:
    *   Download [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
    *   Run the installer and select the **"Desktop development with C++"** workload.
    *   Ensure "MSVC ... C++ x64/x86 build tools" and "Windows 10/11 SDK" are selected.

## Installation

Once prerequisites are met:

```bash
git clone https://github.com/mars167/git-ai-cli.git
cd git-ai-cli-v2
npm install
npm run build
```

## Running Examples

To verify support for different languages, you can run the parsing test:

```bash
npx ts-node test/verify_parsing.ts
```

To fully develop with the polyglot examples, you may need to install the respective language runtimes:

*   **C**: Install MinGW or use MSVC (cl.exe).
*   **Go**: Install from [go.dev](https://go.dev/dl/).
*   **Python**: [python.org](https://www.python.org/).
*   **PHP**: Download from [windows.php.net](https://windows.php.net/download/). Add to PATH.
*   **Rust**: Install via [rustup.rs](https://rustup.rs/).

## Troubleshooting

*   **node-gyp errors**: Ensure Python and Visual Studio Build Tools are correctly installed and in PATH. You can configure npm to use a specific python version: `npm config set python python3`.
*   **Path issues**: Ensure `git-ai` binary or `npm bin` is in your PATH if running globally.
