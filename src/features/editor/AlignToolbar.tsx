import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Crosshair,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Controls";
import { LiquidGlassSurface } from "@/components/ui/liquid-glass";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore, type AlignMode } from "@/stores/useDocumentStore";

/**
 * 选中图元时浮现在画布顶部的玻璃态对齐工具条
 */

const ALIGN_ACTIONS: ReadonlyArray<{
  mode: AlignMode;
  label: string;
  icon: typeof AlignStartVertical;
}> = [
  { mode: "left", label: "左对齐", icon: AlignStartVertical },
  { mode: "centerX", label: "水平居中对齐", icon: AlignCenterVertical },
  { mode: "right", label: "右对齐", icon: AlignEndVertical },
  { mode: "top", label: "顶对齐", icon: AlignStartHorizontal },
  { mode: "centerY", label: "垂直居中对齐", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "底对齐", icon: AlignEndHorizontal },
  { mode: "canvasCenter", label: "对齐到 1920×1080 画布中心", icon: Crosshair },
];

export function AlignToolbar() {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const alignGraphics = useDocumentStore((s) => s.alignGraphics);

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2">
      <LiquidGlassSurface
        cornerRadius={999}
        elastic={true}
        className="pointer-events-auto"
        contentClassName="flex items-center gap-0.5 px-2 py-1"
      >
        <span className="mk-tabular px-2 text-[11px] font-medium text-[var(--mk-text-secondary)]">
          已选 {selectedIds.length}
        </span>
        <span className="h-3.5 w-px bg-[var(--mk-border-subtle)]" />
        {ALIGN_ACTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.mode} content={item.label}>
              <button
                type="button"
                onClick={() => alignGraphics(selectedIds, item.mode)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--mk-text-secondary)] transition-colors hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          );
        })}
      </LiquidGlassSurface>
    </div>
  );
}
