import { useEffect, useRef, useState } from "react";
import { Circle, Ellipse, Group, Line, Rect, Shape, Text } from "react-konva";
import type Konva from "konva";
import {
  RM_CANVAS_WIDTH,
  getProtocolColorHex,
} from "@/domain/protocol/constants";
import {
  canvasOffsetToRmAngle,
  canvasYToRmY,
  clampInt,
  normalizeGraphic,
  rmAngleToCanvasOffset,
  rmArcToCanvasRadians,
  rmYToCanvasY,
  translateGraphicRm,
} from "@/domain/protocol/geometry";
import type { MkuiGraphic } from "@/domain/protocol/types";
import type { TelemetryOverride } from "@/stores/useSimulatorStore";

/**
 * 裁判系统 8 类协议图元 Konva 渲染器
 * 严格红线：
 * 1. 所有坐标从 RM 左下角原点通过 geometry.ts 映射到 Canvas 左上角原点；
 * 2. 画布内部严禁使用渐变、发光、模糊、阴影与圆角；
 * 3. 椭圆弧使用 ctx.ellipse 自定义绘制；直线与圆弧在选中态提供实时预览、几何吸附的端点/角度拖拽柄。
 */

interface GraphicNodeProps {
  graphic: MkuiGraphic;
  team: "red" | "blue";
  editable: boolean;
  isSelected: boolean;
  simOverride?: TelemetryOverride;
  registerNodeRef?: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, multi: boolean) => void;
  onCommitChange: (id: string, patch: Partial<MkuiGraphic>) => void;
}

interface DraftArcState {
  startAngle?: number;
  endAngle?: number;
  dx?: number;
  dy?: number;
}

interface DraftLineState {
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  dx?: number;
  dy?: number;
}

export function GraphicNode({
  graphic,
  team,
  editable,
  isSelected,
  simOverride,
  registerNodeRef,
  onSelect,
  onCommitChange,
}: GraphicNodeProps) {
  const arcShapeRef = useRef<Konva.Shape | null>(null);
  const [draftArc, setDraftArc] = useState<DraftArcState | null>(null);
  const [draftLine, setDraftLine] = useState<DraftLineState | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);

  // 切换图元或取消选中/不可编辑时清理瞬态拖拽状态
  useEffect(() => {
    setDraftArc(null);
    setDraftLine(null);
    setIsTransforming(false);
  }, [graphic.id, editable]);

  const effectiveColorId = simOverride?.color ?? graphic.color;
  const strokeHex = getProtocolColorHex(effectiveColorId, team);

  // Konva 自定义 <Shape> 在仅更新 sceneFunc 闭包（例如属性栏改角度、拖拽角度柄）时必须主动触发重绘
  const arcRedrawSig =
    graphic.kind === "arc"
      ? `${draftArc?.startAngle ?? simOverride?.startAngle ?? graphic.startAngle}|${
          draftArc?.endAngle ?? simOverride?.endAngle ?? graphic.endAngle
        }|${graphic.rx}|${graphic.ry}|${graphic.centerX}|${graphic.centerY}|${strokeHex}|${graphic.lineWidth}`
      : "";

  useEffect(() => {
    if (graphic.kind === "arc") {
      arcShapeRef.current?.getLayer()?.batchDraw();
    }
  }, [graphic.kind, arcRedrawSig]);

  if (simOverride?.visible === false) {
    return null;
  }

  const canInteract = editable && !graphic.locked;

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!editable) return;
    e.cancelBubble = true;
    const multi = "shiftKey" in e.evt ? e.evt.shiftKey : false;
    onSelect(graphic.id, multi);
  };

  const handleDragEndOffset = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const dx = Math.round(node.x());
    const dy = Math.round(node.y());
    node.position({ x: 0, y: 0 });
    if (dx === 0 && dy === 0) return;
    const moved = translateGraphicRm(graphic, dx, -dy);
    onCommitChange(graphic.id, moved);
  };

  switch (graphic.kind) {
    case "line": {
      const baseEndX = simOverride?.endX ?? graphic.endX;
      const baseEndY = simOverride?.endY ?? graphic.endY;
      const x1 = draftLine?.startX ?? graphic.startX;
      const y1 = rmYToCanvasY(draftLine?.startY ?? graphic.startY);
      const x2 = draftLine?.endX ?? baseEndX;
      const y2 = rmYToCanvasY(draftLine?.endY ?? baseEndY);
      const bodyDx = draftLine?.dx ?? 0;
      const bodyDy = draftLine?.dy ?? 0;

      return (
        <Group>
          <Line
            ref={(n) => registerNodeRef?.(graphic.id, n)}
            id={graphic.id}
            points={[x1, y1, x2, y2]}
            stroke={strokeHex}
            strokeWidth={graphic.lineWidth}
            hitStrokeWidth={Math.max(14, graphic.lineWidth + 8)}
            lineCap="butt"
            draggable={canInteract}
            onMouseDown={handleSelect}
            onTap={handleSelect}
            onDragMove={(e) => {
              setDraftLine({
                dx: Math.round(e.target.x()),
                dy: Math.round(e.target.y()),
              });
            }}
            onDragEnd={(e) => {
              setDraftLine(null);
              handleDragEndOffset(e);
            }}
          />
          {canInteract && isSelected && (
            <>
              <Circle
                x={x1 + bodyDx}
                y={y1 + bodyDy}
                radius={6}
                fill="#00d4ff"
                stroke="#0d1117"
                strokeWidth={1.5}
                draggable
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                onDragMove={(e) => {
                  const nx = clampInt(e.target.x(), 0, RM_CANVAS_WIDTH);
                  const ny = canvasYToRmY(e.target.y());
                  e.target.position({ x: nx, y: rmYToCanvasY(ny) });
                  setDraftLine({ startX: nx, startY: ny });
                }}
                onDragEnd={(e) => {
                  const nx = clampInt(e.target.x(), 0, RM_CANVAS_WIDTH);
                  const ny = canvasYToRmY(e.target.y());
                  e.target.position({ x: nx, y: rmYToCanvasY(ny) });
                  setDraftLine(null);
                  onCommitChange(graphic.id, { startX: nx, startY: ny });
                }}
              />
              <Circle
                x={x2 + bodyDx}
                y={y2 + bodyDy}
                radius={6}
                fill="#00d4ff"
                stroke="#0d1117"
                strokeWidth={1.5}
                draggable
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                onDragMove={(e) => {
                  const nx = clampInt(e.target.x(), 0, RM_CANVAS_WIDTH);
                  const ny = canvasYToRmY(e.target.y());
                  e.target.position({ x: nx, y: rmYToCanvasY(ny) });
                  setDraftLine({ endX: nx, endY: ny });
                }}
                onDragEnd={(e) => {
                  const nx = clampInt(e.target.x(), 0, RM_CANVAS_WIDTH);
                  const ny = canvasYToRmY(e.target.y());
                  e.target.position({ x: nx, y: rmYToCanvasY(ny) });
                  setDraftLine(null);
                  onCommitChange(graphic.id, { endX: nx, endY: ny });
                }}
              />
            </>
          )}
        </Group>
      );
    }

    case "rect": {
      const width = Math.max(1, graphic.endX - graphic.startX);
      const height = Math.max(1, graphic.endY - graphic.startY);
      const topCanvasY = rmYToCanvasY(graphic.endY);

      return (
        <Rect
          ref={(n) => registerNodeRef?.(graphic.id, n)}
          id={graphic.id}
          x={graphic.startX}
          y={topCanvasY}
          width={width}
          height={height}
          stroke={strokeHex}
          strokeWidth={graphic.lineWidth}
          hitStrokeWidth={Math.max(12, graphic.lineWidth + 8)}
          cornerRadius={0}
          draggable={canInteract}
          onMouseDown={handleSelect}
          onTap={handleSelect}
          onDragEnd={(e) => {
            const node = e.target;
            const newStartX = Math.round(node.x());
            const newEndY = canvasYToRmY(node.y());
            const dx = newStartX - graphic.startX;
            const dy = newEndY - graphic.endY;
            onCommitChange(
              graphic.id,
              normalizeGraphic({
                ...graphic,
                startX: graphic.startX + dx,
                endX: graphic.endX + dx,
                startY: graphic.startY + dy,
                endY: graphic.endY + dy,
              }),
            );
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const sx = node.scaleX();
            const sy = node.scaleY();
            const newW = Math.round(node.width() * sx);
            const newH = Math.round(node.height() * sy);
            const leftCanvas = Math.round(node.x());
            const topCanvas = Math.round(node.y());
            node.scaleX(1);
            node.scaleY(1);

            const x1 = Math.min(leftCanvas, leftCanvas + newW);
            const x2 = Math.max(leftCanvas, leftCanvas + newW);
            const yTopCanvas = Math.min(topCanvas, topCanvas + newH);
            const yBottomCanvas = Math.max(topCanvas, topCanvas + newH);
            const updated = normalizeGraphic({
              ...graphic,
              startX: x1,
              endX: x2,
              startY: canvasYToRmY(yBottomCanvas),
              endY: canvasYToRmY(yTopCanvas),
            });
            node.position({
              x: updated.startX,
              y: rmYToCanvasY(updated.endY),
            });
            onCommitChange(graphic.id, updated);
          }}
        />
      );
    }

    case "circle": {
      const cyCanvas = rmYToCanvasY(graphic.centerY);
      return (
        <Circle
          ref={(n) => registerNodeRef?.(graphic.id, n)}
          id={graphic.id}
          x={graphic.centerX}
          y={cyCanvas}
          radius={graphic.radius}
          stroke={strokeHex}
          strokeWidth={graphic.lineWidth}
          hitStrokeWidth={Math.max(12, graphic.lineWidth + 8)}
          draggable={canInteract}
          onMouseDown={handleSelect}
          onTap={handleSelect}
          onDragEnd={(e) => {
            const node = e.target;
            onCommitChange(graphic.id, {
              centerX: Math.round(node.x()),
              centerY: canvasYToRmY(node.y()),
            });
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const scale = Math.max(
              Math.abs(node.scaleX()),
              Math.abs(node.scaleY()),
            );
            const nextRadius = Math.max(1, Math.round(graphic.radius * scale));
            node.scaleX(1);
            node.scaleY(1);
            onCommitChange(graphic.id, {
              centerX: Math.round(node.x()),
              centerY: canvasYToRmY(node.y()),
              radius: nextRadius,
            });
          }}
        />
      );
    }

    case "ellipse": {
      const cyCanvas = rmYToCanvasY(graphic.centerY);
      return (
        <Ellipse
          ref={(n) => registerNodeRef?.(graphic.id, n)}
          id={graphic.id}
          x={graphic.centerX}
          y={cyCanvas}
          radiusX={graphic.rx}
          radiusY={graphic.ry}
          stroke={strokeHex}
          strokeWidth={graphic.lineWidth}
          hitStrokeWidth={Math.max(12, graphic.lineWidth + 8)}
          draggable={canInteract}
          onMouseDown={handleSelect}
          onTap={handleSelect}
          onDragEnd={(e) => {
            const node = e.target;
            onCommitChange(graphic.id, {
              centerX: Math.round(node.x()),
              centerY: canvasYToRmY(node.y()),
            });
          }}
          onTransformEnd={(e) => {
            const node = e.target;
            const nextRx = Math.max(
              1,
              Math.round(graphic.rx * Math.abs(node.scaleX())),
            );
            const nextRy = Math.max(
              1,
              Math.round(graphic.ry * Math.abs(node.scaleY())),
            );
            node.scaleX(1);
            node.scaleY(1);
            onCommitChange(graphic.id, {
              centerX: Math.round(node.x()),
              centerY: canvasYToRmY(node.y()),
              rx: nextRx,
              ry: nextRy,
            });
          }}
        />
      );
    }

    case "arc": {
      const cyCanvas = rmYToCanvasY(graphic.centerY);
      const bodyDx = draftArc?.dx ?? 0;
      const bodyDy = draftArc?.dy ?? 0;
      const startAngle =
        draftArc?.startAngle ?? simOverride?.startAngle ?? graphic.startAngle;
      const endAngle =
        draftArc?.endAngle ?? simOverride?.endAngle ?? graphic.endAngle;
      const { startRad, endRad } = rmArcToCanvasRadians(startAngle, endAngle);
      const startOffset = rmAngleToCanvasOffset(
        startAngle,
        graphic.rx,
        graphic.ry,
      );
      const endOffset = rmAngleToCanvasOffset(endAngle, graphic.rx, graphic.ry);

      return (
        <Group>
          <Shape
            ref={(n) => {
              arcShapeRef.current = n;
              registerNodeRef?.(graphic.id, n);
            }}
            id={graphic.id}
            x={graphic.centerX}
            y={cyCanvas}
            width={graphic.rx * 2}
            height={graphic.ry * 2}
            offsetX={graphic.rx}
            offsetY={graphic.ry}
            stroke={strokeHex}
            strokeWidth={graphic.lineWidth}
            draggable={canInteract}
            onMouseDown={handleSelect}
            onTap={handleSelect}
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.ellipse(
                graphic.rx,
                graphic.ry,
                graphic.rx,
                graphic.ry,
                0,
                startRad,
                endRad,
                false,
              );
              ctx.strokeShape(shape);
            }}
            hitFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.ellipse(
                graphic.rx,
                graphic.ry,
                graphic.rx,
                graphic.ry,
                0,
                startRad,
                endRad,
                false,
              );
              ctx.lineWidth = Math.max(16, graphic.lineWidth + 10);
              ctx.strokeShape(shape);
            }}
            onDragMove={(e) => {
              setDraftArc({
                dx: Math.round(e.target.x() - graphic.centerX),
                dy: Math.round(e.target.y() - cyCanvas),
              });
            }}
            onDragEnd={(e) => {
              const node = e.target;
              setDraftArc(null);
              onCommitChange(graphic.id, {
                centerX: Math.round(node.x()),
                centerY: canvasYToRmY(node.y()),
              });
            }}
            onTransformStart={() => setIsTransforming(true)}
            onTransformEnd={(e) => {
              const node = e.target;
              const nextRx = Math.max(
                1,
                Math.round(graphic.rx * Math.abs(node.scaleX())),
              );
              const nextRy = Math.max(
                1,
                Math.round(graphic.ry * Math.abs(node.scaleY())),
              );
              node.scaleX(1);
              node.scaleY(1);
              setIsTransforming(false);
              onCommitChange(graphic.id, {
                centerX: Math.round(node.x()),
                centerY: canvasYToRmY(node.y()),
                rx: nextRx,
                ry: nextRy,
              });
            }}
          />
          {canInteract && isSelected && !isTransforming && (
            <>
              <Circle
                x={graphic.centerX + bodyDx + startOffset.dx}
                y={cyCanvas + bodyDy + startOffset.dy}
                radius={6}
                fill="#ffd60a"
                stroke="#0d1117"
                strokeWidth={1.5}
                draggable
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                onDragMove={(e) => {
                  const dx = e.target.x() - graphic.centerX;
                  const dy = e.target.y() - cyCanvas;
                  const nextAngle = canvasOffsetToRmAngle(
                    dx,
                    dy,
                    graphic.rx,
                    graphic.ry,
                  );
                  const snapped = rmAngleToCanvasOffset(
                    nextAngle,
                    graphic.rx,
                    graphic.ry,
                  );
                  e.target.position({
                    x: graphic.centerX + snapped.dx,
                    y: cyCanvas + snapped.dy,
                  });
                  setDraftArc({ startAngle: nextAngle });
                }}
                onDragEnd={(e) => {
                  const dx = e.target.x() - graphic.centerX;
                  const dy = e.target.y() - cyCanvas;
                  const nextAngle = canvasOffsetToRmAngle(
                    dx,
                    dy,
                    graphic.rx,
                    graphic.ry,
                  );
                  const snapped = rmAngleToCanvasOffset(
                    nextAngle,
                    graphic.rx,
                    graphic.ry,
                  );
                  e.target.position({
                    x: graphic.centerX + snapped.dx,
                    y: cyCanvas + snapped.dy,
                  });
                  setDraftArc(null);
                  onCommitChange(graphic.id, { startAngle: nextAngle });
                }}
              />
              <Circle
                x={graphic.centerX + bodyDx + endOffset.dx}
                y={cyCanvas + bodyDy + endOffset.dy}
                radius={6}
                fill="#00d4ff"
                stroke="#0d1117"
                strokeWidth={1.5}
                draggable
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                }}
                onDragMove={(e) => {
                  const dx = e.target.x() - graphic.centerX;
                  const dy = e.target.y() - cyCanvas;
                  const nextAngle = canvasOffsetToRmAngle(
                    dx,
                    dy,
                    graphic.rx,
                    graphic.ry,
                  );
                  const snapped = rmAngleToCanvasOffset(
                    nextAngle,
                    graphic.rx,
                    graphic.ry,
                  );
                  e.target.position({
                    x: graphic.centerX + snapped.dx,
                    y: cyCanvas + snapped.dy,
                  });
                  setDraftArc({ endAngle: nextAngle });
                }}
                onDragEnd={(e) => {
                  const dx = e.target.x() - graphic.centerX;
                  const dy = e.target.y() - cyCanvas;
                  const nextAngle = canvasOffsetToRmAngle(
                    dx,
                    dy,
                    graphic.rx,
                    graphic.ry,
                  );
                  const snapped = rmAngleToCanvasOffset(
                    nextAngle,
                    graphic.rx,
                    graphic.ry,
                  );
                  e.target.position({
                    x: graphic.centerX + snapped.dx,
                    y: cyCanvas + snapped.dy,
                  });
                  setDraftArc(null);
                  onCommitChange(graphic.id, { endAngle: nextAngle });
                }}
              />
            </>
          )}
        </Group>
      );
    }

    case "float":
    case "int":
    case "text": {
      const displayText =
        graphic.kind === "float"
          ? (simOverride?.value ?? graphic.value).toFixed(3)
          : graphic.kind === "int"
            ? String(Math.round(simOverride?.value ?? graphic.value))
            : (simOverride?.text ?? graphic.text);

      return (
        <Text
          ref={(n) => registerNodeRef?.(graphic.id, n)}
          id={graphic.id}
          x={graphic.x}
          y={rmYToCanvasY(graphic.y)}
          text={displayText || " "}
          fontSize={graphic.fontSize}
          fontFamily="JetBrains Mono, Consolas, monospace"
          fill={strokeHex}
          padding={2}
          draggable={canInteract}
          onMouseDown={handleSelect}
          onTap={handleSelect}
          onDragEnd={(e) => {
            const node = e.target;
            onCommitChange(graphic.id, {
              x: Math.round(node.x()),
              y: canvasYToRmY(node.y()),
            });
          }}
        />
      );
    }
  }
}
