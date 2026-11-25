import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Rect as KonvaRect,
  Shape,
  Stage,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  ArrowDownToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  EyeOff,
  Grid3x3,
  Image as ImageIcon,
  Lock,
  Maximize2,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import clientBgUrl from "@/assets/rm-client-background.png";
import {
  ContextMenu,
  type ContextMenuEntry,
  type ContextMenuState,
} from "@/components/ui/ContextMenu";
import {
  GRAPHIC_KIND_METAS,
  RM_CANVAS_HEIGHT,
  RM_CANVAS_WIDTH,
  type GraphicKind,
} from "@/domain/protocol/constants";
import {
  canvasPointToRm,
  getGraphicRmBoundingBox,
  rmYToCanvasY,
} from "@/domain/protocol/geometry";
import type { LayerIndex, MkuiFrame, MkuiGraphic } from "@/domain/protocol/types";
import { useCanvasPan } from "@/hooks/useCanvasPan";
import { useCanvasViewport } from "@/hooks/useCanvasViewport";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import type { TelemetryOverride } from "@/stores/useSimulatorStore";
import { AlignToolbar } from "./AlignToolbar";
import { GraphicNode } from "./graphics/GraphicNode";

/**
 * 1920×1080 RoboMaster 客户端核心画布舞台
 * 支持：中键/中键+左键/Alt+左键/Space+左键平移、双中键适应视口、自定义右键菜单与 8 类协议图元交互
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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
  const clipboard = useCanvasStore((s) => s.clipboard);
  const setClipboard = useCanvasStore((s) => s.setClipboard);
  const visibleLayers = useCanvasStore((s) => s.visibleLayers);
  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const showBackground = useCanvasStore((s) => s.showBackground);
  const backgroundOpacity = useCanvasStore((s) => s.backgroundOpacity);
  const customBackgroundUrl = useCanvasStore((s) => s.customBackgroundUrl);
  const scale = useCanvasStore((s) => s.scale);
  const offsetX = useCanvasStore((s) => s.offsetX);
  const offsetY = useCanvasStore((s) => s.offsetY);
  const cursorRm = useCanvasStore((s) => s.cursorRm);
  const setCursorRm = useCanvasStore((s) => s.setCursorRm);

  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const toggleBackground = useCanvasStore((s) => s.toggleBackground);

  const addGraphic = useDocumentStore((s) => s.addGraphic);
  const updateGraphic = useDocumentStore((s) => s.updateGraphic);
  const updateGraphicsBatch = useDocumentStore((s) => s.updateGraphicsBatch);
  const deleteGraphics = useDocumentStore((s) => s.deleteGraphics);
  const duplicateGraphics = useDocumentStore((s) => s.duplicateGraphics);
  const alignGraphics = useDocumentStore((s) => s.alignGraphics);

  const { fitToViewport, resetTo100, handleWheelZoom } = useCanvasViewport();

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

  const { isPanning, cursor, panHandlers } = useCanvasPan({
    editable,
    onFitViewport: handleFit,
  });

  // 平移开始时清理未完成的框选或绘制预览
  useEffect(() => {
    if (isPanning) {
      setMarquee(null);
      setDrawStart(null);
    }
  }, [isPanning]);

  const officialBg = useHtmlImage(clientBgUrl);
  const customBg = useHtmlImage(customBackgroundUrl);
  const activeBgImage = customBg ?? officialBg;

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
    if (!editable || isPanning) return;
    // 只响应左键进行选框/绘制；中键和右键分别由平移状态机与上下文菜单处理
    if (e.evt.button !== 0 || e.evt.altKey) return;

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
    if (!editable || isPanning) return;

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
    if (!editable || isPanning) return;

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

  /** 在画布容器上弹出自定义磨砂玻璃右键菜单（屏蔽浏览器默认菜单） */
  const handleContainerContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    const rect = container.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const artRm = canvasPointToRm(
      (pointerX - offsetX) / scale,
      (pointerY - offsetY) / scale,
    );

    if (!editable) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            id: "sim-fit",
            label: "适应视口",
            icon: <Maximize2 className="h-3.5 w-3.5" />,
            shortcut: "双击中键",
            onSelect: handleFit,
          },
          {
            id: "sim-100",
            label: "缩放到 100%",
            onSelect: handleZoom100,
          },
          { type: "separator", id: "sim-sep" },
          {
            id: "sim-grid",
            label: showGrid ? "隐藏点阵网格" : "显示点阵网格",
            icon: <Grid3x3 className="h-3.5 w-3.5" />,
            onSelect: toggleGrid,
          },
          {
            id: "sim-bg",
            label: showBackground ? "隐藏官方底图" : "显示官方底图",
            icon: <ImageIcon className="h-3.5 w-3.5" />,
            onSelect: toggleBackground,
          },
        ],
      });
      return;
    }

    // 探测鼠标下的图元节点
    const hitShape = stage.getIntersection({ x: pointerX, y: pointerY });
    const graphicIdSet = new Set(frame.graphics.map((g) => g.id));
    let hitGraphicId: string | null = null;
    let cursorNode: Konva.Node | null = hitShape ?? null;
    while (cursorNode) {
      const nodeId = cursorNode.id();
      if (nodeId && graphicIdSet.has(nodeId)) {
        hitGraphicId = nodeId;
        break;
      }
      cursorNode = cursorNode.getParent();
    }

    if (hitGraphicId) {
      const activeTargetIds = selectedIds.includes(hitGraphicId)
        ? selectedIds
        : [hitGraphicId];
      if (!selectedIds.includes(hitGraphicId)) {
        setSelectedIds([hitGraphicId]);
      }

      const targetGraphics = frame.graphics.filter((g) =>
        activeTargetIds.includes(g.id),
      );
      const first = targetGraphics[0];
      const allLocked = targetGraphics.every((g) => g.locked);

      const items: ContextMenuEntry[] = [
        {
          id: "ctx-copy",
          label: "复制",
          icon: <Copy className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+C",
          onSelect: () => setClipboard(targetGraphics),
        },
        {
          id: "ctx-dup",
          label: "再制图元",
          icon: <CopyPlus className="h-3.5 w-3.5" />,
          shortcut: "Ctrl+D",
          onSelect: () => {
            const created = duplicateGraphics(activeTargetIds);
            setSelectedIds(created.map((g) => g.id));
          },
        },
        { type: "separator", id: "ctx-sep-1" },
        {
          id: "ctx-layer-up",
          label: "图层上移一层",
          icon: <ArrowUp className="h-3.5 w-3.5" />,
          disabled: !first || first.layer >= 9,
          onSelect: () => {
            if (!first) return;
            updateGraphicsBatch(activeTargetIds, {
              layer: Math.min(9, first.layer + 1) as LayerIndex,
            });
          },
        },
        {
          id: "ctx-layer-down",
          label: "图层下移一层",
          icon: <ArrowDown className="h-3.5 w-3.5" />,
          disabled: !first || first.layer <= 0,
          onSelect: () => {
            if (!first) return;
            updateGraphicsBatch(activeTargetIds, {
              layer: Math.max(0, first.layer - 1) as LayerIndex,
            });
          },
        },
        {
          id: "ctx-layer-top",
          label: "置顶到 L9",
          icon: <ArrowUpToLine className="h-3.5 w-3.5" />,
          onSelect: () => updateGraphicsBatch(activeTargetIds, { layer: 9 }),
        },
        {
          id: "ctx-layer-bottom",
          label: "置底到 L0",
          icon: <ArrowDownToLine className="h-3.5 w-3.5" />,
          onSelect: () => updateGraphicsBatch(activeTargetIds, { layer: 0 }),
        },
        {
          id: "ctx-align-center",
          label: "对齐到画布中心",
          icon: <Crosshair className="h-3.5 w-3.5" />,
          onSelect: () => alignGraphics(activeTargetIds, "canvasCenter"),
        },
        { type: "separator", id: "ctx-sep-2" },
        {
          id: "ctx-lock",
          label: allLocked ? "解锁图元" : "锁定图元",
          icon: allLocked ? (
            <Unlock className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          ),
          onSelect: () =>
            updateGraphicsBatch(activeTargetIds, { locked: !allLocked }),
        },
        {
          id: "ctx-hide",
          label: "隐藏图元",
          icon: <EyeOff className="h-3.5 w-3.5" />,
          onSelect: () => {
            updateGraphicsBatch(activeTargetIds, { visible: false });
            clearSelection();
          },
        },
        { type: "separator", id: "ctx-sep-3" },
        {
          id: "ctx-del",
          label: "删除",
          icon: <Trash2 className="h-3.5 w-3.5" />,
          shortcut: "Delete",
          danger: true,
          onSelect: () => {
            deleteGraphics(activeTargetIds);
            clearSelection();
          },
        },
      ];

      setContextMenu({ x: e.clientX, y: e.clientY, items });
      return;
    }

    // 空白画布右键菜单
    const existingIds = new Set(frame.graphics.map((g) => g.id));
    const pasteableIds = clipboard
      .map((item) => item.id)
      .filter((id) => existingIds.has(id));

    const blankItems: ContextMenuEntry[] = [
      {
        id: "ctx-insert-submenu",
        label: `在此处插入图元 (${artRm.x}, ${artRm.y})`,
        icon: <Plus className="h-3.5 w-3.5" />,
        children: GRAPHIC_KIND_METAS.map((meta, idx) => ({
          id: `ctx-insert-${meta.kind}`,
          label: meta.label,
          shortcut: String(idx + 1),
          onSelect: () => {
            const created = addGraphic(meta.kind, {
              rmX: artRm.x,
              rmY: artRm.y,
            });
            setSelectedIds([created.id]);
            setActiveTool("select");
          },
        })),
      },
      {
        id: "ctx-paste",
        label: "粘贴图元",
        icon: <ClipboardPaste className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+V",
        disabled: pasteableIds.length === 0,
        onSelect: () => {
          const pasted = duplicateGraphics(pasteableIds);
          setSelectedIds(pasted.map((g) => g.id));
        },
      },
      { type: "separator", id: "ctx-blank-sep-1" },
      {
        id: "ctx-fit",
        label: "适应视口",
        icon: <Maximize2 className="h-3.5 w-3.5" />,
        shortcut: "Ctrl+0",
        onSelect: handleFit,
      },
      {
        id: "ctx-100",
        label: "缩放到 100%",
        shortcut: "Ctrl+1",
        onSelect: handleZoom100,
      },
      { type: "separator", id: "ctx-blank-sep-2" },
      {
        id: "ctx-toggle-grid",
        label: showGrid ? "隐藏点阵网格" : "显示点阵网格",
        icon: <Grid3x3 className="h-3.5 w-3.5" />,
        shortcut: "G",
        onSelect: toggleGrid,
      },
      {
        id: "ctx-toggle-bg",
        label: showBackground ? "隐藏官方底图" : "显示官方底图",
        icon: <ImageIcon className="h-3.5 w-3.5" />,
        shortcut: "B",
        onSelect: toggleBackground,
      },
    ];

    setContextMenu({ x: e.clientX, y: e.clientY, items: blankItems });
  };

  return (
    <div
      ref={containerRef}
      {...panHandlers}
      onContextMenu={handleContainerContextMenu}
      className="relative h-full w-full flex-1 overflow-hidden bg-[var(--mk-bg-canvas)]"
      style={{ cursor }}
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
        draggable={false}
        onWheel={handleWheelZoom}
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
          title="切换点阵网格显示 (G)"
        >
          点阵
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

      {/* 自定义右键菜单 */}
      <ContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}
