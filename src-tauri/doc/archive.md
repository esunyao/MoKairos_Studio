# `.mkui` 归档与版本控制内核 (`archive/` & `versioning/`)

## 1. 数据模型 (`src-tauri/src/model/`)

- **[document.rs](../src/model/document.rs)**：以 `#[serde(rename_all = "camelCase")]` 定义与前端 1:1 对齐的 `MkuiDocument`、`MkuiFrame`、`MkuiGroup` 与 `MkuiGraphic` 8 类标记枚举。
- **[archive.rs](../src/model/archive.rs)**：定义 `MkuiManifest`、`VersionCommitEntry`、`VersionIndex`、`OpenedMkuiProject`、`SavedMkuiReceipt` 与 `RecentProjectEntry`。

## 2. 原子打包与安全解包 (`src-tauri/src/archive/`)

- **[pack.rs](../src/archive/pack.rs)**：使用纯 Rust `zip`（Deflate）与 `rmp-serde` 写入 `manifest.json` 与 `design.msgpack`，通过同目录临时文件 + 安全替换实现原子落盘；常规保存时保留既有 `history/` 与扩展资源条目。
- **[unpack.rs](../src/archive/unpack.rs)**：对所有 ZIP 条目校验无路径穿越（`..`、盘符、前导 `/`）及单条目 50 MB 上限；提供仅读明文 `manifest.json` 的快读函数 `read_mkui_manifest`。

## 3. 包内快照版本控制 (`src-tauri/src/versioning/snapshot.rs`)

- `commit_version_to_archive`：编码 `MkuiDocument` 为 MessagePack 并计算 SHA-256 摘要，写入 `history/commits/<commitId>.msgpack`，更新 `history/index.msgpack` 与 `manifest.json`。
- `load_commit_snapshot` / `export_commit_to_mkui`：按 `commitId` 恢复完整文档或导出为独立 `.mkui`。

[返回 Rust 总览](README.md)
