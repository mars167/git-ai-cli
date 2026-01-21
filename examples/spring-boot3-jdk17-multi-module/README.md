# Spring Boot 3 + JDK17 多模块 Maven Demo

父级 `pom.xml`（packaging=pom）+ 两个子模块（`app` + `lib`），用于验证 `git-ai` 在多模块 Spring Boot 项目里的索引能力。

快速验证（不需要构建）：

```bash
git-ai ai index --overwrite
git-ai ai query MultiModuleApplication
git-ai ai query PingController
git-ai ai query GreetingService
```

