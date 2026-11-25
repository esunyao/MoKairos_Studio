import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  resolveAdaptiveInk,
  sampleSubRectFromGrid,
  type BackdropGridSample,
  type GlassInk,
} from "@/services/backdropLuminance";

/**
 * 液态玻璃局部区域自适应对比度上下文与插槽组件
 * 允许同一菜单/浮动胶囊在不同局部区域根据底层 16×16 空间亮度网格独立切换黑字 / 白字，零额外 GPU 采样开销
 */

export interface GlassContrastContextValue {
  sample: BackdropGridSample | null;
  sampleVersion: number;
  enabled: boolean;
  overLight: boolean;
  fallbackInk: GlassInk;
}

const DEFAULT_CONTEXT_VALUE: GlassContrastContextValue = {
  sample: null,
  sampleVersion: 0,
  enabled: false,
  overLight: false,
  fallbackInk: "light",
};

export const GlassContrastContext =
  createContext<GlassContrastContextValue>(DEFAULT_CONTEXT_VALUE);

export function useGlassContrastContext(): GlassContrastContextValue {
  return useContext(GlassContrastContext);
}

/**
 * 包裹玻璃容器内部的子行、子按钮或图标槽位，按其真实包围盒从父级 16×16 网格实时计算局部黑白字极性
 */
export function AdaptiveGlassSlot({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span";
}) {
  const ctx = useGlassContrastContext();
  const divRef = useRef<HTMLDivElement | null>(null);
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const prevInkRef = useRef<GlassInk>(ctx.fallbackInk);

  const [local, setLocal] = useState<{ ink: GlassInk; mixed: boolean } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = as === "span" ? spanRef.current : divRef.current;
    if (!ctx.enabled || !ctx.sample || !ctx.sample.valid || !el) {
      setLocal((prev) => (prev === null ? prev : null));
      return;
    }

    const sub = sampleSubRectFromGrid(ctx.sample, el.getBoundingClientRect());
    if (!sub.valid) {
      setLocal((prev) => (prev === null ? prev : null));
      return;
    }

    const nextInk = resolveAdaptiveInk(sub.luminance, prevInkRef.current, {
      overLight: ctx.overLight,
    });
    prevInkRef.current = nextInk;
    const nextMixed = sub.variance > 0.035;

    setLocal((prev) =>
      prev && prev.ink === nextInk && prev.mixed === nextMixed
        ? prev
        : { ink: nextInk, mixed: nextMixed },
    );
  }, [
    as,
    ctx.enabled,
    ctx.sample,
    ctx.sampleVersion,
    ctx.overLight,
    ctx.fallbackInk,
  ]);

  const inkAttr = ctx.enabled && local ? local.ink : undefined;
  const mixedAttr =
    ctx.enabled && local ? (local.mixed ? "true" : "false") : undefined;

  if (as === "span") {
    return (
      <span
        ref={spanRef}
        data-glass-ink={inkAttr}
        data-glass-mixed={mixedAttr}
        className={className}
      >
        {children}
      </span>
    );
  }

  return (
    <div
      ref={divRef}
      data-glass-ink={inkAttr}
      data-glass-mixed={mixedAttr}
      className={className}
    >
      {children}
    </div>
  );
}
