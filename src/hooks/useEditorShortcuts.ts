import { useEffect, useRef } from "react";
import { GRAPHIC_KIND_METAS } from "@/domain/protocol/constants";
import { saveCurrentProject } from "@/services/projectActions";
import { useAppStore } from "@/stores/useAppStore";
import { useCanvasStore, type CanvasTool } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 编辑工作台全局快捷键 Hook（带输入框焦点保护与 Space 临时抓手）
 */

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function useEditorShortcuts(params: {
  enabled: boolean;
  onFitViewport: () => void;
  onZoom100: () => void;
}) {
  const prevToolBeforeSpaceRef = useRef<CanvasTool | null>(null);

  useEffect(() => {
    if (!params.enabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const canvas = useCanvasStore.getState();
      const docStore = useDocumentStore.getState();

      // 保存 / 另存为
      if (mod && key === "s") {
        e.preventDefault();
        void saveCurrentProject(e.shiftKey);
        return;
      }

      // 撤销 / 重做
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          docStore.redo();
        } else {
          docStore.undo();
        }
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        docStore.redo();
        return;
      }

      // 复制 / 粘贴 / 再制
      if (mod && key === "c") {
        e.preventDefault();
        const activeFrame =
          docStore.doc.frames.find((f) => f.id === docStore.doc.activeFrameId) ??
          docStore.doc.frames[0];
        const copied = activeFrame.graphics.filter((g) =>
          canvas.selectedIds.includes(g.id),
        );
        if (copied.length > 0) {
          canvas.setClipboard(copied);
          useAppStore.getState().pushToast({
            tone: "info",
            title: `已复制 ${copied.length} 个图元`,
          });
        }
        return;
      }

      if (mod && key === "v") {
        e.preventDefault();
        if (canvas.clipboard.length > 0) {
          const activeFrame =
            docStore.doc.frames.find((f) => f.id === docStore.doc.activeFrameId) ??
            docStore.doc.frames[0];
          const existingIds = new Set(activeFrame.graphics.map((g) => g.id));
          const targetIds = canvas.clipboard
            .map((c) => c.id)
            .filter((id) => existingIds.has(id));
          if (targetIds.length > 0) {
            const pasted = docStore.duplicateGraphics(targetIds);
            canvas.setSelectedIds(pasted.map((g) => g.id));
          }
        }
        return;
      }

      if (mod && key === "d") {
        e.preventDefault();
        if (canvas.selectedIds.length > 0) {
          const dup = docStore.duplicateGraphics(canvas.selectedIds);
          canvas.setSelectedIds(dup.map((g) => g.id));
        }
        return;
      }

      // 视口快捷键
      if (mod && key === "0") {
        e.preventDefault();
        params.onFitViewport();
        return;
      }
      if (mod && key === "1") {
        e.preventDefault();
        params.onZoom100();
        return;
      }

      // 全选当前画面图元
      if (mod && key === "a") {
        e.preventDefault();
        const activeFrame =
          docStore.doc.frames.find((f) => f.id === docStore.doc.activeFrameId) ??
          docStore.doc.frames[0];
        canvas.setSelectedIds(
          activeFrame.graphics.filter((g) => !g.locked).map((g) => g.id),
        );
        return;
      }

      // 删除选中图元
      if (e.key === "Delete" || e.key === "Backspace") {
        if (canvas.selectedIds.length > 0) {
          e.preventDefault();
          docStore.deleteGraphics(canvas.selectedIds);
          canvas.clearSelection();
        }
        return;
      }

      // 方向键微调（RM 左下角原点：ArrowUp 增加 Y）
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        if (canvas.selectedIds.length > 0) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
          docStore.moveGraphicsDelta(canvas.selectedIds, dx, dy);
        }
        return;
      }

      // 临时抓手 Space
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        if (prevToolBeforeSpaceRef.current === null) {
          prevToolBeforeSpaceRef.current = canvas.activeTool;
          canvas.setActiveTool("pan");
        }
        return;
      }

      // 单键切换工具与辅助层
      if (!mod && !e.altKey) {
        if (key === "v") canvas.setActiveTool("select");
        else if (key === "h") canvas.setActiveTool("pan");
        else if (key === "g") canvas.toggleSafeArea();
        else if (key === "b") canvas.toggleBackground();
        else if (key === "escape") {
          canvas.setActiveTool("select");
          canvas.clearSelection();
        } else if (/^[1-8]$/.test(key)) {
          const meta = GRAPHIC_KIND_METAS[Number(key) - 1];
          if (meta) canvas.setActiveTool(meta.kind);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && prevToolBeforeSpaceRef.current !== null) {
        useCanvasStore.getState().setActiveTool(prevToolBeforeSpaceRef.current);
        prevToolBeforeSpaceRef.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [params.enabled, params.onFitViewport, params.onZoom100]);
}
