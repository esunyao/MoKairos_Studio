# `mokairos-codegen` 共享代码生成核心库与 CLI

`crates/mokairos-codegen` 是 MoKairos Studio 的纯 Rust 核心库与独立 CLI（可执行名 `mokairos-ui`），与 `src-tauri` 同属仓库根 Cargo Workspace，确保**桌面端预览/直出**与 **CMake 命令行生成**运行同一份逻辑。

## 模块划分

- `model/` & `archive/` & `protocol/`：`.mkui`（ZIP + MessagePack）安全读写（含 `codegen/*` 扩展条目）、2027 协议 CRC8/CRC16、图元 15B 静态编码与预检。
- `profile/` & `profiles/`：`codegen/profile.toml` Schema v1 定义、一致性校验与 3 套内置预设（`generic-c`、`uicrm-new`、`uicrm-legacy`）。
- `codefile/`：纯 Rust 状态机无损顶层 C 函数切块与局部替换引擎（零外部 C 编译器依赖），支持节点图与 `codegen/code/*.c` 双向同步。
- `flow/`：DAG 拓扑校验、强类型端口推断与 `mapping` / `api` 代码合成。
- `generate/` & `templates/official/`：三层基底模板合并、`generated/` 原子增量同步与 `custom/` 防覆盖骨架。
- `cmake_export.rs` & `templates/cmake/MoKairosUI.cmake.j2` & `bin/mokairos-ui.rs`：CMake 3.10+ 模块导出与 `generate` / `scaffold` / `list-outputs` / `check` / `export-cmake` 子命令。

## 测试矩阵

- `cargo test -p mokairos-codegen` 涵盖 11 个单元测试、2 个宿主机 C11/C++20（`-Wall -Wextra -Werror -fno-exceptions`）真编译运行测试，以及 2 个 CMake + Ninja 端到端集成测试。

相关文档：[通用代码生成架构](../../../doc/codegen.md) · [CMake 接入规范](../../../doc/cmake.md)
