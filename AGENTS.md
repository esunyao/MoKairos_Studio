# Repository Guidelines

## 项目总体阅读说明

> [!important]
>
> 1. 先了解整个项目背景、项目意图、项目意义、项目目的、研究背景与未来拓展性。
>
> 2. 必须秉持严谨态度，辩证地看待介绍文件；涉及行为、接口、配置和安全结论时以源码、配置、公开契约和测试证据为准。
>
> 3. 文档按位置各司其职，必须区分：
>    > [!note]
>    >
>    > `<模块>/doc/`：仓库公开的模块大体说明，供 AI 与一般读者快速建立认知，**不展开细节**。
>    >
>    > `<模块>/docp/`：全称 `doc-personal`，本地私有的子项目详细说明；AI **只读参考，不写入**。
>    >
>    > 根 `doc-project/`：特例，专门说明项目整体背景，本地私有，不提交。
>
> 4. 缺少项目背景时，先阅读根 `doc-project/`；缺少模块细节时，再按需阅读对应 `docp/`。
>
> 5. `docp/` 可帮助快速理解设计，但不能替代对当前源码和配置的关键事实核验。
> 
> 6. 模块接口、配置、数据结构、架构或行为发生变化时，同步更新受影响模块的 `doc/`。
>
> 7. 继续阅读本文件其余章节。

## 仓库结构与文档维护

先读[本地项目背景](doc-project/README.md)。新克隆直接读[公开总纲](doc/README.md)，再沿[前端导航](src/AGENTS.md)或[Rust 导航](src-tauri/AGENTS.md)进入模块文档与源码。

文档采用**总-分多级递推结构**：
- 入口 `README.md` 只写总体定位、状态概览与下一级专题/模块链接表，不堆砌实现细节；
- 专题与模块细节下沉至各自 `doc/<topic>.md`（小写英文单数命名，不加日期前缀）；
- 模块接口、数据结构、交互行为或架构变化时，同步更新受影响层级的 `doc/` 与 `AGENTS.md`。

## 开发与验证

默认在仓库根运行以下命令（桌面端覆盖 Windows / macOS / Linux，不修改外部仓库 `RM-UI-Designer1` 与 `UICRM-Embedded`）：

- `pnpm install` 安装前端依赖。
- `pnpm test` 运行前端领域引擎单元测试（Vitest）。
- `pnpm typecheck` 运行 TypeScript 严格类型检查。
- `pnpm build` 运行 `tsc` 类型检查并构建前端生产包。
- `cargo test --manifest-path src-tauri/Cargo.toml` 运行 Rust 归档、版本与协议单元测试。
- `cargo check --manifest-path src-tauri/Cargo.toml` 校验 Rust 桌面宿主编译。
- `pnpm tauri dev` / `pnpm tauri build` 启动桌面开发环境或打包桌面应用。

编码与复用规范：
- 页面展示（`src/features/`）与纯领域逻辑（`src/domain/`）、状态切片（`src/stores/`）、IPC 服务（`src/services/`）、交互编排（`src/hooks/`）严格分离，核心文件与函数保留中文注释。
- 公共交互组件优先复用，不重复造轮子：消息通知统一调用 `@/components/ui/toast`，右键菜单统一使用 `@/components/ui/ContextMenu`，未保存离开守卫统一走 `@/services/unsavedGuard`，液态玻璃/普通质感外壳容器统一使用 `@/components/ui/liquid-glass`。

## 审计与交付交接规范

每次完成功能开发、交互重构或发布前整理，**无需维护者重复提醒**，必须自动完成以下交接闭环：
1. 同步更新受影响的多级公开 `doc/` 与模块 `AGENTS.md`（若仅本地私有规划/审计变更则只更新 `doc-project/`）。
2. 在本地私有 [审计总台账](doc-project/audit/README.md) 登记本次任务，并按 `doc-project/audit/YYYYMMDD-<task>-audit.md` 写入**结构化审计与 Walkthrough 归档**，必须包含：变更与需求对照表、实测命令与退出码/用例数量、实机或浏览器 Walkthrough 观察结论、外部仓库零改动核验及未验证项。
3. 未经明确授权不得新建 Git worktree；按维护者 Git 身份执行约定式中文提交。

## 提交与 PR

用维护者的 Git 身份，按约定式提交撰写中文摘要，例如 `docs: 重构多级总分公开文档体系并固化审计交接规范`。建 Git 工作树前先征得维护者授权。PR 说明改动、影响和验证结果，有关联议题时附链接，可见界面变更附截图。私有目录（`/doc-project/`、`**/docp/`）留在本地，绝不提交，AI 绝不写入 `**/docp/`。
