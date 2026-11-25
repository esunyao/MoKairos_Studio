/**
 * RoboMaster 2027 裁判系统串口协议常量定义
 * 依据《串口协议完整转录.md》0x0301（0x0100 ~ 0x0110）及附录二整理
 */

export const RM_CANVAS_WIDTH = 1920;
export const RM_CANVAS_HEIGHT = 1080;

/** 协议位域边界限制 */
export const RM_PROTOCOL_LIMITS = {
  maxCoordinateX: 1920,
  maxCoordinateY: 1080,
  minLineWidth: 1,
  maxLineWidth: 1023,
  minLayer: 0,
  maxLayer: 9,
  minRadius: 1,
  maxRadius: 1023,
  minSemiAxis: 1,
  maxSemiAxis: 2047,
  minFontSize: 1,
  maxFontSize: 511,
  maxFigureNameBytes: 3,
  maxTextUtf8Bytes: 30,
  floatScaleFactor: 1000,
  int32Min: -2147483648,
  int32Max: 2147483647,
  maxCommandHz: 30,
  standardBandwidthBytesPerSec: 3720,
  sentryBandwidthBytesPerSec: 5120,
} as const;

/** 裁判系统支持的 8 类基本图元（对应 figure_tpye 0..7） */
export type GraphicKind =
  | "line"
  | "rect"
  | "circle"
  | "ellipse"
  | "arc"
  | "float"
  | "int"
  | "text";

export interface GraphicKindMeta {
  kind: GraphicKind;
  protocolCode: number;
  label: string;
  shortLabel: string;
  rmuiType: string;
}

export const GRAPHIC_KIND_METAS: readonly GraphicKindMeta[] = [
  { kind: "line", protocolCode: 0, label: "直线", shortLabel: "直线", rmuiType: "UiLine" },
  { kind: "rect", protocolCode: 1, label: "矩形", shortLabel: "矩形", rmuiType: "UiRect" },
  { kind: "circle", protocolCode: 2, label: "正圆", shortLabel: "正圆", rmuiType: "UiRound" },
  { kind: "ellipse", protocolCode: 3, label: "椭圆", shortLabel: "椭圆", rmuiType: "UiEllipse" },
  { kind: "arc", protocolCode: 4, label: "圆弧", shortLabel: "圆弧", rmuiType: "UiArc" },
  { kind: "float", protocolCode: 5, label: "浮点数", shortLabel: "浮点", rmuiType: "UiFloat" },
  { kind: "int", protocolCode: 6, label: "整型数", shortLabel: "整型", rmuiType: "UiNumber" },
  { kind: "text", protocolCode: 7, label: "字符", shortLabel: "字符", rmuiType: "UiText" },
] as const;

export const GRAPHIC_KIND_MAP: Record<GraphicKind, GraphicKindMeta> = Object.fromEntries(
  GRAPHIC_KIND_METAS.map((item) => [item.kind, item]),
) as Record<GraphicKind, GraphicKindMeta>;

/** 协议颜色 ID（0..8） */
export type RmColorId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RmProtocolColorMeta {
  id: RmColorId;
  enumName: "main" | "yellow" | "green" | "orange" | "purple" | "pink" | "cyan" | "black" | "white";
  label: string;
  redPreviewHex: string;
  bluePreviewHex: string;
}

/** 裁判系统协议 9 色只读表（画布内图元严禁使用除此之外的任何颜色） */
export const RM_PROTOCOL_COLORS: readonly RmProtocolColorMeta[] = [
  { id: 0, enumName: "main", label: "红蓝主色", redPreviewHex: "#FF3B30", bluePreviewHex: "#00A8FF" },
  { id: 1, enumName: "yellow", label: "黄色", redPreviewHex: "#FFD60A", bluePreviewHex: "#FFD60A" },
  { id: 2, enumName: "green", label: "绿色", redPreviewHex: "#00E676", bluePreviewHex: "#00E676" },
  { id: 3, enumName: "orange", label: "橙色", redPreviewHex: "#FF8C00", bluePreviewHex: "#FF8C00" },
  { id: 4, enumName: "purple", label: "紫红色", redPreviewHex: "#C040FF", bluePreviewHex: "#C040FF" },
  { id: 5, enumName: "pink", label: "粉色", redPreviewHex: "#FF69B4", bluePreviewHex: "#FF69B4" },
  { id: 6, enumName: "cyan", label: "青色", redPreviewHex: "#00E5FF", bluePreviewHex: "#00E5FF" },
  { id: 7, enumName: "black", label: "黑色", redPreviewHex: "#000000", bluePreviewHex: "#000000" },
  { id: 8, enumName: "white", label: "白色", redPreviewHex: "#FFFFFF", bluePreviewHex: "#FFFFFF" },
] as const;

export function getProtocolColorHex(colorId: RmColorId, team: "red" | "blue"): string {
  const meta = RM_PROTOCOL_COLORS[colorId] ?? RM_PROTOCOL_COLORS[8];
  return team === "blue" ? meta.bluePreviewHex : meta.redPreviewHex;
}

/** 2027 协议兵种角色标识（注：2/102 为保留位） */
export type RobotRole2027 =
  | "heavy_1"
  | "infantry_3"
  | "infantry_4"
  | "infantry_5"
  | "aerial_6"
  | "sentry_7"
  | "custom";

export interface RobotRoleMeta {
  role: RobotRole2027;
  label: string;
  shortLabel: string;
  redRobotId: number;
  redClientId: number | null;
  blueRobotId: number;
  blueClientId: number | null;
  bandwidthLimitBytesPerSec: number;
}

export const ROBOT_ROLES_2027: readonly RobotRoleMeta[] = [
  {
    role: "infantry_3",
    label: "3 号步兵机器人",
    shortLabel: "步兵 #3",
    redRobotId: 3,
    redClientId: 0x0103,
    blueRobotId: 103,
    blueClientId: 0x0167,
    bandwidthLimitBytesPerSec: 3720,
  },
  {
    role: "infantry_4",
    label: "4 号步兵机器人",
    shortLabel: "步兵 #4",
    redRobotId: 4,
    redClientId: 0x0104,
    blueRobotId: 104,
    blueClientId: 0x0168,
    bandwidthLimitBytesPerSec: 3720,
  },
  {
    role: "infantry_5",
    label: "5 号步兵机器人",
    shortLabel: "步兵 #5",
    redRobotId: 5,
    redClientId: 0x0105,
    blueRobotId: 105,
    blueClientId: 0x0169,
    bandwidthLimitBytesPerSec: 3720,
  },
  {
    role: "heavy_1",
    label: "1 号重装机器人",
    shortLabel: "重装 #1",
    redRobotId: 1,
    redClientId: 0x0101,
    blueRobotId: 101,
    blueClientId: 0x0165,
    bandwidthLimitBytesPerSec: 3720,
  },
  {
    role: "aerial_6",
    label: "6 号空中系统",
    shortLabel: "空中 #6",
    redRobotId: 6,
    redClientId: 0x0106,
    blueRobotId: 106,
    blueClientId: 0x016a,
    bandwidthLimitBytesPerSec: 3720,
  },
  {
    role: "sentry_7",
    label: "7 号哨兵机器人（无选手端）",
    shortLabel: "哨兵 #7",
    redRobotId: 7,
    redClientId: null,
    blueRobotId: 107,
    blueClientId: null,
    bandwidthLimitBytesPerSec: 5120,
  },
  {
    role: "custom",
    label: "通用自定义工程",
    shortLabel: "通用",
    redRobotId: 3,
    redClientId: 0x0103,
    blueRobotId: 103,
    blueClientId: 0x0167,
    bandwidthLimitBytesPerSec: 3720,
  },
] as const;

export function getRobotRoleMeta(role: RobotRole2027): RobotRoleMeta {
  return ROBOT_ROLES_2027.find((item) => item.role === role) ?? ROBOT_ROLES_2027[0];
}

export function deriveRobotAndClientIds(
  role: RobotRole2027,
  team: "red" | "blue",
): { robotId: number; clientId: number | null; bandwidthLimit: number } {
  const meta = getRobotRoleMeta(role);
  return team === "red"
    ? {
        robotId: meta.redRobotId,
        clientId: meta.redClientId,
        bandwidthLimit: meta.bandwidthLimitBytesPerSec,
      }
    : {
        robotId: meta.blueRobotId,
        clientId: meta.blueClientId,
        bandwidthLimit: meta.bandwidthLimitBytesPerSec,
      };
}

/** 官方客户端原生遮挡禁区（基于 RM 左下角原点标定，仅用于设计辅助预警） */
export type SafeAreaZone =
  | {
      id: string;
      label: string;
      shape: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      id: string;
      label: string;
      shape: "circle";
      cx: number;
      cy: number;
      r: number;
    };

export const SAFE_AREA_ZONES: readonly SafeAreaZone[] = [
  {
    id: "scoreboard-top",
    label: "顶部比分与 6v6 槽位区 (y > 880)",
    shape: "rect",
    x: 0,
    y: 880,
    width: 1920,
    height: 200,
  },
  {
    id: "center-reticle",
    label: "中心官方准星圈 (r ≤ 90)",
    shape: "circle",
    cx: 960,
    cy: 540,
    r: 90,
  },
  {
    id: "shooter-panel",
    label: "右侧「机构1射速/弹量」框",
    shape: "rect",
    x: 1320,
    y: 470,
    width: 160,
    height: 140,
  },
  {
    id: "bottom-left-hud",
    label: "左下血条/功率/状态灯区",
    shape: "rect",
    x: 0,
    y: 0,
    width: 780,
    height: 230,
  },
  {
    id: "bottom-right-minimap",
    label: "右下场地小地图区",
    shape: "rect",
    x: 1420,
    y: 0,
    width: 500,
    height: 310,
  },
] as const;

/** 0x0301 绘图子命令整帧字节长度（含 5B frame_header + 2B cmd_id + 6B 交互头 + 内容 + 2B CRC16） */
export const PACKET_TOTAL_BYTES = {
  deleteLayer: 17, // 0x0100: 6 + 2 + 9 = 17
  graphic1: 30, // 0x0101: 6 + 15 + 9 = 30
  graphic2: 45, // 0x0102: 6 + 30 + 9 = 45
  graphic5: 90, // 0x0103: 6 + 75 + 9 = 90
  graphic7: 120, // 0x0104: 6 + 105 + 9 = 120
  character: 60, // 0x0110: 6 + 45 + 9 = 60
} as const;
