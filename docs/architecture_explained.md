# 技术架构与选型深度解析

本文档旨在从架构设计角度，深入剖析 `git-ai` 的核心实现原理、关键技术选型及其背后的决策逻辑。适用于技术评审、架构选型参考及二次开发指导。

## 1. 核心架构设计理念

`git-ai` 的设计目标是构建一个**轻量级、去中心化、零依赖**的代码库语义索引引擎。不同于传统的集中式代码搜索服务（如 Sourcegraph），`git-ai` 采用“Client-Side Indexing”模式，将索引能力下沉至开发者本地环境。

### 1.1 设计哲学：Hybrid RAG 与 高召回策略

我们采用了 **Hybrid RAG (混合检索增强生成)** 的设计思想，通过不同组件的协同来平衡检索的精度与召回率。核心原则是 **"Recall over Precision"（召回优于精度）** —— 宁可多搜几个交给 AI (LLM) 去过滤，也绝不漏掉潜在的关键信息。

*   **Tree-sitter (骨架提取)**：负责“精准”的结构化数据。提取代码的类、方法、接口定义，构建代码的“骨架”。
*   **CozoDB (关联推导)**：负责“逻辑”连接。处理继承、实现、包含等图关系，支持多跳查询（如“查找所有子类”）。
*   **LanceDB (语义仲裁)**：负责“模糊”召回。通过 Hash Embedding 捕捉代码的语义特征，即使不知道确切名字，也能通过上下文找到相关代码。
*   **AI (最终过滤)**：作为 RAG 的最后一环，LLM 利用其强大的理解能力，对召回的混合结果进行 Re-ranking 和精确过滤。

**核心约束：**
*   **零环境依赖**：不依赖 Docker、JVM、Python 环境，开箱即用。
*   **纯本地运行**：数据隐私优先，无需上传代码至云端。
*   **高性能**：毫秒级检索，索引体积可控（通常 < 代码体积的 20%）。

---

## 2. 索引流水线 (Indexing Pipeline)

索引构建过程是一个典型的 ETL (Extract, Transform, Load) 流程，分为三个阶段：

### 2.1 结构化解析 (Parsing & Chunking)

为了解决传统基于行的分片（Line-based Chunking）导致的语义截断问题，我们采用了基于 AST（抽象语法树）的结构化分片策略。

*   **技术选型：Tree-sitter**
    *   **背景**：GitHub Atom 团队开发的增量解析系统，现已成为代码解析领域的工业标准。
    *   **实现机制**：通过 `tree-sitter-{lang}` 生成具体语言的 CST (Concrete Syntax Tree)，再通过遍历算法提取 Symbol（类、函数、接口）及其上下文（Range）。
    *   **优势**：
        *   **多语言支持**：通过统一的 WASM/Node.js 绑定支持几十种主流语言。
        *   **容错性**：即使代码存在语法错误，仍能构建部分 AST，保证索引鲁棒性。
        *   **性能**：基于 C 编写，解析速度极快（单文件 < 10ms）。

### 2.2 向量化 (Embedding)

这是将非结构化代码转换为结构化向量的关键步骤。

*   **技术选型：Random Indexing (Deterministic Hash Embedding)**
    *   **背景**：一种降维技术，基于 Johnson-Lindenstrauss 引理（高维空间中的随机向量近似正交）。
    *   **实现机制**：
        1.  **Tokenization**：对代码标识符进行分词与归一化。
        2.  **Hashing**：计算 Token 的 SHA-256 哈希。
        3.  **Projection**：将哈希映射到固定维度（如 256 维）的稀疏向量中（+1/-1）。
        4.  **Aggregation**：叠加所有 Token 向量并归一化。
    *   **决策依据（VS 深度学习模型）**：
        *   **Transformer 模型 (如 BERT/OpenAI)**：虽然语义理解强，但模型文件巨大（数百 MB）、推理延迟高、且通常需要 GPU 或云端 API，违背了“轻量级 CLI”的设计初衷。
        *   **Hash Embedding**：虽然无法捕捉同义词语义（如 Login ≈ SignIn），但在代码搜索场景中，**精确的标识符匹配**（Identifier Match）往往比模糊语义更重要。该方案实现了**零模型文件依赖、纳秒级推理速度**。

### 2.3 关系图谱构建 (Knowledge Graph)

为了弥补向量检索在结构化查询（如继承关系、嵌套结构）上的不足，我们同步构建了 AST 关系图。

*   **模型设计**：
    *   **节点**：File, Symbol (Class, Method, Interface)
    *   **边**：Contains (包含), Extends (继承), Implements (实现)
    *   *注：当前版本主要关注“定义（Definition）”关系，暂未包含“引用（Reference/Call Graph）”关系，以保持索引构建的轻量化。*
*   **存储**：将 AST 关系降维为 Datalog 事实表（Facts），存入图数据库。

---

## 3. 存储引擎选型 (Storage Engine)

我们采用了“双引擎”策略，分别处理向量检索和图查询。

### 3.1 向量存储：LanceDB

*   **技术背景**：基于 Apache Arrow 和 Lance 数据格式的新一代向量数据库。
*   **选型理由**：
    *   **Serverless 架构**：不同于 Milvus/Qdrant 需要独立服务进程，LanceDB 是嵌入式的（类似 SQLite），数据即文件。
    *   **列式存储**：原生支持 Arrow 格式，Zero-copy 读取，极大降低内存开销。
    *   **多模态支持**：单表支持向量索引（IVF-PQ）与标量字段（全文检索），便于混合查询。
    *   **Rust 内核**：保证了极高的 I/O 吞吐和稳定性。

### 3.2 图存储：CozoDB

*   **技术背景**：基于 Datalog 的事务型、关系型/图混合数据库。
*   **选型理由**：
    *   **递归查询能力**：原生支持 Datalog 推理规则，能够优雅处理代码中的递归结构（如多层继承链、模块依赖树），这是标准 SQL (SQLite) 难以高效实现的。
    *   **轻量级嵌入**：底层存储引擎可插拔（支持 RocksDB, SQLite, Sled），我们默认使用 SQLite 后端，保持了单文件部署的简洁性。
    *   **WASM 支持**：具备回退到纯内存 WASM 模式的能力，保证在极端环境下的可用性。

---

## 4. 技术栈横向对比 (Benchmark & Comparison)

| 维度 | git-ai (本方案) | Sourcegraph (Zoekt) | CTags / GTags | 基于 OpenAI 的方案 |
| :--- | :--- | :--- | :--- | :--- |
| **核心算法** | Hash Embedding + AST Graph | Trigram Index (N-gram) | 正则/词法分析 | LLM Embedding |
| **检索模式** | 混合检索 (语义+结构) | 精确/正则匹配 | 符号跳转 | 纯语义相似度 |
| **依赖环境** | Node.js Runtime (零外部依赖) | Go Server, Docker | C 编译环境 | Python/GPU/API Key |
| **索引体积** | 小 (~15-20%) | 中等 (~30%) | 极小 (<5%) | 极大 (向量维度高) |
| **语义理解** | 中 (基于词袋模型) | 无 | 无 | 高 |
| **部署成本** | **极低 (CLI 工具)** | 高 (需运维集群) | 低 | 中/高 |

## 5. 总结与展望

`git-ai` 的架构本质上是在**检索效果**与**工程成本**之间寻找的一个极致平衡点。

通过 **Tree-sitter + Hash Embedding + LanceDB + CozoDB** 的组合，我们在不引入任何重型依赖的前提下，实现了对代码库的**语义级（Vector）**和**结构级（Graph）**的双重索引。这种架构特别适合作为 AI Agent 的“代码知识外脑”，为其提供精准、快速的上下文检索能力。
