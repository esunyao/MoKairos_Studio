# Tauri 命令契约、协议校验与窗口权限

## 1. 已注册 Tauri Commands (`src-tauri/src/commands/`)

| 命令组 | 命令名 | 职责 |
| :--- | :--- | :--- |
| **工程归档 (`project_cmd.rs`)** | `project_save_mkui` / `project_open_mkui` / `project_read_manifest` | `.mkui`（ZIP + MessagePack）保存（兼容草稿暂存历史）、打开与快速清单读取 |
| **兼容文本 (`project_cmd.rs`)** | `project_read_text_file` / `project_write_text_file` | 读写 `.rmui` / `.json`，写出强制规范化为 LF 换行 |
| **版本控制 (`version_cmd.rs`)** | `version_commit` / `version_list` / `version_load_snapshot` / `version_export_commit` | `.mkui` 包内快照提交、列表查询、历史读取与独立导出 |
| **协议校验 (`protocol_cmd.rs`)** | `protocol_preflight` | 权威校验 3 字节唯一短名、UTF-8 ≤ 30 B、图层、9 色枚举与线宽范围 |
| **代码生成与 CMake (`codegen_cmd.rs`)** | `codegen_load_presets` / `codegen_load_builtin_base_lib` / `codegen_parse_profile` / `codegen_validate_profile` / `codegen_preview` / `codegen_parse_codefile` / `codegen_upsert_code_node` / `codegen_export_cmake` / `codegen_export_sources` | 加载官方预设与 `.j2` 基底模板、解析/校验 `profile.toml`、运行生成预览、无损 C 函数解析与双向同步、导出 `MoKairosUI.cmake` 或直接导出源码目录 |
| **本地缓存 (`storage_cmd.rs`)** | `recent_projects_load` / `recent_projects_save` | 读写应用数据目录 `recent_projects.json` |

## 2. 协议与错误基础 (`src-tauri/src/protocol/` & `error.rs`)

- **[crc.rs](../src/protocol/crc.rs)** & **[validate.rs](../src/protocol/validate.rs)**：官方标准 CRC8/CRC16 实现与 Rust 侧预检逻辑。
- **[error.rs](../src/error.rs)**：统一可序列化 `AppError`，覆盖 IO、ZIP、MessagePack、JSON、归档格式、安全越权与资源缺失错误。

## 3. 窗口与插件权限 (`src-tauri/capabilities/default.json`)

- 已启用插件：`tauri_plugin_opener`、`tauri_plugin_dialog`。
- 已授权窗口能力：`core:window:allow-set-title`、`allow-is-maximized`、`allow-toggle-maximize`、`allow-minimize`、`allow-close`、`allow-destroy`（用于未保存退出拦截后安全销毁窗口）。

[返回 Rust 总览](README.md)
