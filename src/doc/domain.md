# 前端领域引擎 (`src/domain/`)

`src/domain/` 为**零 React / Konva 依赖**的纯 TypeScript 层，承载所有 RoboMaster 2027 协议逻辑，全部覆盖 Vitest 单元测试。

## 模块清单

- **[protocol/constants.ts](../domain/protocol/constants.ts)**：`1920×1080` 画布尺寸、8 类图元枚举、9 色协议只读常量、位域限值、2027 兵种 ID 与选手端 ID 推导表。
- **[protocol/types.ts](../domain/protocol/types.ts)**：`MkuiDocument`、`MkuiFrame`、`MkuiGroup`、`MkuiGraphic`（8 种判别联合，含 `varKey`）、`MkuiManifest`、`VersionIndex`、`PreflightIssue` 等核心类型。
- **[protocol/geometry.ts](../domain/protocol/geometry.ts)**：RM 左下角原点 ↔ Konva 左上角原点双向转换、12 点钟顺时针圆弧角与椭圆弧反算、`normalizeGraphic` 整数钳制、包围盒与平移。
- **[protocol/naming.ts](../domain/protocol/naming.ts)**：`TextEncoder` 真实 UTF-8 字节计数、全局唯一 3 字节 `figureName` 分配、C 标识符检验。
- **[protocol/packetBudget.ts](../domain/protocol/packetBudget.ts)**：7/5/2/1 图形拆包与 60 B 字符独占帧预算及刷新率评估。
- **[protocol/crcAndFrame.ts](../domain/protocol/crcAndFrame.ts)**：官方标准 CRC8/CRC16 校验与 `0x0301` 协议帧字节构造（供模拟器日志检视）。
- **[protocol/preflight.ts](../domain/protocol/preflight.ts)**：协议规则与视口越界检查。
- **[adapters/rmuiAdapter.ts](../domain/adapters/rmuiAdapter.ts)**：RM-UI-Designer `.rmui` (v1/v2 JSON) 双向兼容转换器。
- **[versioning/diffEngine.ts](../domain/versioning/diffEngine.ts)**：两版本 `MkuiDocument` 结构化属性对比引擎。
- **[templates/starterTemplates.ts](../domain/templates/starterTemplates.ts)**：4 套 2027 兵种开箱模板。
- **[__tests__/](../domain/__tests__/)**：`geometry.test.ts`、`protocol.test.ts`、`rmuiAdapter.test.ts`、`diffEngine.test.ts`。

[返回前端总览](README.md)
