import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  resolveAdaptiveInk,
  sampleElementBackdropLuminance,
  type GlassInk,
} from "@/services/backdropLuminance";
import { useAppStore, type ThemeMode } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 液态玻璃背景相对亮度响应式采样 Hook
 * 自动跟随容器尺寸、明暗主题、画布平移缩放、底图切换与滚动事件更新文字极性
 */

const SAMPLE_THROTTLE_MS = 100;

export function useAdaptiveGlassContrast(
  ref: RefObject<HTMLElement | null>,
  options: {
    enabled: boolean;
    overLight: boolean;
    theme: ThemeMode;
  },
): {
  ink: GlassInk;
  isMixedContrast: boolean;
  luminance: number;
} {
  const { enabled, overLight, theme } = options;
  const fallbackInk: GlassInk = theme === "light" ? "dark" : "light";

  const [state, setState] = useState<{
    ink: GlassInk;
    isMixedContrast: boolean;
    luminance: number;
  }>(() => ({
    ink: fallbackInk,
    isMixedContrast: false,
    luminance: theme === "light" ? 0.9 : 0.08,
  }));

  const prevInkRef = useRef<GlassInk>(fallbackInk);
  const lastSampleAtRef = useRef(0);
  const trailingTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const performSample = useCallback(() => {
    const el = ref.current;
    if (!enabled || !el) {
      const nextInk: GlassInk = theme === "light" ? "dark" : "light";
      prevInkRef.current = nextInk;
      setState((prev) =>
        prev.ink === nextInk && !prev.isMixedContrast
          ? prev
          : {
              ink: nextInk,
              isMixedContrast: false,
              luminance: theme === "light" ? 0.9 : 0.08,
            },
      );
      return;
    }

    const result = sampleElementBackdropLuminance(el);
    if (!result.valid) {
      return;
    }

    const nextInk = resolveAdaptiveInk(result.luminance, prevInkRef.current, {
      overLight,
    });
    prevInkRef.current = nextInk;
    const isMixedContrast = result.variance > 0.065;

    setState((prev) => {
      if (
        prev.ink === nextInk &&
        prev.isMixedContrast === isMixedContrast &&
        Math.abs(prev.luminance - result.luminance) < 0.015
      ) {
        return prev;
      }
      return {
        ink: nextInk,
        isMixedContrast,
        luminance: result.luminance,
      };
    });
  }, [enabled, overLight, ref, theme]);

  const scheduleSample = useCallback(() => {
    if (typeof window === "undefined") return;
    const now = performance.now();
    const elapsed = now - lastSampleAtRef.current;

    if (elapsed >= SAMPLE_THROTTLE_MS) {
      lastSampleAtRef.current = now;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        performSample();
      });
      return;
    }

    if (trailingTimerRef.current === null) {
      trailingTimerRef.current = window.setTimeout(() => {
        trailingTimerRef.current = null;
        lastSampleAtRef.current = performance.now();
        performSample();
      }, SAMPLE_THROTTLE_MS - elapsed);
    }
  }, [performSample]);

  // 订阅应用、画布视口与活跃帧变化
  const view = useAppStore((s) => s.view);
  const surfaceStyle = useAppStore((s) => s.surfaceStyle);

  const scale = useCanvasStore((s) => s.scale);
  const offsetX = useCanvasStore((s) => s.offsetX);
  const offsetY = useCanvasStore((s) => s.offsetY);
  const showBackground = useCanvasStore((s) => s.showBackground);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const previewTeam = useCanvasStore((s) => s.previewTeam);

  const activeFrameId = useDocumentStore((s) => s.doc.activeFrameId);
  const frames = useDocumentStore((s) => s.doc.frames);

  useEffect(() => {
    scheduleSample();
    // 主题/视图切换带有 180ms 渐变或 Konva 异步重绘，补采一次稳态样本
    const settleTimer = window.setTimeout(() => {
      performSample();
    }, 190);
    return () => {
      window.clearTimeout(settleTimer);
    };
  }, [
    enabled,
    overLight,
    theme,
    view,
    surfaceStyle,
    scale,
    offsetX,
    offsetY,
    showBackground,
    showGrid,
    previewTeam,
    activeFrameId,
    frames,
    scheduleSample,
    performSample,
  ]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => scheduleSample())
        : null;
    ro?.observe(el);

    const onViewportChange = () => scheduleSample();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [enabled, ref, scheduleSample]);

  useEffect(() => {
    return () => {
      if (trailingTimerRef.current !== null) {
        window.clearTimeout(trailingTimerRef.current);
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (!enabled) {
    return {
      ink: fallbackInk,
      isMixedContrast: false,
      luminance: theme === "light" ? 0.9 : 0.08,
    };
  }

  return state;
}
