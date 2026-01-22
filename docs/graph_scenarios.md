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
    "headers": ["ref_id", "file", "name", "kind", "signature", "start_line", "end_line"],
    "rows": [
      ["...", "src/mcp/server.ts", "GitAIV2MCPServer", "class", "class GitAIV2MCPServer", 16, 120]
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
    "headers": ["child_id", "file", "name", "kind", "signature", "start_line", "end_line"],
    "rows": [
      ["...", "src/mcp/server.ts", "GitAIV2MCPServer", "class", "class GitAIV2MCPServer", 16, 120]
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
  *ast_symbol{ref_id: sub_id, name, file, kind, start_line, end_line}
```

**CLI 命令：**
```bash
git-ai ai graph query "?[name, file] := *ast_extends_name{sub_id, super_name: 'BaseCommand'}, *ast_symbol{ref_id: sub_id, name, file, kind, signature, start_line, end_line}"
```

### 场景：查找某个接口的所有实现 (Find Implementations)

假设你想找所有实现了 `Runnable` 接口的类。

**CozoScript:**
```cozo
?[name, file] := 
  *ast_implements_name{sub_id, iface_name: 'Runnable'},
  *ast_symbol{ref_id: sub_id, name, file, kind, start_line, end_line}
```

**CLI 命令：**
```bash
git-ai ai graph query "?[name, file] := *ast_implements_name{sub_id, iface_name: 'Runnable'}, *ast_symbol{ref_id: sub_id, name, file, kind, signature, start_line, end_line}"
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

**注意**：目前的 AST 图谱主要存储**定义（Definition）**和**声明关系**，**不包含**全量的函数调用图（Call Graph）或变量引用。

### 替代方案

要查找“哪里使用了这个类/方法”，推荐使用 **Symbol 搜索** 或 **文本搜索**：

**方法 A：使用 Symbol 搜索（推荐）**
查找包含该符号名的所有索引记录（包括定义和部分上下文）：
```bash
git-ai ai query "MySymbol" --mode wildcard
```

**方法 B：使用 Grep（最准确的文本匹配）**
直接在仓库中搜索字符串：
```bash
git grep "MySymbol"
```

---

## 附录：数据表结构参考

如果你想编写更复杂的查询，可以参考以下表结构：

- **`ast_file`**: `{ file_id, file }`
- **`ast_symbol`**: `{ ref_id, file, name, kind, signature, start_line, end_line }`
- **`ast_contains`**: `{ parent_id, child_id }` （parent_id 可能是 file_id 或 ref_id）
- **`ast_extends_name`**: `{ sub_id, super_name }`
- **`ast_implements_name`**: `{ sub_id, iface_name }`
