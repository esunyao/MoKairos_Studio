# 开发命令、公共组件与编码规范

## 1. 常用开发与验证命令

在仓库根目录执行：

```bash
pnpm install                                    # 安装前端依赖
pnpm test                                       # 运行 Vitest 领域单元测试
pnpm typecheck                                  # TypeScript 严格检查 (tsc --noEmit)
pnpm build                                      # 类型检查并构建前端生产产物 (dist/)
cargo test --manifest-path src-tauri/Cargo.toml # 运行 Rust 归档、版本与 CRC 单元测试
cargo check --manifest-path src-tauri/Cargo.toml# 校验 Rust 编译与 Tauri 权限 schema
pnpm tauri dev                                  # 启动跨平台桌面开发窗口
pnpm tauri build                                # 构建桌面端安装包
```

## 2. 公共复用组件清单（避免重复造轮子）

| 能力 | 公共模块路径 | 使用方式 |
| :--- | :--- | :--- |
| **全局 Toast 通知** | `src/components/ui/toast/` | 根组件挂载 `<Toaster />`；任意文件调用 `toast.success()` / `toast.warn()` / `toast.error()` / `toast.info()` |
| **自定义玻璃右键菜单** | `src/components/ui/ContextMenu.tsx` | 传入坐标与 `ContextMenuEntry[]`，自动处理视口边界防溢出与二级子菜单 |
| **未保存离开守卫** | `src/services/unsavedGuard.ts` + `UnsavedChangesDialog.tsx` | 返回大厅、替换工程、关闭窗口统一经 `guardUnsavedChanges` / `navigateToLaunchpadWithGuard` 拦截 |
| **画布平滑平移** | `src/hooks/useCanvasPan.ts` | 统一接管中键、中键+左键、`Alt`+左键、`Space`+左键与抓手工具 |
| **基础表单与弹窗** | `src/components/ui/` | `Button`, `Input`, `NumberStepper`, `Dialog`, `Controls` (`SimpleSelect`, `Slider`, `Switch`, `Tooltip`) |

## 3. 代码风格与约束

- TypeScript 保持严格模式（`strict`, `noUnusedLocals`, `noUnusedParameters`）；组件 `PascalCase`，函数 `camelCase`。
- Rust 遵守 `rustfmt` 与 `snake_case`，命令返回值统一通过 `AppError` 序列化。
- 严禁修改外部仓库 `RM-UI-Designer1` 与 `UICRM-Embedded` 中的任何文件。

[返回总纲](README.md)
