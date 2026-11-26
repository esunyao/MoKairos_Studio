# `mokairos-codegen` 模块导航

先读[代码生成核总览](doc/README.md)；全局背景见[代码生成专题](../../doc/codegen.md)、[CMake 接入专题](../../doc/cmake.md)与[仓库指南](../../AGENTS.md)。

## 任务 → 读什么

| 任务场景 | 优先阅读 | 核心源码入口 |
| :--- | :--- | :--- |
| 修改权威 2027 图元/文字/CRC 编码与向量对齐 | [协议规范](../../doc/protocol.md) | [encode.rs](src/protocol/encode.rs)、[crc.rs](src/protocol/crc.rs)、[validate.rs](src/protocol/validate.rs) |
| 修改 `profile.toml` 字段、校验规则或官方预设 | [代码生成专题](../../doc/codegen.md) | [schema.rs](src/profile/schema.rs)、[presets.rs](src/profile/presets.rs)、[validate.rs](src/profile/validate.rs)、[profiles/](profiles/) |
| 修改纯 Rust 无损 C 函数分块与节点回写 | [代码生成核总览](doc/README.md) | [parser.rs](src/codefile/parser.rs)、[patch.rs](src/codefile/patch.rs) |
| 修改 DAG 节点图编译与强类型端口推断 | [代码生成专题](../../doc/codegen.md) | [compile.rs](src/flow/compile.rs) |
| 修改 MiniJinja 生成模板、`generated/`/`custom/` 写入 | [代码生成专题](../../doc/codegen.md) | [render.rs](src/generate/render.rs)、[write.rs](src/generate/write.rs)、[templates/official/](templates/official/) |
| 修改 `MoKairosUI.cmake` 模板或 `mokairos-ui` CLI 参数 | [CMake 接入专题](../../doc/cmake.md) | [cmake_export.rs](src/cmake_export.rs)、[MoKairosUI.cmake.j2](templates/cmake/MoKairosUI.cmake.j2)、[mokairos-ui.rs](src/bin/mokairos-ui.rs) |
