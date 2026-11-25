# Rust 概览

Tauri 的 Rust 侧负责桌面宿主。后续由 Rust 承担代码生成，使设计结果可以交给车辆工程接入。生成接口和产物布局由后续任务确认。

- [main.rs](../src/main.rs) 和 [lib.rs](../src/lib.rs) 是当前启动与命令注册入口。
- [Cargo.toml](../Cargo.toml) 记录 Rust 依赖，[tauri.conf.json](../tauri.conf.json) 记录桌面开发和打包配置，应用图标位于 [icons](../icons/)。
- 了解 Rust 能力如何进入用户流程，返回[前端模块导航](../../src/AGENTS.md)。
