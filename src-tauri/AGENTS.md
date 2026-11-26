# Rust 模块导航

先读[Rust 模块总览](doc/README.md)；了解项目整体架构与全局约定，见[公开文档总纲](../doc/README.md)和[仓库指南](../AGENTS.md)。

## 任务 → 读什么

| 任务场景 | 优先阅读 | 核心源码入口 |
| :--- | :--- | :--- |
| 修改 `.mkui` ZIP/MessagePack 打包、安全校验或快照版本控制 | [归档与版本内核说明](doc/archive.md) | [snapshot.rs](src/versioning/snapshot.rs)、[mokairos-codegen/archive](../crates/mokairos-codegen/src/archive/) |
| 修改 Tauri IPC 命令、代码生成后端桥接或窗口权限 | [命令契约与权限说明](doc/commands.md) | [lib.rs](src/lib.rs)、[codegen_cmd.rs](src/commands/codegen_cmd.rs)、[default.json](capabilities/default.json) |
| 修改代码生成引擎、预设与 CMake 导出逻辑 | [代码生成引擎导航](../crates/mokairos-codegen/AGENTS.md) | [crates/mokairos-codegen/src/](../crates/mokairos-codegen/src/) |
| 对接前端消费或数据类型定义 | [前端模块导航](../src/AGENTS.md) | [crates/mokairos-codegen/src/model/](../crates/mokairos-codegen/src/model/) |
