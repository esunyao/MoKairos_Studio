# 项目概览

MoKairos Studio 是面向 RoboMaster UI 设计者与整车固件维护者的桌面工具。目标是让设计者可视化编辑、保存并模拟验证 UI，由 Rust 生成可放入车辆工程 `ui/` 目录的产物，由维护者在 CMake 中指定目标并编入该车固件。

桌面端采用 Tauri、React、Vite 和 Rust，目标平台为 Windows、macOS、Linux。浏览器可用于前端开发预览，产品交付范围为桌面应用。

## 当前进度

仓库已有 Tauri 脚手架和 React 画布原型。当前原型的 TypeScript 检查尚未通过。保存设计、模拟器、Rust 代码生成和整车接入是后续目标。

## 按任务阅读

- 查看编辑界面和资源位置，进入[前端导航](../src/AGENTS.md)。
- 查看桌面宿主和生成职责，进入[Rust 导航](../src-tauri/AGENTS.md)。
- 查看开发命令和贡献规范，回到[根指南](../AGENTS.md)。项目入口见[仓库首页](../README.md)。
