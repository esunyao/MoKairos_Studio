# MoKairos Studio 公开文档总纲

MoKairos Studio 是面向 RoboMaster UI 设计者与整车固件维护者的桌面工具（支持 Windows / macOS / Linux），目标是将可视化 HUD 设计、`.mkui` 归档交付与后续 `UICRM-Embedded` CMake 接入流程连接起来。

## 当前能力边界

| 模块 | 当前状态 | 简要说明 |
| :--- | :--- | :--- |
| **1920×1080 协议编辑器** | ✅ 已完成 | 8 类图元、9 色隔离、左下角原点、自定义右键菜单、中键/`Alt` 平移、未保存离开守卫、快捷键指南 |
| **`.mkui` 归档与版本控制** | ✅ 已完成 | ZIP + MessagePack 原子读写、包内快照提交、Diff 对比、回滚与 `.rmui` 双向兼容 |
| **HUD 模拟器（Local Mock）** | ✅ 本地模拟完成 | 只读视口、2027 ID 推导、动态变量滑块驱动、真实 `0x0301` 帧与 CRC16 日志（串口通道占位） |
| **CMake 与代码生成页** | 🟡 模拟预览 + 真实导出 | 真实协议预检 + 真实导出 `.mkui`/`.rmui`/`.json`；CMake/`UICRM-Embedded` 代码为模拟预览 |

## 专题文档（总 → 分）

| 专题 | 内容范围 |
| :--- | :--- |
| [系统架构与目录树](architecture.md) | 六层前后端架构、完整文件目录与跨层数据流 |
| [2027 串口 UI 协议约束](protocol.md) | 8 类图元、9 色只读常量、坐标系换算、分包预算与双色板隔离 |
| [.mkui 归档与版本格式](mkui-format.md) | `.mkui` ZIP + MessagePack 包结构、原子写入与快照版本控制 |
| [开发、组件复用与验证](development.md) | 本地运行命令、公共复用组件库与编码规范 |
| [文档分层与审计规范](governance.md) | 多级总-分文档结构约定与任务审计归档机制 |

## 模块入口（向下递推）

| 模块 | 人类概览文档 | AI 导航入口 |
| :--- | :--- | :--- |
| **前端 (`src/`)** | [前端总览](../src/doc/README.md) | [前端导航](../src/AGENTS.md) |
| **Rust 宿主 (`src-tauri/`)** | [Rust 总览](../src-tauri/doc/README.md) | [Rust 导航](../src-tauri/AGENTS.md) |
| **仓库级规范** | [仓库首页](../README.md) | [仓库指南](../AGENTS.md) |
