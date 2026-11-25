# MoKairos Studio

面向 RoboMaster 2027 通信协议的跨平台桌面 UI 设计工具（Windows / macOS / Linux），基于 **Tauri v2 + React 19 + TypeScript + Konva + Rust** 构建。

- **可视化编辑**：`1920×1080` 标准画布、8 类协议图元、9 色严格隔离、Safe Area 官方遮挡禁区预警、明暗双主题与玻璃质感交互。
- **`.mkui` 归档与版本控制**：`.mkui` 本质为 ZIP 压缩包，内部使用 MessagePack 编码存储设计与版本快照，支持提交、结构化 Diff 对比、一键回滚与兼容导入/导出 `.rmui`。
- **模拟与交付预览**：内置本地 HUD 遥测模拟器与 `0x0301` 协议帧日志，并提供配套 CMake 与 `UICRM-Embedded` 接入模拟预览页。

## 快速开始

```bash
pnpm install
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

项目完整目录结构、架构分层与交接文档请阅读 [项目概览与目录说明](doc/README.md)，开发与提交规范见 [仓库指南](AGENTS.md)。
