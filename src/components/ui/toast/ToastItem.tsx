import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { LiquidGlassSurface } from "@/components/ui/liquid-glass";
import type { ToastRecord, ToastTone } from "./toastStore";

/**
 * 单条玻璃态通知卡片（支持悬停暂停自动关闭、操作按钮与进度条）
 */

const TONE_META: Record<
  ToastTone,
  { barClass: string; icon: typeof Info; iconClass: string }
> = {
  success: {
    barClass: "bg-[var(--mk-status-ok)]",
    icon: CheckCircle2,
    iconClass: "text-[var(--mk-status-ok)]",
  },
  warn: {
    barClass: "bg-[var(--mk-status-warn)]",
    icon: TriangleAlert,
    iconClass: "text-[var(--mk-status-warn)]",
  },
  error: {
    barClass: "bg-[var(--mk-status-error)]",
    icon: AlertCircle,
    iconClass: "text-[var(--mk-status-error)]",
  },
  info: {
    barClass: "bg-[var(--mk-accent-primary)]",
    icon: Info,
    iconClass: "text-[var(--mk-accent-primary)]",
  },
};

export function ToastItem({
  item,
  onDismiss,
}: {
  item: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(item.duration);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (item.duration <= 0 || paused) {
      return;
    }
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(item.id);
    }, Math.max(50, remainingRef.current));

    return () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [item.id, item.duration, paused, onDismiss]);

  const meta = TONE_META[item.tone];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto"
    >
      <LiquidGlassSurface
        cornerRadius={12}
        elastic={false}
        contentClassName="relative overflow-hidden rounded-[12px] p-3 pl-3.5 text-xs"
      >
        <span
          className={`absolute top-2 bottom-2 left-1 w-[3px] rounded-full ${meta.barClass}`}
        />
        <div className="flex items-start gap-2.5">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.iconClass}`} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[var(--mk-text-primary)]">
              {item.title}
            </div>
            {item.description && (
              <div className="mt-0.5 break-all text-[11px] leading-relaxed text-[var(--mk-text-secondary)]">
                {item.description}
              </div>
            )}
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  onDismiss(item.id);
                }}
                className="mt-1.5 text-[11px] font-medium text-[var(--mk-accent-primary)] hover:underline cursor-pointer"
              >
                {item.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            aria-label="关闭提示"
            className="rounded p-0.5 text-[var(--mk-text-muted)] transition-colors hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {item.duration > 0 && (
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: paused ? undefined : 0 }}
            transition={{ duration: item.duration / 1000, ease: "linear" }}
            className={`absolute right-0 bottom-0 left-0 h-[2px] origin-left opacity-45 ${meta.barClass}`}
          />
        )}
      </LiquidGlassSurface>
    </motion.div>
  );
}
