# Rules

## 1. 约束
- 索引只针对当前 HEAD 工作区；不在查询接口中显式建模版本/分支。
- 索引数据可被 Git 管理；不写入任何敏感信息。

## 2. 代码规范
- TypeScript strict。
- 不引入外部 embedding 服务依赖（默认使用本地确定性 embedding）。
- 所有 CLI 输出尽量用 JSON，便于实验与自动化。

