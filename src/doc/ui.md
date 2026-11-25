# 设计系统、公共复用组件与界面视图

## 1. 样式与主题 (`src/styles/`)

- **[tokens.css](../styles/tokens.css)**：暗色（`#0D1117` + `#00D4FF`）与浅色（`#F4F6F9` + `#2563EB`）双主题语义 Token、磨砂玻璃变量，以及与外壳隔离的裁判系统 9 色只读常量。
- **[globals.css](../styles/globals.css)**：Tailwind CSS v4 入口、`.mk-tabular` 等宽数字、`.mk-glass` / `.mk-glass-elevated` 玻璃质感实用类与减弱动效媒体查询降级。

## 2. 公共复用组件 (`src/components/`)

- **[ui/toast/](../components/ui/toast/index.ts)**：全局命令式通知组件（`toast.success` / `info` / `warn` / `error` + `<Toaster />`），支持悬停暂停、倒计时进度条与队列重排。
- **[ui/ContextMenu.tsx](../components/ui/ContextMenu.tsx)**：公共玻璃态自定义右键菜单（视口防溢出定位、快捷键标注、二级子菜单），全局屏蔽浏览器默认右键菜单。
- **[ui/UnsavedChangesDialog.tsx](../components/ui/UnsavedChangesDialog.tsx)**：未保存改动离开确认弹窗。
- **[ui/Button.tsx](../components/ui/Button.tsx)**、[ui/Primitives.tsx](../components/ui/Primitives.tsx)（含 `Input`, `Badge`, `Kbd`）、[ui/NumberStepper.tsx](../components/ui/NumberStepper.tsx)、[ui/Dialog.tsx](../components/ui/Dialog.tsx)、[ui/Controls.tsx](../components/ui/Controls.tsx)（`SimpleSelect`, `Slider`, `Switch`, `Tooltip`）。
- **[protocol/](../components/protocol/)**：硬锁 9 色选色板 `ProtocolColorPicker`、图层过滤 `LayerChipBar`、红蓝阵营切换 `TeamToggle`。

## 3. 业务页面视图 (`src/features/`)

- **[shell/](../features/shell/)**：44px 玻璃主控顶栏 `AppTitleBar`（含返回守卫、三态滑块、主题与快捷键指南按钮）及 `ShortcutsHelpDialog`（左键鼠图标/按键帽 + 右侧操作说明）。
- **[launchpad/](../features/launchpad/)**：工程大厅、2027 兵种模板、最近工程卡片、新建工程向导与设置弹窗。
- **[editor/](../features/editor/)**：远左工具条、左侧图层/画面/底图面板、单 Shape 高性能点阵 `CanvasStage`（8 类图元渲染与自定义右键）、右侧动态属性检查器与多选对齐浮条。
- **[version-control/](../features/version-control/)**：玻璃侧滑版本抽屉（提交快照、时间线、结构化 Diff 对比、带备份保护回滚、导出历史 `.mkui`）。
- **[simulator/](../features/simulator/)**：只读模拟画布、动态变量遥测驱动与实时 `0x0301` CRC16 协议帧检视抽屉。
- **[export-mock/](../features/export-mock/)**：真实协议预检与 `.mkui`/`.rmui`/`.json` 导出 + CMake/`UICRM-Embedded` 接入模拟预览。

[返回前端总览](README.md)
