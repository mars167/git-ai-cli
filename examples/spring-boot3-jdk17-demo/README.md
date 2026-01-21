# Spring Boot 3 + JDK17 Demo（用于 git-ai 索引测试）

该目录是一个最小可用的 Spring Boot 3（JDK17）项目骨架，用于验证 `git-ai ai index/query/semantic` 对 Java 项目的索引能力。

快速验证（不需要真的跑起来）：

```bash
git-ai ai index --overwrite
git-ai ai query HelloController
git-ai ai query greet
```

