# MoKairos Studio 项目概览与架构交接文档

MoKairos Studio 是面向 RoboMaster 战队 UI 设计者与嵌入式固件维护者的跨平台桌面工具（Windows / macOS / Linux），基于 **Tauri v2 + React 19 + TypeScript + Konva + Rust** 构建。

核心设计哲学：**界面展示与领域逻辑严格分离**、**外壳设计系统与裁判系统 1920×1080 画布严格隔离**、**.mkui（ZIP + MessagePack）归档内置版本控制**。

---

## 一、当前能力边界（已实现 vs 模拟占位）

| 模块 | 当前状态 | 说明 |
| :--- | :--- | :--- |
| **1920×1080 协议编辑器** | ✅ 已完成 | 严格对齐 RoboMaster 2027 串口协议：8 类图元（直线/矩形/正圆/椭圆/圆弧/浮点/整型/字符）、9 色隔离（含红蓝主色切换）、图层 `L0–L9`、左下角原点、Safe Area 4 大遮挡禁区蒙版、多 Frame/Group、多选对齐、撤销重做、快捷键 |
| **`.mkui` 存储与版本控制** | ✅ 已完成 | `.mkui` 本质为标准 ZIP（Deflate）压缩包，内部使用 MessagePack（`rmp-serde`）压缩存储设计文档与版本快照；支持提交快照、时间线、结构化 Diff 对比、一键回滚与独立导出；同时兼容导入/导出 `.rmui` 与 `.json` |
| **HUD 模拟器（Local Mock）** | ✅ 本地模拟已完成 | 只读视口防误拖、2027 兵种 ID 推导、动态变量滑块实时驱动、真实 `0x0301` 协议帧编解码与 CRC8/CRC16 检视抽屉；物理串口硬件收发保留界面占位 |
| **CMake 与代码生成页** | 🟡 模拟预览 + 真实导出 | 阶段 1 执行**真实协议预检**并支持定位图元；阶段 2 为 `UICRM-Embedded` 风格的 `#include "ui/xxx.h"` + `bsp::UART` 初始化与变量 Map 预览（模拟占位）；阶段 3 支持真实导出 `.mkui` / `.rmui` / `.json` |

---

## 二、项目文件结构与分层职责

```text
MoKairos_Studio/
├── doc/                                    # 【公开交接文档】本文件所在目录，任何新读者先看这里
├── doc-project/                            # 【本地私有目录】(.gitignore 忽略) 背景、视觉设计稿、阶段规划与审计
├── src/                                    # 【前端 React + TypeScript】
│   ├── AGENTS.md                           # 前端模块导航
│   ├── doc/README.md                       # 前端目录与状态/服务详细说明
│   ├── main.tsx                            # 入口挂载与主题初始化
│   ├── App.tsx                             # 顶层外壳路由（大厅 / 编辑 / 模拟 / 导出）
│   ├── styles/
│   │   ├── tokens.css                      # 明暗双主题 CSS 变量、玻璃质感变量、裁判系统 9 色只读常量
│   │   └── globals.css                     # Tailwind v4 入口、.mk-tabular 等宽数字、玻璃实用类
│   ├── assets/
│   │   └── rm-client-background.png        # 1920×1080 官方客户端基准底图（仅设计辅助，不导出）
│   ├── domain/                             # 【纯业务逻辑与 2027 协议引擎：零 React/Konva 依赖，全量单测】
│   │   ├── protocol/
│   │   │   ├── constants.ts                # 9 色枚举、8 图元码、位域限制、2027 兵种/选手端 ID 表、Safe Area
│   │   │   ├── types.ts                    # MkuiDocument / Frame / Group / Graphic(8 类判别联合) / Manifest
│   │   │   ├── geometry.ts                 # RM 左下角原点 ↔ Konva 左上角原点、12 点顺时针圆弧换算、整数归一化
│   │   │   ├── naming.ts                   # 3 字节 figure_name 自动分配、UTF-8 字节计数、C 标识符检查
│   │   │   ├── packetBudget.ts             # 7/5/2/1 图形拆包与 60B 字符独占包带宽估算
│   │   │   ├── crcAndFrame.ts              # 官方 CRC8/CRC16 与 0x0301 协议帧编码（模拟器用）
│   │   │   └── preflight.ts                # 协议预检与 Safe Area 碰撞检测
│   │   ├── adapters/rmuiAdapter.ts         # RM-UI-Designer .rmui (v1/v2) ↔ MkuiDocument 双向兼容转换
│   │   ├── versioning/diffEngine.ts        # 双版本结构化属性 Diff 计算
│   │   ├── templates/starterTemplates.ts   # 2027 兵种开箱模板
│   │   └── __tests__/                      # Vitest 单元测试套件
│   ├── stores/                             # 【Zustand 状态切片】
│   │   ├── useAppStore.ts                  # 视图路由、明暗主题、抽屉/弹窗与 Toast 状态
│   │   ├── useProjectStore.ts              # 工程文件路径、脏状态、最近工程缓存
│   │   ├── useDocumentStore.ts             # MkuiDocument 唯一数据源（RM 坐标系）+ 80 步撤销重做栈
│   │   ├── useCanvasStore.ts               # 选中集合、绘制工具、L0–L9 过滤、视口缩放、底图/安全区/阵营开关
│   │   ├── useVersionStore.ts              # 包内版本历史索引与 Diff 目标缓存
│   │   └── useSimulatorStore.ts            # 模拟模式、遥测覆盖表、协议帧环形日志
│   ├── services/                           # 【Tauri IPC 与持久化适配层（含浏览器预览降级）】
│   │   ├── tauriBridge.ts                  # 运行环境探测与 invoke 封装
│   │   ├── mkuiFileService.ts              # .mkui / .rmui / .json 原生文件对话框与读写
│   │   ├── versionService.ts               # .mkui 包内快照提交、历史拉取、恢复与导出
│   │   ├── recentProjectsService.ts        # 跨平台最近工程索引读写
│   │   ├── windowService.ts                # 桌面窗口标题与脏状态同步
│   │   └── projectActions.ts               # 跨视图共享的新建/打开/保存/导入编排
│   ├── hooks/                              # 【交互逻辑 Hook（与 JSX 展示分离）】
│   │   ├── useCanvasViewport.ts            # 适应视口、滚轮缩放与平移
│   │   ├── useEditorShortcuts.ts           # 编辑快捷键与 Space 临时抓手
│   │   └── useDocumentDiagnostics.ts       # 派生预检与分包预算
│   ├── components/                         # 【通用设计系统原语：Tailwind v4 + Radix UI + Motion】
│   │   ├── ui/                             # Button, Input, NumberStepper, Dialog, Controls, Primitives
│   │   └── protocol/                       # ProtocolColorPicker（9 色隔离）, LayerChipBar, TeamToggle
│   └── features/                           # 【业务视图组件】
│       ├── shell/                          # 44px 玻璃主控顶栏、ToastHost
│       ├── launchpad/                      # 工程大厅、模板库、新建工程向导、设置弹窗
│       ├── editor/                         # 主编辑工作台、Konva 画布、8 类图元渲染器、图层树、检查器
│       ├── version-control/                # 玻璃侧滑版本控制抽屉（提交 / Diff / 回滚 / 导出）
│       ├── simulator/                      # 本地 HUD 模拟器与协议帧日志抽屉
│       └── export-mock/                    # 真实预检 + .mkui 导出 + CMake/C++ 接入模拟预览页
└── src-tauri/                              # 【Rust 桌面宿主与归档内核】
    ├── AGENTS.md                           # Rust 模块导航
    ├── doc/README.md                       # Rust 命令与模块详细说明
    ├── Cargo.toml / tauri.conf.json / capabilities/
    └── src/
        ├── main.rs / lib.rs / error.rs     # 宿主启动、插件注册、统一可序列化错误
        ├── model/                          # 与前端 1:1 对齐的 Serde / MessagePack 结构体
        ├── archive/                        # .mkui ZIP + MessagePack 原子写入与防路径穿越解包
        ├── versioning/                     # 快照提交（SHA-256）、历史读取、独立导出
        ├── protocol/                       # Rust 侧权威 CRC8/CRC16 与协议预检
        └── commands/                       # 薄 Tauri Command 路由层（project / version / protocol / storage）
```

---

## 三、`.mkui` 文件归档格式规范

`.mkui` 是一个标准 ZIP（Deflate）压缩包，内部分层如下：

```text
<project>.mkui (ZIP Archive)
├── manifest.json                 # UTF-8 明文清单（工程大厅快速检索与未来 CMake 解析校验入口）
├── design.msgpack                # 当前工作区 MkuiDocument（MessagePack named-map 编码）
└── history/
    ├── index.msgpack             # 版本索引（commitId, parentId, versionTag, message, createdAt, sha256）
    └── commits/
        └── <commitId>.msgpack    # 不可变历史快照（MessagePack 编码，保存主文件时自动保留）
```

---

## 四、开发与验证命令

```bash
pnpm install                                  # 安装前端依赖
pnpm typecheck                                # 运行 TypeScript 严格类型检查
pnpm test                                     # 运行领域引擎单元测试（Vitest）
pnpm build                                    # 类型检查并构建前端生产包
cargo test --manifest-path src-tauri/Cargo.toml   # 运行 Rust 归档、版本与协议单测
pnpm tauri dev                                # 启动桌面端开发窗口（Windows / macOS / Linux）
pnpm tauri build                              # 构建对应平台桌面安装包
```

- 前端模块详情见 [前端导航](../src/AGENTS.md) 与 [前端架构说明](../src/doc/README.md)。
- Rust 内核详情见 [Rust 导航](../src-tauri/AGENTS.md) 与 [Rust 架构说明](../src-tauri/doc/README.md)。
- 贡献规范与提交约定见 [仓库指南](../AGENTS.md)。
