# AST 图谱实战指南

`git-ai ai graph` 命令提供了强大的代码结构查询能力。本文档通过实际场景，介绍如何查找定义、结构、继承关系等。

## 1. 查找定义 (Find Definitions)

### 场景：我知道一个类或方法的名字（或前缀），想找到它在哪里定义。

**命令：**
```bash
# 查找名字以 "GitAI" 开头的符号
git-ai ai graph find "GitAI"
```

**输出示例：**
```json
{
  "repoRoot": "/path/to/repo",
  "result": {
    "headers": ["ref_id", "file", "lang", "name", "kind", "signature", "start_line", "end_line"],
    "rows": [
      ["...", "src/mcp/server.ts", "ts", "GitAIV2MCPServer", "class", "class GitAIV2MCPServer", 16, 120]
    ]
  }
}
```

> **提示**：如果你只记得模糊的名字（如 `*Server`），建议使用 `ai query` 命令配合 wildcard 模式：
> ```bash
> git-ai ai query "*Server" --mode wildcard
> ```

---

## 2. 查看文件结构 (File Structure)

### 场景：我想知道某个文件里定义了哪些类、函数或接口。

**命令：**
使用 `children` 子命令，并加上 `--as-file` 参数，直接传文件路径：

```bash
# 查看 src/mcp/server.ts 里的顶层符号
git-ai ai graph children src/mcp/server.ts --as-file
```

**输出示例：**
```json
{
  "result": {
    "headers": ["child_id", "file", "lang", "name", "kind", "signature", "start_line", "end_line"],
    "rows": [
      ["...", "src/mcp/server.ts", "ts", "GitAIV2MCPServer", "class", "class GitAIV2MCPServer", 16, 120]
    ]
  }
}
```

### 场景：我想进一步看某个类里有哪些方法。

**步骤：**
1. 从上一步结果中复制类的 `child_id`（即 `ref_id`）。
2. 再次运行 `children` 命令（这次不需要 `--as-file`）。

```bash
git-ai ai graph children <ref_id_from_previous_step>
```

---

## 3. 查找继承与实现 (Inheritance & Implementation)

这部分需要使用 `git-ai ai graph query` 执行 CozoScript。CozoScript 是一种类似 Datalog 的逻辑查询语言。

### 场景：查找某个类的所有子类 (Find Subclasses)

假设你想找所有继承自 `BaseCommand` 的类。

**CozoScript:**
```cozo
?[name, file, start_line] := 
  *ast_extends_name{sub_id, super_name: 'BaseCommand'},
  *ast_symbol{ref_id: sub_id, name, file, lang, kind, signature, start_line, end_line}
```

**CLI 命令：**
```bash
git-ai ai graph query "?[name, file, lang] := *ast_extends_name{sub_id, super_name: 'BaseCommand'}, *ast_symbol{ref_id: sub_id, name, file, lang, kind, signature, start_line, end_line}"
```

### 场景：查找某个接口的所有实现 (Find Implementations)

假设你想找所有实现了 `Runnable` 接口的类。

**CozoScript:**
```cozo
?[name, file] := 
  *ast_implements_name{sub_id, iface_name: 'Runnable'},
  *ast_symbol{ref_id: sub_id, name, file, lang, kind, start_line, end_line}
```

**CLI 命令：**
```bash
git-ai ai graph query "?[name, file, lang] := *ast_implements_name{sub_id, iface_name: 'Runnable'}, *ast_symbol{ref_id: sub_id, name, file, lang, kind, signature, start_line, end_line}"
```

### 场景：查找某个类的父类 (Find Parent Class)

假设你想知道 `MyClass` 继承了谁。

**CozoScript:**
```cozo
?[super_name] := 
  *ast_symbol{ref_id, name: 'MyClass'},
  *ast_extends_name{sub_id: ref_id, super_name}
```

---

## 4. 查找引用 (Find References/Usages)

AST 图谱现在支持一部分“引用/调用”能力（基于语法树的启发式抽取，按**名字**关联），可用于快速回答：
- “这个方法/函数被谁调用？”
- “从这个方法往下会调用到哪些方法（近似调用链）？”
- “某个符号名在仓库里有哪些引用位置（call/new/type）？”

### 4.1 查引用位置（按名字）

```bash
git-ai ai graph refs "MySymbol"
```

### 4.2 查调用者 / 被调用者（按名字）

```bash
git-ai ai graph callers "greet"
git-ai ai graph callees "hello"
```

### 4.3 近似调用链（按名字 + 深度）

```bash
# 从 greet 向上找：谁调用了它、再往上是谁调用了调用者...
git-ai ai graph chain "greet" --direction upstream --depth 3 --lang java

# 从 hello 向下找：hello 里调用了什么、被调用者又调用了什么...
git-ai ai graph chain "hello" --direction downstream --depth 3 --lang ts
```

### 性能与准确性提示（很重要）

- `chain` 是“按名字”的启发式调用链：每一跳都会把 `callee_name` 与全仓库同名符号做匹配，跨语言/跨目录也会互相影响
- 当链路中出现高频通用名字（如 `remove` / `update` / `get` / `list`），同名符号会指数级放大，中间结果暴涨，导致查询变慢
- 更稳的用法：
  - 优先用 `callers` 精确定位“谁调用了 X”（一跳）
  - 调小 `--depth`（建议从 1/2 开始）
  - 配合 `--limit` 控制返回规模
  - 明确指定语言，避免跨语言噪声：`--lang java` 或 `--lang ts`
  - 如果输出里出现大量单字母（常见于压缩/混淆后的前端代码），用 `chain --min-name-len 2` 过滤掉短名字

---

## 附录：数据表结构参考

如果你想编写更复杂的查询，可以参考以下表结构：

- **`ast_symbol`**: `{ ref_id, file, lang, name, kind, signature, start_line, end_line }`
- **`ast_file`**: `{ file_id, file, lang }`
- **`ast_contains`**: `{ parent_id, child_id }` （parent_id 可能是 file_id 或 ref_id）
- **`ast_extends_name`**: `{ sub_id, super_name }`
- **`ast_implements_name`**: `{ sub_id, iface_name }`
- **`ast_ref_name`**: `{ from_id, from_lang, name, ref_kind, file, line, col }` （ref_kind: call/new/type）
- **`ast_call_name`**: `{ caller_id, caller_lang, callee_name, file, line, col }`
