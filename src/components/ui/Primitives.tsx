import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

/**
 * 文本输入框与状态徽章原语
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-7 w-full rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2.5 text-xs text-[var(--mk-text-primary)] placeholder:text-[var(--mk-text-muted)] transition-colors focus:border-[var(--mk-border-focus)] focus:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--mk-bg-surface)] text-[var(--mk-text-secondary)] border border-[var(--mk-border-subtle)]",
        accent:
          "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)] border border-[var(--mk-accent-primary)]/30",
        ok: "bg-[var(--mk-status-ok-tint)] text-[var(--mk-status-ok)] border border-[var(--mk-status-ok)]/30",
        warn: "bg-[var(--mk-status-warn-tint)] text-[var(--mk-status-warn)] border border-[var(--mk-status-warn)]/30",
        error:
          "bg-[var(--mk-status-error-tint)] text-[var(--mk-status-error)] border border-[var(--mk-status-error)]/30",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
