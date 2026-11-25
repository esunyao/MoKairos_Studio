# 状态切片、服务与交互 Hook

## 1. Zustand 状态切片 (`src/stores/`)

- **[useAppStore.ts](../stores/useAppStore.ts)**：当前视图（`launchpad` / `design` / `simulate` / `export`）、明暗主题、材质模式（`surfaceStyle: 'liquid' | 'standard'`）、液态玻璃光学参数（`mode` / `displacementScale` / `blurAmount` / `saturation` / `aberrationIntensity` / `elasticity` / `overLight` / `adaptiveContrast`，均持久化 `localStorage`）、作者署名、版本抽屉及各类确认/帮助弹窗状态。
- **[useProjectStore.ts](../stores/useProjectStore.ts)**：当前打开文件路径 `filePath`、脏标记 `isDirty`、归档大小统计与最近工程缓存。
- **[useDocumentStore.ts](../stores/useDocumentStore.ts)**：`MkuiDocument` 唯一数据源（RM 坐标系），含 Frame/Group/Graphic CRUD、对齐、批量编辑及 80 步撤销重做栈。
- **[useCanvasStore.ts](../stores/useCanvasStore.ts)**：选中集合 `selectedIds`、当前绘制工具、可见图层掩码 `L0–L9`、视口缩放与平移偏移、点阵与底图开关、红/蓝阵营预览。
- **[useVersionStore.ts](../stores/useVersionStore.ts)**：`.mkui` 包内版本索引 `VersionIndex`、未落盘草稿快照缓存、当前 Diff 目标文档。
- **[useSimulatorStore.ts](../stores/useSimulatorStore.ts)**：模拟模式、动态图元遥测覆盖表 `overrides`、上限 500 条的协议帧环形日志。

## 2. IPC 与业务服务 (`src/services/`)

- **[tauriBridge.ts](../services/tauriBridge.ts)**：运行环境探测（桌面 Tauri vs 浏览器开发预览）与类型安全 `invokeCommand`。
- **[mkuiFileService.ts](../services/mkuiFileService.ts)**：`.mkui` / `.rmui` / `.json` 文件对话框与跨端读写。
- **[versionService.ts](../services/versionService.ts)**：封装 `version_commit` / `version_list` / `version_load_snapshot` / `version_export_commit`。
- **[unsavedGuard.ts](../services/unsavedGuard.ts)**：统一拦截**返回工程大厅**、**新建/打开/导入替换当前工程**与**关闭桌面窗口**时的未保存改动，提供「保存并继续 / 不保存直接离开 / 取消」三选确认。
- **[backdropLuminance.ts](../services/backdropLuminance.ts)**：实时采样玻璃容器背后 Konva `<canvas>` 像素与 DOM / `<img>` 叠色的 WCAG 相对亮度，计算浅底黑字 / 深底白字防抖极性。
- **[projectActions.ts](../services/projectActions.ts)**：跨视图共用的工程新建、打开、保存与导入导出编排。
- **[recentProjectsService.ts](../services/recentProjectsService.ts)** & **[windowService.ts](../services/windowService.ts)**：最近工程持久化与窗口标题同步。

## 3. 交互编排 Hook (`src/hooks/`)

- **[useAdaptiveGlassContrast.ts](../hooks/useAdaptiveGlassContrast.ts)**：监听容器尺寸、主题、画布平移缩放与滚动，按 100ms 节流向 `LiquidGlassSurface` 提供 `data-glass-ink`（`dark` / `light`）与混色护眼判定。
- **[useCanvasPan.ts](../hooks/useCanvasPan.ts)**：指针捕获级统一平移状态机，支持中键、中键+左键、`Alt`+左键、`Space`+左键、抓手工具拖动，以及中键双击适应视口和失焦防卡死复位。
- **[useCanvasViewport.ts](../hooks/useCanvasViewport.ts)**：自适应视口、100% 居中与指针中心滚轮缩放。
- **[useEditorShortcuts.ts](../hooks/useEditorShortcuts.ts)**：编辑快捷键（`V`/`H`/`1~8`/`G`/`B`/`Ctrl+Z`/`Ctrl+C/V/D`/`Ctrl+S`/`?`/`F1`/方向键微调）。
- **[useDocumentDiagnostics.ts](../hooks/useDocumentDiagnostics.ts)**：派生当前画面的实时协议预检与串口分包预算。

[返回前端总览](README.md)
