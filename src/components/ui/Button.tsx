import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

/**
 * 统一桌面端按钮组件（含克制微动效与焦点描边）
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--mk-radius-sm)] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mk-border-focus)] disabled:pointer-events-none disabled:opacity-45 cursor-pointer active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--mk-accent-primary)] text-[var(--mk-accent-on-primary)] hover:bg-[var(--mk-accent-primary-hover)] shadow-sm",
        secondary:
          "bg-[var(--mk-bg-surface)] text-[var(--mk-text-primary)] border border-[var(--mk-border-subtle)] hover:bg-[var(--mk-bg-surface-hover)] hover:border-[var(--mk-border-strong)]",
        ghost:
          "bg-transparent text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)]",
        danger:
          "bg-[var(--mk-status-error-tint)] text-[var(--mk-status-error)] border border-[var(--mk-status-error)]/30 hover:bg-[var(--mk-status-error)] hover:text-white",
      },
      size: {
        xs: "h-6 px-2 text-[11px]",
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-xs",
        lg: "h-9 px-4 text-[13px]",
        icon: "h-7 w-7 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
