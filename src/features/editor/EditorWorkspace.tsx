import { useCallback, useRef } from "react";
import { useDocumentDiagnostics } from "@/hooks/useDocumentDiagnostics";
import { useEditorShortcuts } from "@/hooks/useEditorShortcuts";
import { CanvasStage } from "./CanvasStage";
import { LeftSidebar } from "./LeftSidebar";
import { RightInspector } from "./RightInspector";
import { ToolRail } from "./ToolRail";

/**
 * 主编辑工作台容器（远左工具条 + 左侧图层面板 + 中央 1920×1080 画布 + 右侧检查器）
 */

export function EditorWorkspace() {
  const { activeFrame, budget, issues } = useDocumentDiagnostics();
  const viewportControlsRef = useRef<{
    fit: () => void;
    zoom100: () => void;
  } | null>(null);

  const onFitViewport = useCallback(() => {
    viewportControlsRef.current?.fit();
  }, []);

  const onZoom100 = useCallback(() => {
    viewportControlsRef.current?.zoom100();
  }, []);

  useEditorShortcuts({
    enabled: true,
    onFitViewport,
    onZoom100,
  });

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ToolRail />
      <LeftSidebar activeFrame={activeFrame} />
      <CanvasStage
        frame={activeFrame}
        editable={true}
        onRegisterViewportControls={(controls) => {
          viewportControlsRef.current = controls;
        }}
      />
      <RightInspector
        activeFrame={activeFrame}
        budget={budget}
        issues={issues}
      />
    </div>
  );
}
