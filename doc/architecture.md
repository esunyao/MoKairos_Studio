# 系统架构与目录树

MoKairos Studio 严格执行**页面展示与业务逻辑分离**、**桌面外壳与 1920×1080 协议画布分层**的六层架构。

## 总体分层与数据流

```mermaid
flowchart LR
    Features["features/ 业务页面视图"] --> Hooks["hooks/ 交互与平移编排"]
    Features --> Components["components/ 通用 UI 与协议控件"]
    Features --> Stores["stores/ Zustand 状态切片"]
    Hooks --> Stores
    Hooks --> Domain["domain/ 纯 TS 2027 协议引擎"]
    Stores --> Domain
    Stores --> Services["services/ IPC 桥接与离开守卫"]
    Services -->|"Tauri invoke()"| Rust["src-tauri/src/ 桌面宿主与版本内核"]
    Rust --> Core["crates/mokairos-codegen 共享生成/归档/协议核"]
    CLI["mokairos-ui CLI (CMake 调用)"] --> Core
```

## 完整文件目录结构

```text
MoKairos_Studio/
├── AGENTS.md                               # 仓库总规范与 AI 阅读根入口
├── Cargo.toml                              # Rust Workspace 根（src-tauri + crates/mokairos-codegen）
├── README.md                               # 仓库公开门面
├── doc/                                    # 【L1 全局公开文档：总-分专题】
│   ├── README.md                           # 总纲与各级文档索引
│   ├── architecture.md                     # 本文件：架构分层与目录树
│   ├── protocol.md                         # 2027 串口 UI 协议与视觉隔离规范
│   ├── mkui-format.md                      # .mkui (ZIP + MessagePack) 归档规范
│   ├── codegen.md                          # 通用代码生成引擎、presets 与双向同步
│   ├── cmake.md                            # MoKairosUI.cmake 工具链与离线缓存规范
│   ├── development.md                      # 开发命令、公共复用组件与编码约定
│   └── governance.md                       # 文档递推与审计规范
├── doc-project/                            # 【本地私有目录】(.gitignore 忽略) 背景、设计稿、规划与审计台账
├── crates/mokairos-codegen/                # 【L2 共享代码生成核心库 + CLI (mokairos-ui)】
│   ├── AGENTS.md                           # 引擎模块导航
│   ├── doc/                                # 引擎总览文档
│   ├── profiles/                           # 3 套官方 TOML 预设（generic-c / uicrm-new / uicrm-legacy）
│   ├── templates/                          # MiniJinja 基底模板 (official/*.j2) 与 CMake 模块模板
│   └── src/                                # model / archive / protocol / profile / codefile / flow / generate / cli
├── src/                                    # 【L2 前端模块】
│   ├── AGENTS.md                           # 前端任务导航
│   ├── doc/                                # 前端总览 + domain / state / ui 分文档
│   ├── styles/                             # tokens.css (双主题+9色) & globals.css
│   ├── assets/rm-client-background.png     # 原生 1920×1080 官方底图（只作参考，不导出）
│   ├── domain/                             # 纯 TS 领域引擎（protocol / codegen / adapters，Vitest 覆盖）
│   ├── stores/                             # Zustand 7 个状态切片（含 useCodegenStore）
│   ├── services/                           # Tauri IPC、.mkui 读写、代码生成服务、未保存守卫等
│   ├── hooks/                              # 视口、拖拽平移、快捷键、预览诊断、代码双向同步与导出编排
│   ├── components/                         # 公共复用组件（liquid-glass、toast、ContextMenu、Dialog 等）与协议控件
│   └── features/                           # 业务视图（shell、launchpad、editor、version-control、simulator、codegen）
└── src-tauri/                              # 【L2 Rust 桌面宿主】
    ├── AGENTS.md                           # Rust 任务导航
    ├── doc/                                # Rust 总览 + archive / commands 分文档
    └── src/                                # 重导出 mokairos-codegen + versioning + commands
```

进一步阅读：[前端总览](../src/doc/README.md) · [Rust 总览](../src-tauri/doc/README.md) · [代码生成引擎](../crates/mokairos-codegen/doc/README.md) · [返回总纲](README.md)
