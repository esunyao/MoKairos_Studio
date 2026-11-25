# `.mkui` 工程归档与内置版本控制格式

`.mkui` 是 MoKairos Studio 的原生工程文件格式，本质为 **标准 ZIP（Deflate）压缩包**，内部核心设计数据与历史快照均使用 **MessagePack** 二进制编码以大幅压缩体积，方便传输与后续配套 CMake 工具集解析。

## 压缩包内部布局

```text
<project>.mkui (ZIP Archive, Deflate)
├── manifest.json                 # UTF-8 明文清单（工程大厅与外部工具无需解包 msgpack 即可读取元信息）
├── design.msgpack                # 当前工作区 MkuiDocument（MessagePack named-map）
└── history/
    ├── index.msgpack             # 版本索引（commitId, parentId, versionTag, message, author, createdAt, sha256）
    └── commits/
        └── <commitId>.msgpack    # 不可变历史快照（MessagePack 编码）
```

## 关键工程约定

1. **原子写入与历史保留**：Rust `save_mkui_archive` 先写同目录临时文件再原子替换目标文件；常规保存时自动原样保留原包内的 `history/` 与扩展资源，绝不覆写丢弃历史。
2. **安全性**：解包阶段强制校验所有条目路径不含 `..`、盘符或前导斜杠（防 Zip Slip），且限制单条目解压上限 50 MB。
3. **固件变量预留**：每个图元除 `figureName`（3 字节）与 `displayName` 外，保留可选 `varKey`（如 `supercap.pct`）与 `dynamic` 标志，供未来 CMake 生成 `UICRM-Embedded` 变量映射接口。
4. **`.rmui` 兼容**：通过 `src/domain/adapters/rmuiAdapter.ts` 支持与 `RM-UI-Designer` `.rmui` (v1/v2 JSON) 的双向导入导出。

Rust 侧归档实现见 [Rust 归档文档](../src-tauri/doc/archive.md) · [返回总纲](README.md)
