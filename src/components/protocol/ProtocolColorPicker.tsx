import { RM_PROTOCOL_COLORS, type RmColorId } from "@/domain/protocol/constants";
import { cn } from "../ui/cn";

/**
 * 裁判系统协议 9 色选择器（硬锁 0..8 枚举，严禁自由 HEX 取色盘）
 */

export function ProtocolColorPicker({
  value,
  team,
  onChange,
}: {
  value: RmColorId | "mixed";
  team: "red" | "blue";
  onChange: (color: RmColorId) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {RM_PROTOCOL_COLORS.map((item) => {
        const selected = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={`${item.id}: ${item.label}`}
            onClick={() => onChange(item.id)}
            className={cn(
              "group relative flex h-8 flex-col items-center justify-center rounded-[var(--mk-radius-sm)] border transition-all cursor-pointer",
              selected
                ? "border-[var(--mk-border-focus)] ring-2 ring-[var(--mk-accent-primary-tint)] scale-[1.03]"
                : "border-[var(--mk-border-subtle)] hover:border-[var(--mk-border-strong)]",
            )}
          >
            {item.id === 0 ? (
              <span
                className="h-4 w-5 rounded-[3px] border border-white/20"
                style={{
                  background:
                    "linear-gradient(135deg, var(--rm-proto-0-main-red) 50%, var(--rm-proto-0-main-blue) 50%)",
                }}
              />
            ) : (
              <span
                className="h-4 w-5 rounded-[3px] border border-white/20"
                style={{
                  backgroundColor:
                    team === "blue" ? item.bluePreviewHex : item.redPreviewHex,
                }}
              />
            )}
            <span className="mk-tabular mt-0.5 text-[9px] leading-none text-[var(--mk-text-muted)]">
              {item.id}
            </span>
          </button>
        );
      })}
    </div>
  );
}
