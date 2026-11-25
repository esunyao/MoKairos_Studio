import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useCanvasStore } from "@/stores/useCanvasStore";

/**
 * 统一画布指针平移与临时抓手状态机
 * 替代 Konva Stage.draggable，完整支持：
 * 1. 鼠标中键拖动 & 中键+左键同时按住拖动（松开即恢复原工具，不做单击切工具）
 * 2. Alt + 鼠标左键拖动（松开即恢复原工具）
 * 3. Space + 鼠标左键拖动 & 抓手工具(H) 左键拖动 & 只读视口左键拖动
 * 4. 鼠标中键双击 -> 自适应视口
 * 5. Pointer Capture + 窗口失焦保护（永不卡死抓手态）
 */

export function useCanvasPan(params: {
  editable: boolean;
  onFitViewport: () => void;
}) {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const [isPanning, setIsPanning] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const altRef = useRef(false);
  const spaceRef = useRef(false);
  const lastMiddleTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const panSessionRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    wasMiddle: boolean;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    wasMiddle: false,
    moved: false,
  });

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        altRef.current = true;
        setAltHeld(true);
      }
      if (e.code === "Space" && !isTyping(e.target)) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        altRef.current = false;
        setAltHeld(false);
      }
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };

    const resetModifiersAndPan = () => {
      altRef.current = false;
      spaceRef.current = false;
      setAltHeld(false);
      setSpaceHeld(false);
      panSessionRef.current.active = false;
      panSessionRef.current.pointerId = null;
      setIsPanning(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetModifiersAndPan);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", resetModifiersAndPan);
    };
  }, []);

  const shouldStartPan = (e: ReactPointerEvent<HTMLDivElement>): boolean => {
    // 1. 鼠标中键按下，或中键+左键联合按住
    if (e.button === 1 || (e.buttons & 4) !== 0) {
      return true;
    }
    // 2. 左键在 Alt / Space / 抓手工具 / 只读模拟模式下按下
    if (e.button === 0) {
      if (e.altKey || altRef.current || spaceRef.current) {
        return true;
      }
      if (!params.editable || useCanvasStore.getState().activeTool === "pan") {
        return true;
      }
    }
    return false;
  };

  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 若已在平移中，叠加按下左键（中键+左键场景）只拦截事件不重置会话
    if (panSessionRef.current.active) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!shouldStartPan(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const wasMiddle = e.button === 1 || (e.buttons & 4) !== 0;

    // 中键双击检测（非拖动前提下自适应视口）
    if (e.button === 1) {
      const now = Date.now();
      const prev = lastMiddleTapRef.current;
      if (
        prev &&
        now - prev.time < 320 &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 8
      ) {
        lastMiddleTapRef.current = null;
        params.onFitViewport();
        return;
      }
      lastMiddleTapRef.current = { time: now, x: e.clientX, y: e.clientY };
    }

    panSessionRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      wasMiddle,
      moved: false,
    };
    setIsPanning(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 某些合成事件无 pointerId 捕获能力时安全忽略
    }
  };

  const onPointerMoveCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session.active || session.pointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - session.lastX;
    const dy = e.clientY - session.lastY;
    session.lastX = e.clientX;
    session.lastY = e.clientY;
    if (Math.hypot(e.clientX - session.startX, e.clientY - session.startY) > 4) {
      session.moved = true;
      lastMiddleTapRef.current = null;
    }

    if (dx === 0 && dy === 0) return;
    const { scale, offsetX, offsetY, setViewport } = useCanvasStore.getState();
    setViewport(scale, offsetX + dx, offsetY + dy);
  };

  const finishPanIfNeeded = (e: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session.active || session.pointerId !== e.pointerId) {
      return;
    }

    // 中键+左键场景：只要中键仍处于按住状态（buttons & 4），松开左键不打断平移
    if ((e.buttons & 4) !== 0 && e.type !== "pointercancel") {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    session.active = false;
    session.pointerId = null;
    setIsPanning(false);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // 安全忽略
    }
  };

  const cursor = isPanning
    ? "grabbing"
    : altHeld || spaceHeld || !params.editable || activeTool === "pan"
      ? "grab"
      : activeTool !== "select"
        ? "crosshair"
        : "default";

  return {
    isPanning,
    cursor,
    panHandlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture: finishPanIfNeeded,
      onPointerCancelCapture: finishPanIfNeeded,
      onAuxClick: (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) {
          e.preventDefault();
        }
      },
    },
  };
}
