# Rules

## 规则
- 优先用 git-ai MCP；若 `index_status` 可用先检查；不可用才用传统命令。
- 索引只针对当前 HEAD；不在查询接口显式建模版本/分支。
- 索引数据可被 Git 管理；不写入敏感信息。
- TypeScript strict；不引入外部 embedding；CLI 输出尽量 JSON。
