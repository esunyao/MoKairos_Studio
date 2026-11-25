import type { GraphicKind, RmColorId, RobotRole2027 } from "./constants";

/**
 * MoKairos Studio 核心领域类型定义（与 Rust 端 serde 模型 1:1 对齐）
 * 约定：所有坐标、宽高、半径、角度均以 RoboMaster 裁判系统「左下角原点 (0,0)」为准
 */

export type LayerIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface GraphicBase {
  /** 内部稳定 UUID（供 React key、选中状态与版本 Diff 跟踪） */
  id: string;
  /** 裁判系统 3 字节唯一索引名 figure_name[3] */
  figureName: string;
  /** 编辑器展示名称（支持中文与可读描述） */
  displayName: string;
  /** 嵌入式变量绑定键（如 supercap.pct，供未来 UICRM-Embedded 变量映射更新） */
  varKey?: string;
  /** 所属图元分组 ID */
  groupId: string;
  /** 裁判系统图层 0..9 */
  layer: LayerIndex;
  /** 协议颜色枚举 0..8 */
  color: RmColorId;
  /** 线宽 1..1023 */
  lineWidth: number;
  /** 是否为动态图元（参与运行期 Modify 更新与模拟器遥测） */
  dynamic: boolean;
  /** 编辑期辅助显隐（不影响协议导出） */
  visible: boolean;
  /** 编辑期防误触锁定 */
  locked: boolean;
}

export interface LineGraphic extends GraphicBase {
  kind: "line";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface RectGraphic extends GraphicBase {
  kind: "rect";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface CircleGraphic extends GraphicBase {
  kind: "circle";
  centerX: number;
  centerY: number;
  radius: number;
}

export interface EllipseGraphic extends GraphicBase {
  kind: "ellipse";
  centerX: number;
  centerY: number;
  rx: number;
  ry: number;
}

export interface ArcGraphic extends GraphicBase {
  kind: "arc";
  centerX: number;
  centerY: number;
  rx: number;
  ry: number;
  /** 起始角度 0..360（0° 为 12 点钟正上方，顺时针递增） */
  startAngle: number;
  /** 终止角度 0..360（0° 为 12 点钟正上方，顺时针递增） */
  endAngle: number;
}

export interface FloatGraphic extends GraphicBase {
  kind: "float";
  x: number;
  y: number;
  fontSize: number;
  /** 浮点数值（协议底层编码为 int32(round(value * 1000))） */
  value: number;
}

export interface IntGraphic extends GraphicBase {
  kind: "int";
  x: number;
  y: number;
  fontSize: number;
  /** 32 位有符号整数 */
  value: number;
}

export interface TextGraphic extends GraphicBase {
  kind: "text";
  x: number;
  y: number;
  fontSize: number;
  /** 字符内容（UTF-8 编码不得超过 30 字节） */
  text: string;
}

export type MkuiGraphic =
  | LineGraphic
  | RectGraphic
  | CircleGraphic
  | EllipseGraphic
  | ArcGraphic
  | FloatGraphic
  | IntGraphic
  | TextGraphic;

export type GraphicByKind<K extends GraphicKind> = Extract<MkuiGraphic, { kind: K }>;

export interface MkuiGroup {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  collapsed: boolean;
}

export interface MkuiFrame {
  id: string;
  name: string;
  groups: MkuiGroup[];
  graphics: MkuiGraphic[];
}

export interface MkuiDocument {
  schemaVersion: 1;
  projectId: string;
  name: string;
  description: string;
  robotRole: RobotRole2027;
  activeFrameId: string;
  frames: MkuiFrame[];
  createdAt: string;
  updatedAt: string;
}

/** .mkui ZIP 包根目录明文清单 manifest.json */
export interface MkuiManifest {
  format: "mkui";
  schemaVersion: 1;
  appVersion: string;
  projectId: string;
  name: string;
  description: string;
  robotRole: RobotRole2027;
  canvas: {
    width: 1920;
    height: 1080;
    origin: "bottom-left";
  };
  activeFrameId: string;
  headCommitId: string | null;
  commitCount: number;
  stats: {
    frameCount: number;
    graphicCount: number;
    textCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

/** 版本控制提交记录 */
export interface VersionCommitEntry {
  commitId: string;
  parentId: string | null;
  versionTag: string | null;
  message: string;
  author: string;
  createdAt: string;
  sha256: string;
  frameCount: number;
  graphicCount: number;
  textCount: number;
}

export interface VersionIndex {
  headCommitId: string | null;
  commits: VersionCommitEntry[];
}

/** 结构化版本对比结果 */
export interface GraphicFieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface GraphicDiffItem {
  kind: "added" | "removed" | "modified";
  frameId: string;
  frameName: string;
  graphicId: string;
  displayName: string;
  figureName: string;
  graphicKind: GraphicKind;
  changes: GraphicFieldChange[];
}

export interface FrameDiffItem {
  kind: "added" | "removed" | "renamed";
  frameId: string;
  beforeName?: string;
  afterName?: string;
}

export interface DocumentDiff {
  frameDiffs: FrameDiffItem[];
  graphicDiffs: GraphicDiffItem[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
}

/** 协议预检条目 */
export interface PreflightIssue {
  id: string;
  severity: "error" | "warn";
  code: string;
  message: string;
  detail?: string;
  frameId?: string;
  graphicId?: string;
}

/** 单 Frame 发包拆包与带宽预算报告 */
export interface GroupPacketSlice {
  groupId: string;
  groupName: string;
  subCmdId: 0x0101 | 0x0102 | 0x0103 | 0x0104 | 0x0110;
  itemCount: number;
  packetBytes: number;
  dynamicCount: number;
}

export interface PacketBudgetReport {
  frameId: string;
  frameName: string;
  totalGraphics: number;
  shapeCount: number;
  textCount: number;
  dynamicCount: number;
  graphicPacketCount: number;
  charPacketCount: number;
  totalPacketCount: number;
  fullRefreshBytes: number;
  dynamicRefreshBytes: number;
  bandwidthLimitBytesPerSec: number;
  estimatedRefreshHz: number;
  bandwidthRatioAt10Hz: number;
  slices: GroupPacketSlice[];
}

export interface RecentProjectEntry {
  projectId: string;
  name: string;
  filePath: string;
  robotRole: RobotRole2027;
  frameCount: number;
  graphicCount: number;
  headCommitId: string | null;
  commitCount: number;
  updatedAt: string;
}
