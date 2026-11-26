# `.mkui` 工程归档与内置版本控制格式

`.mkui` 是 MoKairos Studio 的原生工程文件格式，本质为 **标准 ZIP（Deflate）压缩包**，内部核心设计数据与历史快照均使用 **MessagePack** 二进制编码以大幅压缩体积，方便传输与后续配套 CMake 工具集解析。

## 压缩包内部布局

```text
<project>.mkui (ZIP Archive, Deflate)
├── manifest.json                 # UTF-8 明文清单（工程大厅与外部工具无需解包 msgpack 即可读取元信息）
├── design.msgpack                # 当前工作区 MkuiDocument（MessagePack named-map）
├── codegen/                      # （可选）代码生成随包配置与自定义代码/基底覆写
│   ├── profile.toml              # Schema v1 生成配置（模式/通道/预设/符号/Bind/API/Flows）
│   ├── code/                     # 用户自由 C/C++ 代码节点文件（如 nodes.c，单文件 ≤ 1 MB）
│   └── lib/                      # 可选的自定义 MiniJinja 基底模板覆写（*.j2）
└── history/
    ├── index.msgpack             # 版本索引（commitId, parentId, versionTag, message, author, createdAt, sha256）
    └── commits/
        └── <commitId>.msgpack    # 不可变历史快照（MessagePack 编码）
```

## 关键工程约定

1. **原子写入与历史保留**：Rust `save_mkui_archive_with_codegen` 先写同目录临时文件再原子替换目标文件；常规保存、快照提交与快照独立导出均安全校验路径穿越并保留包内 `history/` 与 `codegen/*`。
2. **安全性**：解包阶段强制校验所有条目路径不含 `..`、盘符或前导斜杠（防 Zip Slip），限制单条目解压上限 50 MB，且 `codegen/*` 单条目额外限制 ≤ 1 MB。
3. **固件变量与代码生成随包携带**：每个图元除 `figureName`（3 字节）与 `displayName` 外，保留可选 `varKey` 与 `dynamic` 标志；随 `.mkui` 打包的 `codegen/*` 可直接交由 `MoKairosUI.cmake` 触发增量代码重生成。
4. **`.rmui` 兼容**：通过 `src/domain/adapters/rmuiAdapter.ts` 支持与 `RM-UI-Designer` `.rmui` (v1/v2 JSON) 的双向导入导出。

Rust 侧归档实现见 [Rust 归档文档](../src-tauri/doc/archive.md) · [代码生成规范](codegen.md) · [返回总纲](README.md)
