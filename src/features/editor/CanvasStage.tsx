import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle as KonvaCircle,
  Group,
  Image as KonvaImage,
  Layer,
  Rect as KonvaRect,
  Shape,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import clientBgUrl from "@/assets/rm-client-background.png";
import {
  RM_CANVAS_HEIGHT,
  RM_CANVAS_WIDTH,
  SAFE_AREA_ZONES,
  type GraphicKind,
} from "@/domain/protocol/constants";
import {
  canvasPointToRm,
  getGraphicRmBoundingBox,
  rmYToCanvasY,
} from "@/domain/protocol/geometry";
import type { MkuiFrame, MkuiGraphic } from "@/domain/protocol/types";
import { useCanvasViewport } from "@/hooks/useCanvasViewport";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import type { TelemetryOverride } from "@/stores/useSimulatorStore";
import { AlignToolbar } from "./AlignToolbar";
import { GraphicNode } from "./graphics/GraphicNode";

/**
 * 1920×1080 RoboMaster 客户端核心画布舞台
 * 复用模式：editable=true 为编辑工作台；editable=false + simOverrides 为模拟器只读视口
 */

function useHtmlImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.src = src;
    return () => {
      image.onload = null;
    };
  }, [src]);
  return img;
}

export function CanvasStage({
  frame,
  editable = true,
  simOverrides,
  onRegisterViewportControls,
}: {
  frame: MkuiFrame;
  editable?: boolean;
  simOverrides?: Record<string, TelemetryOverride>;
  onRegisterViewportControls?: (controls: {
    fit: () => void;
    zoom100: () => void;
  }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const artboardRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const didAutoFitRef = useRef(false);

  const [size, setSize] = useState({ width: 900, height: 600 });
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [drawStart, setDrawStart] = useState<{
    rmX: number;
    rmY: number;
    curRmX: number;
    curRmY: number;
  } | null>(null);

  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const toggleSelection = useCanvasStore((s) => s.toggleSelection);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const visibleLayers = useCanvasStore((s) => s.visibleLayers);
  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const showSafeArea = useCanvasStore((s) => s.showSafeArea);
  const showBackground = useCanvasStore((s) => s.showBackground);
  const backgroundOpacity = useCanvasStore((s) => s.backgroundOpacity);
  const customBackgroundUrl = useCanvasStore((s) => s.customBackgroundUrl);
  const scale = useCanvasStore((s) => s.scale);
  const offsetX = useCanvasStore((s) => s.offsetX);
  const offsetY = useCanvasStore((s) => s.offsetY);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const cursorRm = useCanvasStore((s) => s.cursorRm);
  const setCursorRm = useCanvasStore((s) => s.setCursorRm);

  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const toggleSafeArea = useCanvasStore((s) => s.toggleSafeArea);
  const toggleBackground = useCanvasStore((s) => s.toggleBackground);

  const addGraphic = useDocumentStore((s) => s.addGraphic);
  const updateGraphic = useDocumentStore((s) => s.updateGraphic);

  const { fitToViewport, resetTo100, handleWheelZoom } = useCanvasViewport();

  const officialBg = useHtmlImage(clientBgUrl);
  const customBg = useHtmlImage(customBackgroundUrl);
  const activeBgImage = customBg ?? officialBg;

  // 监听容器尺寸，并在首次挂载时自适应居中 1920×1080 画板
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.max(200, Math.round(rect.width));
      const h = Math.max(200, Math.round(rect.height));
      setSize({ width: w, height: h });
      if (!didAutoFitRef.current && w > 240 && h > 240) {
        didAutoFitRef.current = true;
        fitToViewport(w, h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToViewport]);

  const handleFit = useCallback(() => {
    fitToViewport(size.width, size.height);
  }, [fitToViewport, size.width, size.height]);

  const handleZoom100 = useCallback(() => {
    resetTo100(size.width, size.height);
  }, [resetTo100, size.width, size.height]);

  useEffect(() => {
    onRegisterViewportControls?.({ fit: handleFit, zoom100: handleZoom100 });
  }, [onRegisterViewportControls, handleFit, handleZoom100]);

  const registerNodeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      nodeRefs.current.set(id, node);
    } else {
      nodeRefs.current.delete(id);
    }
  }, []);

  // 按图层 0 -> 9 升序过滤并排序可见图元
  const visibleGraphics = useMemo(() => {
    const groupVisibleMap = new Map(frame.groups.map((g) => [g.id, g.visible]));
    return [...frame.graphics]
      .filter(
        (g) =>
          g.visible &&
          (groupVisibleMap.get(g.groupId) ?? true) &&
          visibleLayers[g.layer],
      )
      .sort((a, b) => a.layer - b.layer);
  }, [frame.graphics, frame.groups, visibleLayers]);

  // 同步 Konva.Transformer 到可变换节点（rect / circle / ellipse / arc）
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (!editable || selectedIds.length === 0) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    const transformableSet = new Set(
      visibleGraphics
        .filter(
          (g) =>
            selectedIds.includes(g.id) &&
            !g.locked &&
            (g.kind === "rect" ||
              g.kind === "circle" ||
              g.kind === "ellipse" ||
              g.kind === "arc"),
        )
        .map((g) => g.id),
    );

    const nodes: Konva.Node[] = [];
    for (const id of transformableSet) {
      const node = nodeRefs.current.get(id);
      if (node) nodes.push(node);
    }
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [editable, selectedIds, visibleGraphics]);

  const getArtboardPointer = () => {
    const art = artboardRef.current;
    if (!art) return null;
    const pos = art.getRelativePointerPosition();
    if (!pos) return null;
    return {
      canvasX: pos.x,
      canvasY: pos.y,
      ...canvasPointToRm(pos.x, pos.y),
    };
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!editable) return;
    const isEmptyHit =
      e.target === e.target.getStage() ||
      e.target.name() === "artboard-backdrop";

    if (activeTool === "pan") {
      return;
    }

    const pt = getArtboardPointer();
    if (!pt) return;

    if (activeTool !== "select") {
      setDrawStart({
        rmX: pt.x,
        rmY: pt.y,
        curRmX: pt.x,
        curRmY: pt.y,
      });
      return;
    }

    if (isEmptyHit) {
      if (!e.evt.shiftKey) {
        clearSelection();
      }
      setMarquee({
        x1: pt.canvasX,
        y1: pt.canvasY,
        x2: pt.canvasX,
        y2: pt.canvasY,
      });
    }
  };

  const handleStageMouseMove = () => {
    const pt = getArtboardPointer();
    if (pt) {
      setCursorRm({ x: pt.x, y: pt.y });
    }
    if (!editable) return;

    if (marquee && pt) {
      setMarquee((prev) =>
        prev ? { ...prev, x2: pt.canvasX, y2: pt.canvasY } : null,
      );
    } else if (drawStart && pt) {
      setDrawStart((prev) =>
        prev ? { ...prev, curRmX: pt.x, curRmY: pt.y } : null,
      );
    }
  };

  const handleStageMouseUp = () => {
    if (!editable) return;

    if (marquee) {
      const minX = Math.min(marquee.x1, marquee.x2);
      const maxX = Math.max(marquee.x1, marquee.x2);
      const minY = Math.min(marquee.y1, marquee.y2);
      const maxY = Math.max(marquee.y1, marquee.y2);
      if (maxX - minX > 4 || maxY - minY > 4) {
        const rmBoxMin = canvasPointToRm(minX, maxY);
        const rmBoxMax = canvasPointToRm(maxX, minY);
        const hitIds = visibleGraphics
          .filter((g) => {
            if (g.locked) return false;
            const b = getGraphicRmBoundingBox(g);
            return (
              b.minX <= rmBoxMax.x &&
              b.maxX >= rmBoxMin.x &&
              b.minY <= rmBoxMax.y &&
              b.maxY >= rmBoxMin.y
            );
          })
          .map((g) => g.id);
        setSelectedIds(hitIds);
      }
      setMarquee(null);
      return;
    }

    if (drawStart && activeTool !== "select" && activeTool !== "pan") {
      const kind = activeTool as GraphicKind;
      const dragged =
        Math.abs(drawStart.curRmX - drawStart.rmX) > 6 ||
        Math.abs(drawStart.curRmY - drawStart.rmY) > 6;

      const created = addGraphic(kind, {
        rmX: drawStart.rmX,
        rmY: drawStart.rmY,
        endRmX: dragged ? drawStart.curRmX : undefined,
        endRmY: dragged ? drawStart.curRmY : undefined,
      });
      setSelectedIds([created.id]);
      setActiveTool("select");
      setDrawStart(null);
    }
  };

  const handleSelectGraphic = useCallback(
    (id: string, multi: boolean) => {
      if (multi) {
        toggleSelection(id);
      } else {
        setSelectedIds([id]);
      }
    },
    [setSelectedIds, toggleSelection],
  );

  const handleCommitGraphic = useCallback(
    (id: string, patch: Partial<MkuiGraphic>) => {
      updateGraphic(id, patch, true);
    },
    [updateGraphic],
  );

  const isPanMode = !editable || activeTool === "pan";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full flex-1 overflow-hidden bg-[var(--mk-bg-canvas)]"
      style={{
        cursor: isPanMode
          ? "grab"
          : activeTool !== "select"
            ? "crosshair"
            : "default",
      }}
    >
      {editable && <AlignToolbar />}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={offsetX}
        y={offsetY}
        scaleX={scale}
        scaleY={scale}
        draggable={isPanMode}
        onWheel={handleWheelZoom}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setViewport(scale, e.target.x(), e.target.y());
          }
        }}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={() => setCursorRm(null)}
      >
        {/* 外围无限点阵层：单 Shape 按可见边界动态绘制，稳定 60fps */}
        <Layer listening={false}>
          {showGrid && (
            <Shape
              listening={false}
              sceneFunc={(ctx) => {
                const spacing = 48;
                const invScale = 1 / Math.max(0.1, scale);
                const left = -offsetX * invScale;
                const top = -offsetY * invScale;
                const right = left + size.width * invScale;
                const bottom = top + size.height * invScale;

                const startX = Math.floor(left / spacing) * spacing;
                const startY = Math.floor(top / spacing) * spacing;
                const dotRadius = Math.max(0.8, 1.2 * invScale);

                ctx.fillStyle = "rgba(148, 163, 184, 0.22)";
                ctx.beginPath();
                for (let gx = startX; gx <= right; gx += spacing) {
                  for (let gy = startY; gy <= bottom; gy += spacing) {
                    ctx.moveTo(gx + dotRadius, gy);
                    ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
                  }
                }
                ctx.fill();
              }}
            />
          )}
        </Layer>

        {/* 1920×1080 官方客户端逻辑画板层 */}
        <Layer>
          <Group ref={artboardRef} x={0} y={0}>
            {/* 画板底色 + 边框 */}
            <KonvaRect
              name="artboard-backdrop"
              x={0}
              y={0}
              width={RM_CANVAS_WIDTH}
              height={RM_CANVAS_HEIGHT}
              fill="#35383f"
              stroke="#475569"
              strokeWidth={2 / Math.max(0.25, scale)}
            />

            {/* 原生 1920×1080 客户端底图（仅作对齐参考，永不导出） */}
            {showBackground && activeBgImage && (
              <KonvaImage
                image={activeBgImage}
                x={0}
                y={0}
                width={RM_CANVAS_WIDTH}
                height={RM_CANVAS_HEIGHT}
                opacity={backgroundOpacity}
                listening={false}
              />
            )}

            {/* 协议 8 类图元（按 Layer 0..9 严格升序渲染） */}
            {visibleGraphics.map((graphic) => (
              <GraphicNode
                key={graphic.id}
                graphic={graphic}
                team={previewTeam}
                editable={editable}
                isSelected={selectedIds.includes(graphic.id)}
                simOverride={simOverrides?.[graphic.id]}
                registerNodeRef={registerNodeRef}
                onSelect={handleSelectGraphic}
                onCommitChange={handleCommitGraphic}
              />
            ))}

            {/* Safe Area 官方遮挡禁区叠加蒙版 */}
            {showSafeArea && (
              <Group listening={false}>
                {SAFE_AREA_ZONES.map((zone) => {
                  if (zone.shape === "rect") {
                    const topCanvasY = rmYToCanvasY(zone.y + zone.height);
                    return (
                      <Group key={zone.id}>
                        <KonvaRect
                          x={zone.x}
                          y={topCanvasY}
                          width={zone.width}
                          height={zone.height}
                          fill="rgba(239, 68, 68, 0.14)"
                          stroke="rgba(239, 68, 68, 0.85)"
                          strokeWidth={2}
                          dash={[10, 6]}
                        />
                        <KonvaText
                          x={zone.x + 12}
                          y={topCanvasY + 10}
                          text={`禁区 · ${zone.label}`}
                          fontSize={16}
                          fontFamily="Inter, PingFang SC, sans-serif"
                          fill="#fca5a5"
                        />
                      </Group>
                    );
                  }
                  return (
                    <Group key={zone.id}>
                      <KonvaCircle
                        x={zone.cx}
                        y={rmYToCanvasY(zone.cy)}
                        radius={zone.r}
                        fill="rgba(239, 68, 68, 0.14)"
                        stroke="rgba(239, 68, 68, 0.85)"
                        strokeWidth={2}
                        dash={[8, 6]}
                      />
                    </Group>
                  );
                })}
              </Group>
            )}

            {/* 框选矩形 */}
            {marquee && (
              <KonvaRect
                x={Math.min(marquee.x1, marquee.x2)}
                y={Math.min(marquee.y1, marquee.y2)}
                width={Math.abs(marquee.x2 - marquee.x1)}
                height={Math.abs(marquee.y2 - marquee.y1)}
                fill="rgba(0, 212, 255, 0.12)"
                stroke="#00d4ff"
                strokeWidth={1.5 / Math.max(0.2, scale)}
                listening={false}
              />
            )}

            {/* 拖拽新建预览框 */}
            {drawStart && (activeTool === "line" || activeTool === "rect") && (
              <KonvaRect
                x={Math.min(drawStart.rmX, drawStart.curRmX)}
                y={rmYToCanvasY(Math.max(drawStart.rmY, drawStart.curRmY))}
                width={Math.max(2, Math.abs(drawStart.curRmX - drawStart.rmX))}
                height={Math.max(2, Math.abs(drawStart.curRmY - drawStart.rmY))}
                stroke="#00d4ff"
                strokeWidth={2}
                dash={[6, 4]}
                listening={false}
              />
            )}

            {/* 选中变形器（禁止旋转与任意斜切，保持协议正交限制） */}
            {editable && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                borderStroke="#00d4ff"
                anchorStroke="#00d4ff"
                anchorFill="#0d1117"
                anchorSize={8}
                ignoreStroke={true}
              />
            )}
          </Group>
        </Layer>
      </Stage>

      {/* 底部玻璃质感视口控制胶囊条 */}
      <div className="mk-glass-elevated absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-full px-2.5 py-1 text-[11px]">
        <button
          type="button"
          onClick={handleFit}
          className="shrink-0 rounded-full px-2 py-0.5 font-medium text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
        >
          适应视口
        </button>
        <button
          type="button"
          onClick={handleZoom100}
          className="mk-tabular shrink-0 rounded-full px-2 py-0.5 font-medium text-[var(--mk-text-primary)] hover:bg-[var(--mk-bg-surface-hover)] cursor-pointer"
          title="点击重置为 100%"
        >
          {Math.round(scale * 100)}%
        </button>
        <span className="h-3.5 w-px shrink-0 bg-[var(--mk-border-subtle)]" />
        <button
          type="button"
          onClick={toggleGrid}
          className={`shrink-0 rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer ${
            showGrid
              ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]"
              : "text-[var(--mk-text-muted)]"
          }`}
        >
          点阵
        </button>
        <button
          type="button"
          onClick={toggleSafeArea}
          className={`shrink-0 rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer ${
            showSafeArea
              ? "bg-[var(--mk-status-error-tint)] text-[var(--mk-status-error)]"
              : "text-[var(--mk-text-muted)]"
          }`}
          title="切换官方客户端 4 大遮挡禁区显示 (G)"
        >
          安全区
        </button>
        <button
          type="button"
          onClick={toggleBackground}
          className={`shrink-0 rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer ${
            showBackground
              ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]"
              : "text-[var(--mk-text-muted)]"
          }`}
          title="切换官方客户端底图显示 (B)"
        >
          底图
        </button>
        <span className="h-3.5 w-px shrink-0 bg-[var(--mk-border-subtle)]" />
        <span className="mk-tabular shrink-0 px-1.5 text-[var(--mk-text-secondary)]">
          RM ({cursorRm ? `${cursorRm.x}, ${cursorRm.y}` : "—, —"})
        </span>
      </div>
    </div>
  );
}
