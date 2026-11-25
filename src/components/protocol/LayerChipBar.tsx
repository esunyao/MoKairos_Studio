import type { LayerIndex } from "@/domain/protocol/types";
import { cn } from "../ui/cn";

/**
 * 图层 L0-L9 快捷过滤芯片条（左键显隐，Alt+点击或双击隔离单层）
 */

const LAYERS: LayerIndex[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function LayerChipBar({
  visibleLayers,
  isolatedLayer,
  countsByLayer,
  onToggleLayer,
  onIsolateLayer,
}: {
  visibleLayers: Record<LayerIndex, boolean>;
  isolatedLayer: LayerIndex | null;
  countsByLayer: Record<LayerIndex, number>;
  onToggleLayer: (layer: LayerIndex) => void;
  onIsolateLayer: (layer: LayerIndex | null) => void;
}) {
  return (
    <div className="border-t border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-2">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--mk-text-muted)]">
        <span>图层过滤 (L0–L9)</span>
        {isolatedLayer !== null ? (
          <button
            type="button"
            onClick={() => onIsolateLayer(null)}
            className="text-[11px] text-[var(--mk-accent-primary)] hover:underline cursor-pointer"
          >
            恢复全显
          </button>
        ) : (
          <span className="text-[10px]">双击隔离单层</span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {LAYERS.map((layer) => {
          const active = visibleLayers[layer];
          const isolated = isolatedLayer === layer;
          const count = countsByLayer[layer] ?? 0;
          return (
            <button
              key={layer}
              type="button"
              onClick={(e) => {
                if (e.altKey) {
                  onIsolateLayer(layer);
                } else {
                  onToggleLayer(layer);
                }
              }}
              onDoubleClick={() => onIsolateLayer(layer)}
              title={`图层 ${layer}（含 ${count} 个图元）`}
              className={cn(
                "mk-tabular relative flex h-6 items-center justify-center rounded-[var(--mk-radius-sm)] border text-[11px] font-medium transition-colors cursor-pointer",
                isolated
                  ? "border-[var(--mk-accent-primary)] bg-[var(--mk-accent-primary)] text-[var(--mk-accent-on-primary)]"
                  : active
                    ? "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] text-[var(--mk-text-primary)] hover:border-[var(--mk-border-strong)]"
                    : "border-transparent bg-transparent text-[var(--mk-text-muted)] opacity-50 hover:opacity-80",
              )}
            >
              L{layer}
              {count > 0 && (
                <span
                  className={cn(
                    "absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full",
                    isolated
                      ? "bg-[var(--mk-accent-on-primary)]"
                      : "bg-[var(--mk-accent-primary)]",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
