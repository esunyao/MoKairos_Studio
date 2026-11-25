# Rust 桌面宿主与归档内核说明

Tauri v2 Rust 后端负责跨平台桌面文件对话框、`.mkui`（ZIP + MessagePack）原子读写、包内版本快照管理与权威协议预检：

- **[lib.rs](../src/lib.rs)** & **[main.rs](../src/main.rs)**：Tauri Builder、插件（`opener`、`dialog`）与全部 IPC 命令注册入口。
- **[error.rs](../src/error.rs)**：统一可序列化 `AppError` 错误类型。
- **[model/](../src/model/)**：与前端 TypeScript 1:1 对齐的 `MkuiDocument`、`MkuiManifest`、`VersionIndex`、`RecentProjectEntry` 模型（`serde` + `rmp-serde`）。
- **[archive/](../src/archive/)**：
  - `pack.rs`：原子写入 `.mkui`（临时文件写完后安全替换目标），常规保存时自动保留原包内 `history/` 与扩展资源。
  - `unpack.rs`：防 Zip Slip 路径穿越与 50 MB 单条目解压上限校验，支持仅读明文 `manifest.json` 快速索引。
- **[versioning/snapshot.rs](../src/versioning/snapshot.rs)**：包内快照提交（SHA-256 校验）、历史列表读取、按 `commitId` 恢复文档与独立导出 `.mkui`。
- **[protocol/](../src/protocol/)**：官方 CRC8/CRC16 实现与 Rust 侧权威协议预检。
- **[commands/](../src/commands/)**：已暴露命令包括 `project_save_mkui`、`project_open_mkui`、`project_read_manifest`、`project_read_text_file`、`project_write_text_file`、`version_commit`、`version_list`、`version_load_snapshot`、`version_export_commit`、`protocol_preflight`、`recent_projects_load`、`recent_projects_save`。

前端消费方式见[前端模块导航](../../src/AGENTS.md)，全局规范见[项目总览](../../doc/README.md)。
