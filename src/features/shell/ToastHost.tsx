import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";

/**
 * 全局玻璃态轻量消息提示栈
 */

export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const icon =
            item.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--mk-status-ok)]" />
            ) : item.tone === "warn" ? (
              <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--mk-status-warn)]" />
            ) : item.tone === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-[var(--mk-status-error)]" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-[var(--mk-accent-primary)]" />
            );

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="mk-glass-elevated pointer-events-auto flex items-start gap-2.5 rounded-[var(--mk-radius-md)] p-3 text-xs"
            >
              {icon}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[var(--mk-text-primary)]">
                  {item.title}
                </div>
                {item.description && (
                  <div className="mt-0.5 break-all text-[11px] text-[var(--mk-text-secondary)]">
                    {item.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                className="text-[var(--mk-text-muted)] hover:text-[var(--mk-text-primary)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
