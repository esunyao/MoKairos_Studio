import {
  RM_CANVAS_HEIGHT,
  RM_CANVAS_WIDTH,
  RM_PROTOCOL_LIMITS,
} from "./constants";
import type { MkuiGraphic } from "./types";

/**
 * RoboMaster 左下角原点坐标系与 Konva 左上角原点坐标系转换及几何规范化纯函数
 * 规则：严禁通过对 Konva Layer 设置 scaleY: -1 模拟左下原点，所有换算在此统一完成。
 */

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function rmYToCanvasY(rmY: number): number {
  return RM_CANVAS_HEIGHT - rmY;
}

export function canvasYToRmY(canvasY: number): number {
  return clampInt(RM_CANVAS_HEIGHT - canvasY, 0, RM_CANVAS_HEIGHT);
}

export function rmPointToCanvas(rmX: number, rmY: number): { x: number; y: number } {
  return { x: rmX, y: rmYToCanvasY(rmY) };
}

export function canvasPointToRm(canvasX: number, canvasY: number): { x: number; y: number } {
  return {
    x: clampInt(canvasX, 0, RM_CANVAS_WIDTH),
    y: canvasYToRmY(canvasY),
  };
}

/** 规范化角度到 [0, 360) */
export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) {
    return 0;
  }
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * 将 RM 协议圆弧角度（0° 在 12 点钟正上方，顺时针递增）
 * 转换为 HTML5 Canvas 2D ctx.ellipse 弧度（0 在 3 点钟正右侧，顺时针递增）
 */
export function rmArcToCanvasRadians(
  startDeg: number,
  endDeg: number,
): {
  startRad: number;
  endRad: number;
  sweepDeg: number;
} {
  const s = ((startDeg % 360) + 360) % 360;
  const e = ((endDeg % 360) + 360) % 360;
  const sweepDeg = e === s ? 360 : (e - s + 360) % 360;
  const startRad = ((s - 90) * Math.PI) / 180;
  const endRad = startRad + (sweepDeg * Math.PI) / 180;
  return { startRad, endRad, sweepDeg };
}

/**
 * 计算 RM 圆弧角度对应的 Canvas 相对圆心锚点坐标（用于拖拽起/止角度手柄）
 */
export function rmAngleToCanvasOffset(
  angleDeg: number,
  rx: number,
  ry: number,
): { dx: number; dy: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    dx: rx * Math.cos(rad),
    dy: ry * Math.sin(rad),
  };
}

/**
 * 将 Canvas 上相对于圆心的向量 (dx, dy) 反算回 RM 12 点顺时针角度 [0, 360)
 */
export function canvasOffsetToRmAngle(
  dx: number,
  dy: number,
  rx: number,
  ry: number,
): number {
  const safeRx = Math.max(1, rx);
  const safeRy = Math.max(1, ry);
  const rad = Math.atan2(dy / safeRy, dx / safeRx);
  const deg = (rad * 180) / Math.PI + 90;
  return normalizeAngleDeg(deg);
}

/** 规范化任意图元的几何参数为协议合法整数（消除浮点误差和负尺寸） */
export function normalizeGraphic<T extends MkuiGraphic>(graphic: T): T {
  const baseNormalized = {
    ...graphic,
    layer: clampInt(
      graphic.layer,
      RM_PROTOCOL_LIMITS.minLayer,
      RM_PROTOCOL_LIMITS.maxLayer,
    ) as T["layer"],
    color: clampInt(graphic.color, 0, 8) as T["color"],
    lineWidth: clampInt(
      graphic.lineWidth,
      RM_PROTOCOL_LIMITS.minLineWidth,
      RM_PROTOCOL_LIMITS.maxLineWidth,
    ),
  };

  switch (baseNormalized.kind) {
    case "line":
      return {
        ...baseNormalized,
        startX: clampInt(baseNormalized.startX, 0, RM_CANVAS_WIDTH),
        startY: clampInt(baseNormalized.startY, 0, RM_CANVAS_HEIGHT),
        endX: clampInt(baseNormalized.endX, 0, RM_CANVAS_WIDTH),
        endY: clampInt(baseNormalized.endY, 0, RM_CANVAS_HEIGHT),
      } as T;

    case "rect": {
      const x1 = clampInt(baseNormalized.startX, 0, RM_CANVAS_WIDTH);
      const y1 = clampInt(baseNormalized.startY, 0, RM_CANVAS_HEIGHT);
      const x2 = clampInt(baseNormalized.endX, 0, RM_CANVAS_WIDTH);
      const y2 = clampInt(baseNormalized.endY, 0, RM_CANVAS_HEIGHT);
      return {
        ...baseNormalized,
        startX: Math.min(x1, x2),
        startY: Math.min(y1, y2),
        endX: Math.max(x1, x2),
        endY: Math.max(y1, y2),
      } as T;
    }

    case "circle":
      return {
        ...baseNormalized,
        centerX: clampInt(baseNormalized.centerX, 0, RM_CANVAS_WIDTH),
        centerY: clampInt(baseNormalized.centerY, 0, RM_CANVAS_HEIGHT),
        radius: clampInt(
          Math.abs(baseNormalized.radius),
          RM_PROTOCOL_LIMITS.minRadius,
          RM_PROTOCOL_LIMITS.maxRadius,
        ),
      } as T;

    case "ellipse":
      return {
        ...baseNormalized,
        centerX: clampInt(baseNormalized.centerX, 0, RM_CANVAS_WIDTH),
        centerY: clampInt(baseNormalized.centerY, 0, RM_CANVAS_HEIGHT),
        rx: clampInt(
          Math.abs(baseNormalized.rx),
          RM_PROTOCOL_LIMITS.minSemiAxis,
          RM_PROTOCOL_LIMITS.maxSemiAxis,
        ),
        ry: clampInt(
          Math.abs(baseNormalized.ry),
          RM_PROTOCOL_LIMITS.minSemiAxis,
          RM_PROTOCOL_LIMITS.maxSemiAxis,
        ),
      } as T;

    case "arc":
      return {
        ...baseNormalized,
        centerX: clampInt(baseNormalized.centerX, 0, RM_CANVAS_WIDTH),
        centerY: clampInt(baseNormalized.centerY, 0, RM_CANVAS_HEIGHT),
        rx: clampInt(
          Math.abs(baseNormalized.rx),
          RM_PROTOCOL_LIMITS.minSemiAxis,
          RM_PROTOCOL_LIMITS.maxSemiAxis,
        ),
        ry: clampInt(
          Math.abs(baseNormalized.ry),
          RM_PROTOCOL_LIMITS.minSemiAxis,
          RM_PROTOCOL_LIMITS.maxSemiAxis,
        ),
        startAngle: normalizeAngleDeg(baseNormalized.startAngle),
        endAngle: normalizeAngleDeg(baseNormalized.endAngle),
      } as T;

    case "float":
      return {
        ...baseNormalized,
        x: clampInt(baseNormalized.x, 0, RM_CANVAS_WIDTH),
        y: clampInt(baseNormalized.y, 0, RM_CANVAS_HEIGHT),
        fontSize: clampInt(
          baseNormalized.fontSize,
          RM_PROTOCOL_LIMITS.minFontSize,
          RM_PROTOCOL_LIMITS.maxFontSize,
        ),
        value: Number.isFinite(baseNormalized.value)
          ? Math.round(baseNormalized.value * 1000) / 1000
          : 0,
      } as T;

    case "int":
      return {
        ...baseNormalized,
        x: clampInt(baseNormalized.x, 0, RM_CANVAS_WIDTH),
        y: clampInt(baseNormalized.y, 0, RM_CANVAS_HEIGHT),
        fontSize: clampInt(
          baseNormalized.fontSize,
          RM_PROTOCOL_LIMITS.minFontSize,
          RM_PROTOCOL_LIMITS.maxFontSize,
        ),
        value: clampInt(
          baseNormalized.value,
          RM_PROTOCOL_LIMITS.int32Min,
          RM_PROTOCOL_LIMITS.int32Max,
        ),
      } as T;

    case "text":
      return {
        ...baseNormalized,
        x: clampInt(baseNormalized.x, 0, RM_CANVAS_WIDTH),
        y: clampInt(baseNormalized.y, 0, RM_CANVAS_HEIGHT),
        fontSize: clampInt(
          baseNormalized.fontSize,
          RM_PROTOCOL_LIMITS.minFontSize,
          RM_PROTOCOL_LIMITS.maxFontSize,
        ),
      } as T;
  }
}

export interface RmBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 计算图元在 RM 左下角原点下的包围盒 */
export function getGraphicRmBoundingBox(graphic: MkuiGraphic): RmBoundingBox {
  switch (graphic.kind) {
    case "line":
    case "rect":
      return {
        minX: Math.min(graphic.startX, graphic.endX),
        minY: Math.min(graphic.startY, graphic.endY),
        maxX: Math.max(graphic.startX, graphic.endX),
        maxY: Math.max(graphic.startY, graphic.endY),
      };
    case "circle":
      return {
        minX: graphic.centerX - graphic.radius,
        minY: graphic.centerY - graphic.radius,
        maxX: graphic.centerX + graphic.radius,
        maxY: graphic.centerY + graphic.radius,
      };
    case "ellipse":
    case "arc":
      return {
        minX: graphic.centerX - graphic.rx,
        minY: graphic.centerY - graphic.ry,
        maxX: graphic.centerX + graphic.rx,
        maxY: graphic.centerY + graphic.ry,
      };
    case "float":
    case "int": {
      const textLen =
        graphic.kind === "float"
          ? graphic.value.toFixed(3).length
          : String(Math.round(graphic.value)).length;
      const estW = Math.max(20, Math.round(textLen * graphic.fontSize * 0.65));
      const estH = Math.max(12, Math.round(graphic.fontSize * 1.1));
      return {
        minX: graphic.x,
        minY: graphic.y - estH,
        maxX: graphic.x + estW,
        maxY: graphic.y,
      };
    }
    case "text": {
      const estW = Math.max(20, Math.round(graphic.text.length * graphic.fontSize * 0.72));
      const estH = Math.max(12, Math.round(graphic.fontSize * 1.1));
      return {
        minX: graphic.x,
        minY: graphic.y - estH,
        maxX: graphic.x + estW,
        maxY: graphic.y,
      };
    }
  }
}

/** 整体平移图元（RM 坐标系增量 dx, dy） */
export function translateGraphicRm<T extends MkuiGraphic>(
  graphic: T,
  dx: number,
  dy: number,
): T {
  const roundDx = Math.round(dx);
  const roundDy = Math.round(dy);

  switch (graphic.kind) {
    case "line":
    case "rect":
      return normalizeGraphic({
        ...graphic,
        startX: graphic.startX + roundDx,
        startY: graphic.startY + roundDy,
        endX: graphic.endX + roundDx,
        endY: graphic.endY + roundDy,
      }) as T;
    case "circle":
    case "ellipse":
    case "arc":
      return normalizeGraphic({
        ...graphic,
        centerX: graphic.centerX + roundDx,
        centerY: graphic.centerY + roundDy,
      }) as T;
    case "float":
    case "int":
    case "text":
      return normalizeGraphic({
        ...graphic,
        x: graphic.x + roundDx,
        y: graphic.y + roundDy,
      }) as T;
  }
}
