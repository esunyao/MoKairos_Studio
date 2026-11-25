import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "./cn";

/**
 * 基于 Radix Dialog 的玻璃质感模态对话框
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: DialogPrimitive.DialogContentProps & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        className={cn(
          "mk-glass-elevated fixed top-1/2 left-1/2 z-50 w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--mk-radius-lg)] p-5 text-[var(--mk-text-primary)] focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <DialogPrimitive.Title className="text-[15px] font-semibold text-[var(--mk-text-primary)]">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-xs text-[var(--mk-text-secondary)]">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--mk-radius-sm)] text-[var(--mk-text-secondary)] transition-colors hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
