import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  resolveAdaptiveInk,
  sampleElementBackdropGrid,
  type BackdropGridSample,
  type GlassInk,
} from "@/services/backdropLuminance";
import { useAppStore, type ThemeMode } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 液态玻璃背景 16×16 空间亮度网格响应式采样 Hook
 * - 避免将高频画布平移/缩放订阅进 React 渲染树，改用命令式 Store 订阅 + 防抖（含 maxWait 上限）
 * - 支持 sampleKey（如 Portal 重定位坐标）在定位与入场动画结束后立即补采稳态网格
 */

const PAN_DEBOUNCE_MS = 220;
const PAN_MAX_WAIT_MS = 500;
const DOC_DEBOUNCE_MS = 120;

function hasGridChanged(
  prev: Float32Array | undefined,
  next: Float32Array,
): boolean {
  if (!prev || prev.length !== next.length) {
    return true;
  }
  for (let i = 0; i < next.length; i++) {
    if (Math.abs(prev[i] - next[i]) >= 0.02) {
      return true;
    }
  }
  return false;
}

export function useAdaptiveGlassContrast(
  ref: RefObject<HTMLElement | null>,
  options: {
    enabled: boolean;
    overLight: boolean;
    theme: ThemeMode;
    trackCanvas?: boolean;
    sampleKey?: string | number;
  },
): {
  ink: GlassInk;
  isMixedContrast: boolean;
  luminance: number;
  sample: BackdropGridSample | null;
  sampleVersion: number;
} {
  const { enabled, overLight, theme, trackCanvas = true, sampleKey } = options;
  const fallbackInk: GlassInk = theme === "light" ? "dark" : "light";

  const [state, setState] = useState<{
    ink: GlassInk;
    isMixedContrast: boolean;
    luminance: number;
    sample: BackdropGridSample | null;
    sampleVersion: number;
  }>(() => ({
    ink: fallbackInk,
    isMixedContrast: false,
    luminance: theme === "light" ? 0.9 : 0.08,
    sample: null,
    sampleVersion: 0,
  }));

  const prevInkRef = useRef<GlassInk>(fallbackInk);
  const prevSampleRef = useRef<BackdropGridSample | null>(null);
  const timerRef = useRef<number | null>(null);
  const maxWaitStartRef = useRef<number | null>(null);

  const performSample = useCallback(() => {
    const el = ref.current;
    if (!enabled || !el) {
      const nextInk: GlassInk = theme === "light" ? "dark" : "light";
      prevInkRef.current = nextInk;
      prevSampleRef.current = null;
      setState((prev) =>
        prev.ink === nextInk && !prev.isMixedContrast && prev.sample === null
          ? prev
          : {
              ink: nextInk,
              isMixedContrast: false,
              luminance: theme === "light" ? 0.9 : 0.08,
              sample: null,
              sampleVersion: prev.sampleVersion + 1,
            },
      );
      return;
    }

    const result = sampleElementBackdropGrid(el);
    if (!result.valid) {
      return;
    }

    const nextInk = resolveAdaptiveInk(result.luminance, prevInkRef.current, {
      overLight,
    });
    prevInkRef.current = nextInk;
    const isMixedContrast = result.variance > 0.035;

    const prevSample = prevSampleRef.current;
    const rectMoved =
      !prevSample ||
      Math.abs(prevSample.rect.left - result.rect.left) > 2 ||
      Math.abs(prevSample.rect.top - result.rect.top) > 2 ||
      Math.abs(prevSample.rect.width - result.rect.width) > 2 ||
      Math.abs(prevSample.rect.height - result.rect.height) > 2;
    const gridChanged = hasGridChanged(prevSample?.grid, result.grid);

    setState((prev) => {
      if (
        prev.ink === nextInk &&
        prev.isMixedContrast === isMixedContrast &&
        !rectMoved &&
        !gridChanged
      ) {
        return prev;
      }
      prevSampleRef.current = result;
      return {
        ink: nextInk,
        isMixedContrast,
        luminance: result.luminance,
        sample: result,
        sampleVersion: prev.sampleVersion + 1,
      };
    });
  }, [enabled, overLight, ref, theme]);

  const scheduleDebouncedSample = useCallback(
    (delayMs: number, maxWaitMs?: number) => {
      if (typeof window === "undefined") return;
      const now = performance.now();

      if (maxWaitMs !== undefined) {
        if (maxWaitStartRef.current === null) {
          maxWaitStartRef.current = now;
        } else if (now - maxWaitStartRef.current >= maxWaitMs) {
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          maxWaitStartRef.current = now;
          performSample();
          return;
        }
      }

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        maxWaitStartRef.current = null;
        performSample();
      }, delayMs);
    },
    [performSample],
  );

  const view = useAppStore((s) => s.view);
  const surfaceStyle = useAppStore((s) => s.surfaceStyle);

  useEffect(() => {
    if (!enabled) {
      performSample();
      return;
    }
    const raf = requestAnimationFrame(() => performSample());
    // 主题切换 (180ms) 与弹窗/菜单入场缩放 (~140ms) 完成后补采稳态空间网格
    const settleTimer = window.setTimeout(() => {
      performSample();
    }, 180);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
    };
  }, [enabled, overLight, theme, view, surfaceStyle, sampleKey, performSample]);

  useEffect(() => {
    if (!enabled || !trackCanvas) return;

    const unsubCanvas = useCanvasStore.subscribe((next, prev) => {
      const viewportChanged =
        next.scale !== prev.scale ||
        next.offsetX !== prev.offsetX ||
        next.offsetY !== prev.offsetY;
      if (viewportChanged) {
        scheduleDebouncedSample(PAN_DEBOUNCE_MS, PAN_MAX_WAIT_MS);
        return;
      }

      const contentFlagChanged =
        next.showBackground !== prev.showBackground ||
        next.showGrid !== prev.showGrid ||
        next.previewTeam !== prev.previewTeam ||
        next.backgroundOpacity !== prev.backgroundOpacity ||
        next.customBackgroundUrl !== prev.customBackgroundUrl;
      if (contentFlagChanged) {
        scheduleDebouncedSample(DOC_DEBOUNCE_MS);
      }
    });

    const unsubDoc = useDocumentStore.subscribe((next, prev) => {
      if (
        next.doc.activeFrameId !== prev.doc.activeFrameId ||
        next.doc.frames !== prev.doc.frames
      ) {
        scheduleDebouncedSample(DOC_DEBOUNCE_MS);
      }
    });

    return () => {
      unsubCanvas();
      unsubDoc();
    };
  }, [enabled, trackCanvas, scheduleDebouncedSample]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => scheduleDebouncedSample(DOC_DEBOUNCE_MS))
        : null;
    ro?.observe(el);

    const onViewportChange = () => scheduleDebouncedSample(180, 400);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [enabled, ref, scheduleDebouncedSample]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!enabled) {
    return {
      ink: fallbackInk,
      isMixedContrast: false,
      luminance: theme === "light" ? 0.9 : 0.08,
      sample: null,
      sampleVersion: 0,
    };
  }

  return state;
}
