import { useCallback } from "react";
import type Konva from "konva";
import { RM_CANVAS_HEIGHT, RM_CANVAS_WIDTH } from "@/domain/protocol/constants";
import { useCanvasStore } from "@/stores/useCanvasStore";

/**
 * 画布视口缩放、居中适配与滚轮缩放 Hook
 */

export function useCanvasViewport() {
  const setViewport = useCanvasStore((s) => s.setViewport);

  const fitToViewport = useCallback(
    (containerWidth: number, containerHeight: number) => {
      if (containerWidth <= 0 || containerHeight <= 0) {
        return;
      }
      const padding = 56;
      const availW = Math.max(120, containerWidth - padding * 2);
      const availH = Math.max(120, containerHeight - padding * 2);
      const scale = Math.min(availW / RM_CANVAS_WIDTH, availH / RM_CANVAS_HEIGHT, 1.5);
      const offsetX = Math.round((containerWidth - RM_CANVAS_WIDTH * scale) / 2);
      const offsetY = Math.round((containerHeight - RM_CANVAS_HEIGHT * scale) / 2);
      setViewport(Number(scale.toFixed(4)), offsetX, offsetY);
    },
    [setViewport],
  );

  const resetTo100 = useCallback(
    (containerWidth: number, containerHeight: number) => {
      const offsetX = Math.round((containerWidth - RM_CANVAS_WIDTH) / 2);
      const offsetY = Math.round((containerHeight - RM_CANVAS_HEIGHT) / 2);
      setViewport(1, offsetX, offsetY);
    },
    [setViewport],
  );

  const handleWheelZoom = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;

      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      const scaleBy = 1.08;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const rawScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const nextScale = Math.max(0.15, Math.min(6, Number(rawScale.toFixed(4))));

      const nextX = pointer.x - mousePointTo.x * nextScale;
      const nextY = pointer.y - mousePointTo.y * nextScale;
      setViewport(nextScale, nextX, nextY);
    },
    [setViewport],
  );

  return { fitToViewport, resetTo100, handleWheelZoom };
}
