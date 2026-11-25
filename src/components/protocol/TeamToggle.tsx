import { motion } from "motion/react";
import { cn } from "../ui/cn";

/**
 * 红 / 蓝阵营主色实时切换分段开关（检验 color=0 主色在双方阵营下的对比度）
 */

export function TeamToggle({
  team,
  onChange,
  layoutId = "team-toggle-pill",
}: {
  team: "red" | "blue";
  onChange: (team: "red" | "blue") => void;
  layoutId?: string;
}) {
  return (
    <div className="inline-flex h-7 items-center rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-0.5 text-[11px] font-medium">
      <button
        type="button"
        onClick={() => onChange("red")}
        className={cn(
          "relative flex h-full items-center gap-1 rounded-[4px] px-2.5 transition-colors cursor-pointer",
          team === "red"
            ? "text-white"
            : "text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)]",
        )}
      >
        {team === "red" && (
          <motion.span
            layoutId={layoutId}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            className="absolute inset-0 rounded-[4px] bg-[#ef4444]"
          />
        )}
        <span className="relative z-10">红方</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("blue")}
        className={cn(
          "relative flex h-full items-center gap-1 rounded-[4px] px-2.5 transition-colors cursor-pointer",
          team === "blue"
            ? "text-white"
            : "text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)]",
        )}
      >
        {team === "blue" && (
          <motion.span
            layoutId={layoutId}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            className="absolute inset-0 rounded-[4px] bg-[#0284c7]"
          />
        )}
        <span className="relative z-10">蓝方</span>
      </button>
    </div>
  );
}
