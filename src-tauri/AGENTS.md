# Rust 模块导航

先读[Rust 模块总览](doc/README.md)；了解项目整体架构与全局约定，见[公开文档总纲](../doc/README.md)和[仓库指南](../AGENTS.md)。

## 任务 → 读什么

| 任务场景 | 优先阅读 | 核心源码入口 |
| :--- | :--- | :--- |
| 修改 `.mkui` ZIP/MessagePack 打包、安全校验或快照版本控制 | [归档与版本内核说明](doc/archive.md) | [pack.rs](src/archive/pack.rs)、[unpack.rs](src/archive/unpack.rs)、[snapshot.rs](src/versioning/snapshot.rs) |
| 修改 Tauri IPC 命令、窗口权限或 Rust 协议预检 | [命令契约与权限说明](doc/commands.md) | [lib.rs](src/lib.rs)、[commands/](src/commands/)、[default.json](capabilities/default.json) |
| 对接前端消费或数据类型定义 | [前端模块导航](../src/AGENTS.md) | [document.rs](src/model/document.rs)、[archive.rs](src/model/archive.rs) |
