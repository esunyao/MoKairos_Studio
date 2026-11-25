import { describe, expect, it } from "vitest";
import {
  canvasOffsetToRmAngle,
  canvasYToRmY,
  normalizeGraphic,
  rmAngleToCanvasOffset,
  rmArcToCanvasRadians,
  rmYToCanvasY,
} from "@/domain/protocol/geometry";

describe("RM 坐标系与几何转换", () => {
  it("应正确转换 RM 左下角原点与 Konva 左上角原点 Y 坐标", () => {
    expect(rmYToCanvasY(0)).toBe(1080);
    expect(rmYToCanvasY(1080)).toBe(0);
    expect(rmYToCanvasY(540)).toBe(540);
    expect(canvasYToRmY(0)).toBe(1080);
    expect(canvasYToRmY(1080)).toBe(0);
    expect(canvasYToRmY(-50)).toBe(1080);
    expect(canvasYToRmY(1200)).toBe(0);
  });

  it("应正确将 RM 12点顺时针圆弧角转换为 Canvas 弧度（含跨0度区间）", () => {
    // RM [0°, 90°] 对应右上象限（12点到3点 -> Canvas -90° 到 0°）
    const q1 = rmArcToCanvasRadians(0, 90);
    expect(q1.sweepDeg).toBe(90);
    expect(q1.startRad).toBeCloseTo(-Math.PI / 2, 6);
    expect(q1.endRad).toBeCloseTo(0, 6);

    // RM [315°, 45°] 应跨越正上方 12 点钟方向，扫过 90°
    const crossZero = rmArcToCanvasRadians(315, 45);
    expect(crossZero.sweepDeg).toBe(90);
    expect(crossZero.startRad).toBeCloseTo((225 * Math.PI) / 180, 6);
    expect(crossZero.endRad).toBeCloseTo((315 * Math.PI) / 180, 6);

    // 整圆情况
    const full = rmArcToCanvasRadians(180, 180);
    expect(full.sweepDeg).toBe(360);
  });

  it("应支持椭圆弧 (rx != ry) 角度锚点与反算双向一致", () => {
    const rx = 200;
    const ry = 100;
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const { dx, dy } = rmAngleToCanvasOffset(angle, rx, ry);
      const recovered = canvasOffsetToRmAngle(dx, dy, rx, ry);
      expect(recovered).toBe(angle);
    }
  });

  it("应将反向拖拽矩形与负半轴椭圆规范化为正整数参数", () => {
    const normalizedRect = normalizeGraphic({
      id: "r1",
      figureName: "r01",
      displayName: "Rect",
      groupId: "grp1",
      layer: 0,
      color: 1,
      lineWidth: 2,
      dynamic: false,
      visible: true,
      locked: false,
      kind: "rect",
      startX: 400.7,
      startY: 600.2,
      endX: 100.3,
      endY: 200.9,
    });
    expect(normalizedRect.startX).toBe(100);
    expect(normalizedRect.endX).toBe(401);
    expect(normalizedRect.startY).toBe(201);
    expect(normalizedRect.endY).toBe(600);

    const normalizedEllipse = normalizeGraphic({
      id: "e1",
      figureName: "e01",
      displayName: "Ellipse",
      groupId: "grp1",
      layer: 12 as 9,
      color: 6,
      lineWidth: 0,
      dynamic: false,
      visible: true,
      locked: false,
      kind: "ellipse",
      centerX: 960,
      centerY: 540,
      rx: -120.4,
      ry: 0,
    });
    expect(normalizedEllipse.layer).toBe(9);
    expect(normalizedEllipse.lineWidth).toBe(1);
    expect(normalizedEllipse.rx).toBe(120);
    expect(normalizedEllipse.ry).toBe(1);
  });
});
