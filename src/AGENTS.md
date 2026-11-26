# 前端模块导航

先读[前端总览](doc/README.md)；了解跨端边界与全局规范，见[公开文档总纲](../doc/README.md)和[仓库指南](../AGENTS.md)。

## 任务 → 读什么

| 任务场景 | 优先阅读 | 核心源码入口 |
| :--- | :--- | :--- |
| 修改 2027 协议规则、坐标换算、`.rmui` 兼容 | [领域引擎说明](doc/domain.md) | [constants.ts](domain/protocol/constants.ts)、[geometry.ts](domain/protocol/geometry.ts)、[preflight.ts](domain/protocol/preflight.ts) |
| 修改工程状态、未保存守卫、Tauri IPC | [状态与服务说明](doc/state.md) | [useDocumentStore.ts](stores/useDocumentStore.ts)、[unsavedGuard.ts](services/unsavedGuard.ts)、[projectActions.ts](services/projectActions.ts) |
| 修改主题、公共复用组件、画布平移、右键或业务视图 | [界面与交互说明](doc/ui.md) | [tokens.css](styles/tokens.css)、[CanvasStage.tsx](features/editor/CanvasStage.tsx)、[useCanvasPan.ts](hooks/useCanvasPan.ts) |
| 修改代码生成向导、React Flow 节点图与 Monaco 双向同步 | [代码生成架构](../doc/codegen.md) | [CodegenView.tsx](features/codegen/CodegenView.tsx)、[useCodegenStore.ts](stores/useCodegenStore.ts)、[nodeRegistry.ts](domain/codegen/nodeRegistry.ts)、[codegenService.ts](services/codegenService.ts) |
| 对接 Rust `.mkui` 读写与命令契约 | [Rust 模块导航](../src-tauri/AGENTS.md) | [commands 文档](../src-tauri/doc/commands.md) |
