import { AnimatePresence } from "motion/react";
import { cn } from "../cn";
import { ToastItem } from "./ToastItem";
import { useToastStore } from "./toastStore";

/**
 * 公共复用 Toaster 宿主组件
 */

export type ToastPosition = "bottom-right" | "top-right" | "bottom-center";

const POSITION_CLASSES: Record<ToastPosition, string> = {
  "bottom-right": "right-4 bottom-4 items-end",
  "top-right": "top-14 right-4 items-end",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
};

export function Toaster({
  position = "bottom-right",
}: {
  position?: ToastPosition;
}) {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[90] flex w-84 max-w-[calc(100vw-24px)] flex-col gap-2",
        POSITION_CLASSES[position],
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
