# CMake 工具链模块 (`MoKairosUI.cmake`) 接入规范

MoKairos Studio 与 CLI (`mokairos-ui export-cmake`) 均可导出独立可移植的 `MoKairosUI.cmake` 模块（兼容 **CMake 3.10+**，适配 `UICRM-Embedded` 及通用 STM32 CMake 工程）。

## 在整车工程中使用

```cmake
include(${CMAKE_SOURCE_DIR}/cmake/MoKairosUI.cmake)

# 先声明固件可执行目标（如 uicrm_add_arm_executable(hero_typeC ...)）
mokairos_add_ui(hud
    MKUI ${CMAKE_CURRENT_SOURCE_DIR}/ui/hud.mkui
    TARGET hero_typeC.elf
    # 可选参数：
    # PROFILE ${CMAKE_CURRENT_SOURCE_DIR}/ui/override.toml
    # BASE_LIB ${CMAKE_CURRENT_SOURCE_DIR}/ui/custom_lib
    # CUSTOM_DIR ${CMAKE_CURRENT_SOURCE_DIR}/ui/custom
    # OUTPUT_DIR ${CMAKE_CURRENT_BINARY_DIR}/generated_ui
    # FRAMES Main;Battle
)
```

- `mokairos_add_ui` 注册 `INTERFACE` 静态接口库 `<name>` 并自动将其以 `PRIVATE` 链接至 `TARGET`，自动继承整车目标的交叉编译参数（如 `-mcpu=cortex-m4 -mthumb -mfloat-abi=hard`）与驱动头文件路径。
- 对外传入的 `CUSTOM_DIR` 下手写 `.c/.cpp` 会先规范化路径与 `TARGET` 既有 `SOURCES` 去重后再挂载，且 `scaffold` 命令只在文件不存在时写入。

## CLI 解析、SHA256 校验与离线缓存回退

可通过 CMake Cache 变量或命令行 `-D` 定制 CLI 获取策略：

- `MOKAIROS_UI_CLI`：直接指定本地 `mokairos-ui` 可执行路径（跳过所有网络下载）。
- `MOKAIROS_UI_VERSION`：固定 CLI 版本（如 `0.1.0`）或设为 `latest`。
- `MOKAIROS_UI_BASE_URL`：Release 下载源前缀（默认 `https://github.com/esunyao/MoKairos_Studio/releases/download`，支持镜像源与本地 `file:///` 目录）。
- `MOKAIROS_UI_OFFLINE`：设为 `ON` 时禁止联网，仅使用 `MOKAIROS_UI_CLI` 或持久化缓存。
- `MOKAIROS_UI_CACHE_DIR` / `ENV{MOKAIROS_UI_CACHE}`：持久化缓存根目录。

下载成功后会按内置 `MOKAIROS_UI_SHA256_<PLATFORM>` 或同源 `.sha256` 校验并写入持久化缓存；若遇网络波动或离线且目标版本已缓存，自动回退使用缓存；`latest` 在离线时按 SemVer 自动挑选缓存中的最高版本并输出 `WARNING`；若缓存损坏或被篡改，立即以 `FATAL_ERROR` 拒绝并清理坏文件。

## 增量构建判定

- 模块将 `.mkui`、外置 `PROFILE` 及 `BASE_LIB/*.j2` 均设为 `CMAKE_CONFIGURE_DEPENDS` 与 `add_custom_command(DEPENDS ...)`。
- 仅在 `.mkui` 或模板/CLI 发生变化时触发 `mokairos-ui generate` 与 stamp 刷新，未变更时二次构建直接跳过（`ninja: no work to do.`）。

相关文档：[通用代码生成架构](codegen.md) · [`.mkui` 格式规范](mkui-format.md)
