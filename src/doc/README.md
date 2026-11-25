# 前端模块总览

React 19 + TypeScript 前端承担界面渲染、Konva `1920×1080` 协议级画布编辑、本地 HUD 模拟及 CMake 接入模拟预览。工程遵循**页面展示（`features/`）与业务逻辑（`domain/` / `stores/` / `services/` / `hooks/`）严格分离**原则。

## 分模块文档（总 → 分）

| 专题 | 内容范围 |
| :--- | :--- |
| [领域引擎与协议 (`domain/`)](domain.md) | 2027 协议常量、几何变换、分包预算、CRC8/16、`.rmui` 适配器、版本 Diff 与 Vitest 单测 |
| [状态切片与服务 (`stores/` & `services/` & `hooks/`)](state.md) | Zustand 六大 Store、Tauri IPC 桥接、未保存守卫、快捷键与指针平移状态机 |
| [设计系统与界面视图 (`styles/` & `components/` & `features/`)](ui.md) | 明暗双主题、公共复用组件（`toast`、`ContextMenu`、`UnsavedChangesDialog`）与五大视图 |

相关全局文档：[全局架构](../../doc/architecture.md) · [Rust 模块总览](../../src-tauri/doc/README.md)
