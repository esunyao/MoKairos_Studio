# 通用 RM UI 代码生成引擎与双向工作台

MoKairos Studio 通过独立的 Rust 共享库与 CLI crate（[mokairos-codegen](../crates/mokairos-codegen/doc/README.md)）完成嵌入式 C/C++ 代码生成，使桌面端实时预览与 CMake 构建期生成使用**完全同一套引擎与校验逻辑**。

## 核心架构决策

1. **双模式与双通道复用用户上位机**：
   - **映射驱动 (`mapping`)**：按 `[[symbols]]` 与 `flows.*`（或 `[[bind]]`）周期性读取用户固件现有状态并驱动图元更新，最大程度兼容已有战队框架。
   - **纯数据接口 (`api`)**：生成强类型 `*_set_<ep>(...)` 与静态常量布局表，由用户代码按需调用并支持一入多汇 DAG 扇出。
   - **双通信通道**：`payload` 通道直接调用用户已封装的发送函数（如 `::g_referee->Transmit(0x0301, payload, len)`）；`frame` 通道自动完成 SOF/CRC8/Seq/CRC16 整帧封装后交给用户串口 `Write` 与 CRC 实现。
2. **方案 1 + 方案 3 物理目录隔离**：
   - `generated/`：100% 机器领地，含静态常量布局（`<prefix>_layout.h` / `<prefix>_layout.c`）、协议帧编码与节流运行时（`<prefix>_runtime.c`）、调度/逻辑实现（`<prefix>_gen.c`）、可选 C++ namespace 桥接垫片（`<prefix>_bind.cpp`）与头文件包装（`<prefix>_cpp.hpp`）。每次生成**全量确定性覆写**，零 `USER CODE` 注释锚点。
   - `custom/`：100% 人类领地，仅在目标文件不存在时由 Studio 导出或 CLI `scaffold` 生成一次用户钩子骨架，绝不覆盖已有手写代码。
3. **三套官方开箱预设（轮椅）与三层基底覆写**：
   - 内置预设：`generic-c`、`uicrm-new`（`UICRM-Embedded` `Esuny/dev/feat-ui` 协议/发送复用）、`uicrm-legacy`（`Write` + 整帧 CRC）。
   - 三层基底模板合并优先级（由高到低）：CMake/CLI `BASE_LIB` 目录 > `.mkui` 内 `codegen/lib/*.j2` > 官方内置 `templates/official/*.j2`。

## Studio 工作台 (`src/features/codegen/`)

- **配置向导 (`WizardTab`)**：一键套用官方预设、配置通道/模式/前缀/`clear_layers_on_start`、编辑用户符号与 Runtime `SymbolRef`（C/C++ 表达式 + `include` + `decl`）。
- **节点编排 (`FlowTab`)**：基于 `@xyflow/react` 的 Dify 式 DAG 节点编辑器，支持来源节点、数值/阈值/文本/Mux 变换节点、C 代码节点与图元目标汇连线及实时环路/端口类型阻断校验。
- **纯代码与基底 (`CodeTab`)**：完全离线打包的 `monaco-editor`，编辑 `codegen/code/*.c` 后经纯 Rust `codefile` 无损分块解析器自动双向同步到 React Flow 节点端口，并支持复制/覆写官方 `.j2` 基底模板。
- **打包与导出 (`ExportTab`)**：实时汇总协议预检、配置校验、DAG 与代码诊断并支持点击定位；门禁通过后可打包 `.mkui`、导出 `MoKairosUI.cmake` 或直接导出 C/C++ 源码目录。

进一步阅读：[CMake 接入规范](cmake.md) · [`.mkui` 格式规范](mkui-format.md) · [mokairos-codegen 文档](../crates/mokairos-codegen/doc/README.md)
