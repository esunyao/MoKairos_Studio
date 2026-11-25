import * as React from "react";
import { cn } from "./cn";

/**
 * 数值步进输入组件（强制等宽对齐数字 .mk-tabular，支持上下键微调与回车提交）
 */

export interface NumberStepperProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
  className?: string;
}

export function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled,
  onChange,
  className,
}: NumberStepperProps) {
  const [draft, setDraft] = React.useState(String(value));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [value, focused]);

  const clampVal = (num: number) => {
    let out = num;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const next = clampVal(step >= 1 ? Math.round(parsed) : parsed);
      onChange(next);
      setDraft(String(next));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <label
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2 transition-colors focus-within:border-[var(--mk-border-focus)]",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {label && (
        <span className="shrink-0 text-[11px] font-medium text-[var(--mk-text-muted)]">
          {label}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={focused ? draft : String(value)}
        onFocus={(e) => {
          setFocused(true);
          setDraft(String(value));
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitDraft();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const delta = e.shiftKey ? step * 10 : step;
            onChange(clampVal(Number((value + delta).toFixed(3))));
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const delta = e.shiftKey ? step * 10 : step;
            onChange(clampVal(Number((value - delta).toFixed(3))));
          }
        }}
        className="mk-tabular min-w-0 flex-1 bg-transparent text-right text-xs text-[var(--mk-text-primary)] focus:outline-none"
      />
      {unit && (
        <span className="shrink-0 text-[10px] text-[var(--mk-text-muted)]">
          {unit}
        </span>
      )}
    </label>
  );
}
