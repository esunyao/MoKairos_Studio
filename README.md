# MoKairos Studio

面向 RoboMaster 2027 通信协议的跨平台桌面 UI 设计工具（Windows / macOS / Linux），基于 **Tauri v2 + React 19 + TypeScript + Konva + Rust** 构建。

- **可视化编辑**：`1920×1080` 标准客户端画布、8 类协议图元、9 色严格隔离、自定义右键菜单、中键 / `Alt` 临时平移画布、明暗双主题与玻璃质感交互。
- **`.mkui` 归档与版本控制**：`.mkui` 本质为 ZIP 压缩包，内部使用 MessagePack 编码存储设计与快照，支持提交、结构化 Diff 对比、一键回滚与兼容导入/导出 `.rmui`。
- **模拟与交付预览**：内置本地 HUD 遥测模拟器与 `0x0301` 协议帧日志，并提供配套 CMake 与 `UICRM-Embedded` 接入模拟预览页。

## 快速开始

```bash
pnpm install
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

完整项目文档请从[公开文档总纲](doc/README.md)开始逐级阅读，开发与审计规范见[仓库指南](AGENTS.md)。
