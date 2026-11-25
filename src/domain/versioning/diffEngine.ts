import { RM_PROTOCOL_COLORS } from "../protocol/constants";
import type {
  DocumentDiff,
  FrameDiffItem,
  GraphicDiffItem,
  GraphicFieldChange,
  MkuiDocument,
  MkuiGraphic,
} from "../protocol/types";

/**
 * 版本控制结构化 Diff 对比引擎
 * 精确比对两份 MkuiDocument 之间的 Frame 与图元属性差异
 */

const FIELD_LABELS: Record<string, string> = {
  figureName: "协议短名",
  displayName: "显示名",
  varKey: "变量键",
  layer: "图层",
  color: "协议颜色",
  lineWidth: "线宽",
  dynamic: "动态刷新",
  startX: "起点 X",
  startY: "起点 Y",
  endX: "终点 X",
  endY: "终点 Y",
  centerX: "圆心 X",
  centerY: "圆心 Y",
  radius: "半径",
  rx: "X 半轴",
  ry: "Y 半轴",
  startAngle: "起始角",
  endAngle: "终止角",
  x: "X 坐标",
  y: "Y 坐标",
  fontSize: "字号",
  value: "数值",
  text: "文本内容",
};

function formatFieldValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  if (field === "color" && typeof value === "number") {
    return RM_PROTOCOL_COLORS[value]?.label ?? String(value);
  }
  if (field === "dynamic") {
    return value ? "Dynamic" : "Static";
  }
  return String(value);
}

function diffSingleGraphic(before: MkuiGraphic, after: MkuiGraphic): GraphicFieldChange[] {
  const changes: GraphicFieldChange[] = [];
  const allKeys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);

  const ignoredKeys = new Set(["id", "groupId", "visible", "locked"]);

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) {
      continue;
    }
    const prevVal = (before as unknown as Record<string, unknown>)[key];
    const nextVal = (after as unknown as Record<string, unknown>)[key];
    if (prevVal !== nextVal) {
      changes.push({
        field: key,
        label: FIELD_LABELS[key] ?? key,
        before: formatFieldValue(key, prevVal),
        after: formatFieldValue(key, nextVal),
      });
    }
  }
  return changes;
}

/** 对比 baseDoc -> targetDoc 的结构化变化 */
export function computeDocumentDiff(
  baseDoc: MkuiDocument | null,
  targetDoc: MkuiDocument,
): DocumentDiff {
  const frameDiffs: FrameDiffItem[] = [];
  const graphicDiffs: GraphicDiffItem[] = [];

  if (!baseDoc) {
    for (const f of targetDoc.frames) {
      frameDiffs.push({ kind: "added", frameId: f.id, afterName: f.name });
      for (const g of f.graphics) {
        graphicDiffs.push({
          kind: "added",
          frameId: f.id,
          frameName: f.name,
          graphicId: g.id,
          displayName: g.displayName,
          figureName: g.figureName,
          graphicKind: g.kind,
          changes: [],
        });
      }
    }
    return {
      frameDiffs,
      graphicDiffs,
      addedCount: graphicDiffs.length,
      removedCount: 0,
      modifiedCount: 0,
    };
  }

  const baseFrameMap = new Map(baseDoc.frames.map((f) => [f.id, f]));
  const targetFrameMap = new Map(targetDoc.frames.map((f) => [f.id, f]));

  for (const baseFrame of baseDoc.frames) {
    const targetFrame = targetFrameMap.get(baseFrame.id);
    if (!targetFrame) {
      frameDiffs.push({
        kind: "removed",
        frameId: baseFrame.id,
        beforeName: baseFrame.name,
      });
      for (const g of baseFrame.graphics) {
        graphicDiffs.push({
          kind: "removed",
          frameId: baseFrame.id,
          frameName: baseFrame.name,
          graphicId: g.id,
          displayName: g.displayName,
          figureName: g.figureName,
          graphicKind: g.kind,
          changes: [],
        });
      }
      continue;
    }

    if (baseFrame.name !== targetFrame.name) {
      frameDiffs.push({
        kind: "renamed",
        frameId: baseFrame.id,
        beforeName: baseFrame.name,
        afterName: targetFrame.name,
      });
    }

    const baseGraphics = new Map(baseFrame.graphics.map((g) => [g.id, g]));
    const targetGraphics = new Map(targetFrame.graphics.map((g) => [g.id, g]));

    for (const g of baseFrame.graphics) {
      const next = targetGraphics.get(g.id);
      if (!next) {
        graphicDiffs.push({
          kind: "removed",
          frameId: targetFrame.id,
          frameName: targetFrame.name,
          graphicId: g.id,
          displayName: g.displayName,
          figureName: g.figureName,
          graphicKind: g.kind,
          changes: [],
        });
      } else {
        const changes = diffSingleGraphic(g, next);
        if (changes.length > 0) {
          graphicDiffs.push({
            kind: "modified",
            frameId: targetFrame.id,
            frameName: targetFrame.name,
            graphicId: next.id,
            displayName: next.displayName,
            figureName: next.figureName,
            graphicKind: next.kind,
            changes,
          });
        }
      }
    }

    for (const next of targetFrame.graphics) {
      if (!baseGraphics.has(next.id)) {
        graphicDiffs.push({
          kind: "added",
          frameId: targetFrame.id,
          frameName: targetFrame.name,
          graphicId: next.id,
          displayName: next.displayName,
          figureName: next.figureName,
          graphicKind: next.kind,
          changes: [],
        });
      }
    }
  }

  for (const targetFrame of targetDoc.frames) {
    if (!baseFrameMap.has(targetFrame.id)) {
      frameDiffs.push({
        kind: "added",
        frameId: targetFrame.id,
        afterName: targetFrame.name,
      });
      for (const g of targetFrame.graphics) {
        graphicDiffs.push({
          kind: "added",
          frameId: targetFrame.id,
          frameName: targetFrame.name,
          graphicId: g.id,
          displayName: g.displayName,
          figureName: g.figureName,
          graphicKind: g.kind,
          changes: [],
        });
      }
    }
  }

  return {
    frameDiffs,
    graphicDiffs,
    addedCount: graphicDiffs.filter((d) => d.kind === "added").length,
    removedCount: graphicDiffs.filter((d) => d.kind === "removed").length,
    modifiedCount: graphicDiffs.filter((d) => d.kind === "modified").length,
  };
}
