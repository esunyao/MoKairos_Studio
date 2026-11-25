import {
  Binary,
  Circle,
  CircleDot,
  Hand,
  Hash,
  Minus,
  MousePointer2,
  Spline,
  Square,
  Type,
} from "lucide-react";
import type { GraphicKind } from "@/domain/protocol/constants";
import { Tooltip } from "@/components/ui/Controls";
import { cn } from "@/components/ui/cn";
import { useCanvasStore, type CanvasTool } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 远左 44px 绘图工具条：选择、抓手与裁判系统 8 类基本图元
 * 点击切换绘制模式，双击图元工具直接在画布安全区中心快速插入
 */

const TOOL_ITEMS: ReadonlyArray<{
  id: CanvasTool;
  label: string;
  shortcut: string;
  icon: typeof MousePointer2;
  kind?: GraphicKind;
}> = [
  { id: "select", label: "选择 / 变换", shortcut: "V", icon: MousePointer2 },
  { id: "pan", label: "平移画布 (按住 Space)", shortcut: "H", icon: Hand },
  { id: "line", label: "直线 (Line)", shortcut: "1", icon: Minus, kind: "line" },
  { id: "rect", label: "矩形 (Rect)", shortcut: "2", icon: Square, kind: "rect" },
  { id: "circle", label: "正圆 (Circle)", shortcut: "3", icon: Circle, kind: "circle" },
  { id: "ellipse", label: "椭圆 (Ellipse)", shortcut: "4", icon: CircleDot, kind: "ellipse" },
  { id: "arc", label: "圆弧 (Arc)", shortcut: "5", icon: Spline, kind: "arc" },
  { id: "float", label: "浮点数 (Float)", shortcut: "6", icon: Binary, kind: "float" },
  { id: "int", label: "整型数 (Int)", shortcut: "7", icon: Hash, kind: "int" },
  { id: "text", label: "字符 (Text)", shortcut: "8", icon: Type, kind: "text" },
];

export function ToolRail() {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const addGraphic = useDocumentStore((s) => s.addGraphic);

  return (
    <aside className="flex w-[var(--mk-toolrail-width)] shrink-0 flex-col items-center gap-1 border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] py-2">
      {TOOL_ITEMS.map((item, idx) => {
        const Icon = item.icon;
        const active = activeTool === item.id;
        return (
          <div key={item.id} className="flex flex-col items-center">
            {idx === 2 && (
              <span className="my-1 h-px w-6 bg-[var(--mk-border-subtle)]" />
            )}
            <Tooltip
              side="right"
              content={
                <span>
                  {item.label} <kbd className="ml-1 opacity-70">{item.shortcut}</kbd>
                  {item.kind && (
                    <span className="block text-[10px] opacity-70">
                      画布点击放置 / 双击快速居中插入
                    </span>
                  )}
                </span>
              }
            >
              <button
                type="button"
                onClick={() => setActiveTool(item.id)}
                onDoubleClick={() => {
                  if (item.kind) {
                    const created = addGraphic(item.kind, { rmX: 960, rmY: 400 });
                    setSelectedIds([created.id]);
                    setActiveTool("select");
                  }
                }}
                aria-label={item.label}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-[var(--mk-radius-sm)] transition-all cursor-pointer",
                  active
                    ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)] ring-1 ring-[var(--mk-accent-primary)]/40"
                    : "text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)]",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </Tooltip>
          </div>
        );
      })}
    </aside>
  );
}
