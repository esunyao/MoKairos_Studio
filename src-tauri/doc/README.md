# Rust 桌面宿主与归档内核总览

Tauri v2 Rust 后端负责跨平台桌面宿主、原生文件对话框、`.mkui`（ZIP + MessagePack）原子归档读写、包内版本控制快照以及权威协议校验。

## 分模块文档（总 → 分）

| 专题 | 内容范围 |
| :--- | :--- |
| [`.mkui` 归档与版本控制内核](archive.md) | ZIP + MessagePack 原子打包、防 Zip Slip 解包与 `history/` 快照管理 |
| [Tauri 命令契约与窗口权限](commands.md) | 已注册 IPC 命令清单、统一错误类型与 `capabilities` 权限说明 |

相关文档：[全局架构](../../doc/architecture.md) · [前端模块总览](../../src/doc/README.md)
