import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { LiquidGlassSurface } from "./liquid-glass";
import { cn } from "./cn";

/**
 * 公共复用自定义磨砂玻璃右键菜单组件
 * 支持：窗口边缘自动防溢出定位、快捷键标注、危险操作着色、分割线与悬浮二级子菜单
 */

export type ContextMenuEntry =
  | {
      type: "separator";
      id: string;
    }
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect?: () => void;
      children?: ContextMenuEntry[];
    };

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

function MenuPanel({
  items,
  onClose,
}: {
  items: ContextMenuEntry[];
  onClose: () => void;
}) {
  const [hoveredSubId, setHoveredSubId] = useState<string | null>(null);

  return (
    <div className="min-w-[208px] py-1 text-xs">
      {items.map((entry) => {
        if (entry.type === "separator") {
          return (
            <div
              key={entry.id}
              className="my-1 h-px bg-[var(--mk-border-subtle)]"
            />
          );
        }

        const hasChildren = Boolean(entry.children && entry.children.length > 0);
        const subOpen = hoveredSubId === entry.id && hasChildren && !entry.disabled;

        return (
          <div
            key={entry.id}
            className="relative"
            onMouseEnter={() => setHoveredSubId(hasChildren ? entry.id : null)}
          >
            <button
              type="button"
              disabled={entry.disabled}
              onClick={() => {
                if (entry.disabled || hasChildren) return;
                entry.onSelect?.();
                onClose();
              }}
              className={cn(
                "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-40",
                entry.danger
                  ? "text-[var(--mk-status-error)] hover:bg-[var(--mk-status-error-tint)]"
                  : "text-[var(--mk-text-primary)] hover:bg-[var(--mk-accent-primary-tint)] hover:text-[var(--mk-accent-primary)]",
              )}
            >
              <span className="flex items-center gap-2">
                {entry.icon && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center opacity-85">
                    {entry.icon}
                  </span>
                )}
                <span>{entry.label}</span>
              </span>
              {hasChildren ? (
                <ChevronRight className="h-3.5 w-3.5 text-[var(--mk-text-muted)]" />
              ) : (
                entry.shortcut && (
                  <span className="mk-tabular text-[10px] text-[var(--mk-text-muted)]">
                    {entry.shortcut}
                  </span>
                )
              )}
            </button>

            {subOpen && entry.children && (
              <div className="absolute top-0 left-full ml-1">
                <LiquidGlassSurface cornerRadius={12} elastic={false} lightweight>
                  <MenuPanel items={entry.children} onClose={onClose} />
                </LiquidGlassSurface>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  useLayoutEffect(() => {
    if (!state) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = menuRef.current?.getBoundingClientRect();
    const menuW = rect?.width ?? 220;
    const menuH = rect?.height ?? 260;

    const left =
      state.x + menuW + 8 > vw ? Math.max(8, state.x - menuW) : state.x;
    const top =
      state.y + menuH + 8 > vh ? Math.max(8, vh - menuH - 8) : state.y;
    setPos({ left, top });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleBlur = () => onClose();
    window.addEventListener("keydown", handleKey);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("blur", handleBlur);
    };
  }, [state, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {state && (
        <div
          className="fixed inset-0 z-[85]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{ left: pos.left, top: pos.top }}
            className="fixed"
          >
            <LiquidGlassSurface cornerRadius={12} elastic={false} lightweight>
              <MenuPanel items={state.items} onClose={onClose} />
            </LiquidGlassSurface>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
