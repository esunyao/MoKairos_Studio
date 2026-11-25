# 前端模块架构说明

React 19 + TypeScript 前端承担界面展示、Konva 1920×1080 协议级画布编辑、本地 HUD 模拟及 CMake 接入模拟预览。工程严格拆分业务逻辑与界面视图：

- **[domain/](../domain/)**：零 UI 依赖的纯 TypeScript 领域引擎（2027 协议常量、RM 左下角原点 ↔ Konva 左上角原点几何换算、3 字节命名器、7/5/2/1+60B 拆包预算、CRC8/16 与 `0x0301` 封帧、协议预检、`.rmui` 适配器、版本 Diff 引擎、预设模板及 `Vitest` 单元测试）。
- **[stores/](../stores/)**：按职责切片的 Zustand Store（`useAppStore`、`useProjectStore`、`useDocumentStore`、`useCanvasStore`、`useVersionStore`、`useSimulatorStore`）。
- **[services/](../services/)**：Tauri v2 IPC 与跨平台文件读写桥接，同时兼容浏览器开发预览降级。
- **[hooks/](../hooks/)**：可复用交互逻辑（视口缩放适配、全局快捷键、实时协议诊断）。
- **[components/](../components/)**：基于 Tailwind CSS v4 + Radix UI + `motion` 的通用组件与裁判系统 9 色隔离控件。
- **[features/](../features/)**：五大业务视图（`shell/`、`launchpad/`、`editor/`、`version-control/`、`simulator/`、`export-mock/`）。
- **[styles/](../styles/)**：暗/亮双主题 Token、玻璃质感样式与 `.mk-tabular` 等宽数字规范。
- **[assets/](../assets/)**：原生 `1920×1080` 官方客户端参考底图 `rm-client-background.png`（仅编辑/模拟参考，不参与导出）。

跨端调用与 `.mkui` 压缩包规范请同步核对[Rust 模块导航](../../src-tauri/AGENTS.md)与[项目总览](../../doc/README.md)。
