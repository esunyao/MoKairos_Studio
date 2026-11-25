import { RM_PROTOCOL_COLORS, type GraphicKind, type RmColorId } from "../protocol/constants";
import { normalizeGraphic } from "../protocol/geometry";
import { allocateFigureName, createStableId } from "../protocol/naming";
import type {
  LayerIndex,
  MkuiDocument,
  MkuiFrame,
  MkuiGraphic,
  MkuiGroup,
} from "../protocol/types";

/**
 * RM-UI-Designer1 `.rmui` (v1 / v2 JSON) 双向兼容适配器
 * 兼容参考：UICRM-Embedded/programs/ui_Standard/design/battery.rmui
 */

interface RawRmuiObject {
  type?: string;
  id?: number;
  name?: string;
  layer?: number;
  group?: string;
  color?: string;
  lineWidth?: number;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  r?: number;
  rx?: number;
  ry?: number;
  startAngle?: number;
  endAngle?: number;
  fontSize?: number;
  float?: number;
  number?: number;
  text?: string;
}

const RMUI_COLOR_TO_ID: Record<string, RmColorId> = {
  main: 0,
  red: 0,
  blue: 0,
  yellow: 1,
  green: 2,
  orange: 3,
  purple: 4,
  pink: 5,
  cyan: 6,
  black: 7,
  white: 8,
};

const ID_TO_RMUI_COLOR = RM_PROTOCOL_COLORS.map((c) => c.enumName);

function mapRmuiColor(color?: string): RmColorId {
  if (!color) {
    return 0;
  }
  return RMUI_COLOR_TO_ID[color.toLowerCase()] ?? 8;
}

function mapRmuiType(rmuiType?: string): GraphicKind | null {
  switch (rmuiType) {
    case "UiLine":
      return "line";
    case "UiRect":
      return "rect";
    case "UiRound":
      return "circle";
    case "UiEllipse":
      return "ellipse";
    case "UiArc":
      return "arc";
    case "UiFloat":
      return "float";
    case "UiNumber":
      return "int";
    case "UiText":
      return "text";
    default:
      return null;
  }
}

function convertRmuiObjectToGraphic(
  raw: RawRmuiObject,
  groupId: string,
  usedFigureNames: Set<string>,
  warnings: string[],
): MkuiGraphic | null {
  const kind = mapRmuiType(raw.type);
  if (!kind) {
    warnings.push(`已跳过不支持的图元类型：${String(raw.type ?? "unknown")}`);
    return null;
  }

  const displayName = (raw.name && raw.name.trim()) || `obj_${raw.id ?? usedFigureNames.size}`;
  const figureName = allocateFigureName(usedFigureNames, displayName);
  usedFigureNames.add(figureName);

  const base = {
    id: createStableId("g"),
    figureName,
    displayName,
    varKey: /^[A-Za-z_][A-Za-z0-9_]*$/.test(displayName) ? displayName : undefined,
    groupId,
    layer: Math.max(0, Math.min(9, Math.round(raw.layer ?? 0))) as LayerIndex,
    color: mapRmuiColor(raw.color),
    lineWidth: Math.max(1, Math.round(raw.lineWidth ?? 2)),
    dynamic: kind === "float" || kind === "int",
    visible: true,
    locked: false,
  };

  const rx0 = Math.round(raw.x ?? 100);
  const ry0 = Math.round(raw.y ?? 100);

  switch (kind) {
    case "line":
      return normalizeGraphic({
        ...base,
        kind: "line",
        startX: rx0,
        startY: ry0,
        endX: Math.round(raw.x2 ?? rx0 + 80),
        endY: Math.round(raw.y2 ?? ry0),
      });
    case "rect": {
      const w = Math.round(raw.width ?? 60);
      const h = Math.round(raw.height ?? 40);
      return normalizeGraphic({
        ...base,
        kind: "rect",
        startX: rx0,
        startY: ry0,
        endX: rx0 + w,
        endY: ry0 + h,
      });
    }
    case "circle":
      return normalizeGraphic({
        ...base,
        kind: "circle",
        centerX: rx0,
        centerY: ry0,
        radius: Math.max(1, Math.round(raw.r ?? 40)),
      });
    case "ellipse":
      return normalizeGraphic({
        ...base,
        kind: "ellipse",
        centerX: rx0,
        centerY: ry0,
        rx: Math.max(1, Math.round(raw.rx ?? 60)),
        ry: Math.max(1, Math.round(raw.ry ?? 40)),
      });
    case "arc":
      return normalizeGraphic({
        ...base,
        kind: "arc",
        centerX: rx0,
        centerY: ry0,
        rx: Math.max(1, Math.round(raw.rx ?? 80)),
        ry: Math.max(1, Math.round(raw.ry ?? 80)),
        startAngle: Math.round(raw.startAngle ?? 0),
        endAngle: Math.round(raw.endAngle ?? 90),
      });
    case "float":
      return normalizeGraphic({
        ...base,
        kind: "float",
        x: rx0,
        y: ry0,
        fontSize: Math.max(1, Math.round(raw.fontSize ?? 16)),
        value: typeof raw.float === "number" && Number.isFinite(raw.float) ? raw.float : 0,
      });
    case "int":
      return normalizeGraphic({
        ...base,
        kind: "int",
        x: rx0,
        y: ry0,
        fontSize: Math.max(1, Math.round(raw.fontSize ?? 16)),
        value: typeof raw.number === "number" && Number.isFinite(raw.number) ? Math.round(raw.number) : 0,
      });
    case "text":
      return normalizeGraphic({
        ...base,
        kind: "text",
        x: rx0,
        y: ry0,
        fontSize: Math.max(1, Math.round(raw.fontSize ?? 16)),
        text: typeof raw.text === "string" ? raw.text : "TEXT",
      });
  }
}

/** 导入 RM-UI-Designer .rmui (JSON v1/v2) 文件并转换为 MkuiDocument */
export function importRmuiJson(
  rawText: string,
  projectName = "导入的 RMUI 工程",
): { document: MkuiDocument; warnings: string[] } {
  const parsed = JSON.parse(rawText) as {
    version?: number;
    selected?: string;
    data?: Record<string, Record<string, RawRmuiObject>>;
  } & Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("无效的 .rmui JSON 内容");
  }

  const warnings: string[] = [];
  let rawFrames: Record<string, Record<string, RawRmuiObject>> = {};
  let selectedFrameName = "default";

  if (parsed.version === 2 && parsed.data && typeof parsed.data === "object") {
    rawFrames = { ...parsed.data };
    // 兼容 RM-UI-Designer1 normalizeTempFrameName 逻辑
    const keys = Object.keys(rawFrames);
    if (keys.includes("g")) {
      if (keys.length === 1) {
        rawFrames = { default: rawFrames.g };
      } else if (
        rawFrames.default &&
        Object.keys(rawFrames.default).length === 0
      ) {
        rawFrames.default = rawFrames.g;
        delete rawFrames.g;
      }
    }
    selectedFrameName =
      parsed.selected && rawFrames[parsed.selected]
        ? parsed.selected
        : Object.keys(rawFrames)[0] ?? "default";
  } else {
    // v1 格式：顶层直接为对象映射
    const objMap: Record<string, RawRmuiObject> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k !== "version" && v && typeof v === "object") {
        objMap[k] = v as RawRmuiObject;
      }
    }
    rawFrames = { default: objMap };
    selectedFrameName = "default";
  }

  const frameEntries = Object.entries(rawFrames);
  if (frameEntries.length === 0) {
    frameEntries.push(["default", {}]);
  }

  const frames: MkuiFrame[] = frameEntries.map(([frameName, objDict]) => {
    const frameId = createStableId("frm");
    const groupMap = new Map<string, MkuiGroup>();
    const graphics: MkuiGraphic[] = [];
    const usedNames = new Set<string>();

    const ensureGroup = (name: string): MkuiGroup => {
      const cleanName = name.trim() || "Ungroup";
      const existing = groupMap.get(cleanName);
      if (existing) {
        return existing;
      }
      const created: MkuiGroup = {
        id: createStableId("grp"),
        name: cleanName,
        visible: true,
        locked: false,
        collapsed: false,
      };
      groupMap.set(cleanName, created);
      return created;
    };

    for (const rawObj of Object.values(objDict ?? {})) {
      if (!rawObj || typeof rawObj !== "object") {
        continue;
      }
      const grp = ensureGroup(rawObj.group ?? "Ungroup");
      const converted = convertRmuiObjectToGraphic(rawObj, grp.id, usedNames, warnings);
      if (converted) {
        graphics.push(converted);
      }
    }

    if (groupMap.size === 0) {
      ensureGroup("Default");
    }

    return {
      id: frameId,
      name: frameName,
      groups: Array.from(groupMap.values()),
      graphics,
    };
  });

  const activeFrame =
    frames.find((f) => f.name === selectedFrameName) ?? frames[0];
  const now = new Date().toISOString();

  return {
    document: {
      schemaVersion: 1,
      projectId: createStableId("proj"),
      name: projectName,
      description: "由 .rmui 工程兼容导入",
      robotRole: "infantry_3",
      activeFrameId: activeFrame.id,
      frames,
      createdAt: now,
      updatedAt: now,
    },
    warnings,
  };
}

/** 将 MkuiDocument 导出为 RM-UI-Designer v2 JSON 字符串 */
export function exportToRmuiJson(doc: MkuiDocument): string {
  const data: Record<string, Record<string, RawRmuiObject>> = {};

  for (const frame of doc.frames) {
    const groupNameMap = new Map(frame.groups.map((g) => [g.id, g.name]));
    const objMap: Record<string, RawRmuiObject> = {};

    frame.graphics.forEach((g, index) => {
      const numId = index + 1;
      const color = ID_TO_RMUI_COLOR[g.color] ?? "white";
      const group = groupNameMap.get(g.groupId) ?? "Ungroup";
      const common = {
        id: numId,
        name: g.displayName || g.figureName,
        layer: g.layer,
        group,
        color,
      };

      switch (g.kind) {
        case "line":
          objMap[String(numId)] = {
            ...common,
            type: "UiLine",
            x: g.startX,
            y: g.startY,
            x2: g.endX,
            y2: g.endY,
            lineWidth: g.lineWidth,
          };
          break;
        case "rect":
          objMap[String(numId)] = {
            ...common,
            type: "UiRect",
            x: g.startX,
            y: g.startY,
            width: Math.max(0, g.endX - g.startX),
            height: Math.max(0, g.endY - g.startY),
            lineWidth: g.lineWidth,
          };
          break;
        case "circle":
          objMap[String(numId)] = {
            ...common,
            type: "UiRound",
            x: g.centerX,
            y: g.centerY,
            r: g.radius,
            lineWidth: g.lineWidth,
          };
          break;
        case "ellipse":
          objMap[String(numId)] = {
            ...common,
            type: "UiEllipse",
            x: g.centerX,
            y: g.centerY,
            rx: g.rx,
            ry: g.ry,
            lineWidth: g.lineWidth,
          };
          break;
        case "arc":
          objMap[String(numId)] = {
            ...common,
            type: "UiArc",
            x: g.centerX,
            y: g.centerY,
            rx: g.rx,
            ry: g.ry,
            startAngle: g.startAngle,
            endAngle: g.endAngle,
            lineWidth: g.lineWidth,
          };
          break;
        case "float":
          objMap[String(numId)] = {
            ...common,
            type: "UiFloat",
            x: g.x,
            y: g.y,
            fontSize: g.fontSize,
            float: g.value,
          };
          break;
        case "int":
          objMap[String(numId)] = {
            ...common,
            type: "UiNumber",
            x: g.x,
            y: g.y,
            fontSize: g.fontSize,
            number: g.value,
          };
          break;
        case "text":
          objMap[String(numId)] = {
            ...common,
            type: "UiText",
            x: g.x,
            y: g.y,
            fontSize: g.fontSize,
            text: g.text,
          };
          break;
      }
    });

    data[frame.name] = objMap;
  }

  const activeFrame =
    doc.frames.find((f) => f.id === doc.activeFrameId) ?? doc.frames[0];

  return JSON.stringify(
    {
      version: 2,
      data,
      selected: activeFrame?.name ?? "default",
    },
    null,
    2,
  );
}
