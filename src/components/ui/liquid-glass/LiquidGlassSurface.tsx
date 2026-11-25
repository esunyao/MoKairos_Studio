import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui/cn";
import { useAdaptiveGlassContrast } from "@/hooks/useAdaptiveGlassContrast";
import { useAppStore } from "@/stores/useAppStore";
import {
  LiquidGlassFilter,
  supportsSvgBackdropRefraction,
  useSafeGlassFilterId,
} from "./LiquidGlassFilter";
import { GlassContrastContext } from "./GlassContrastContext";

/**
 * 公共液态玻璃 / 普通质感统一表面容器
 * - 支持全应用一键切换液态玻璃与普通非液态工程质感
 * - 双层 DOM 隔离：光学层独立 overflow-hidden 承载折射与动态高光，内容层绝不裁切二级弹出菜单
 * - 零重渲染指针高光与磁性弹性驱动：200px 激活区外 0 DOM 写入，激活区内直接驱动 ref.style
 * - 停靠栏 (variant="bar") 跳过宽幅 SVG 折射以消除全屏 GPU 合成负担
 */

export interface LiquidGlassSurfaceProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  variant?: "elevated" | "bar" | "panel";
  cornerRadius?: number;
  elastic?: boolean;
  lightweight?: boolean;
  displacementScaleOverride?: number;
  sampleKey?: string | number;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  onMouseUp?: MouseEventHandler<HTMLDivElement>;
}

const ACTIVATION_ZONE_PX = 200;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function buildRimGradient(
  offsetX: number,
  offsetY: number,
  isDarkInk: boolean,
): string {
  const angle = 135 + offsetX * 1.2;
  const startStop = Math.max(10, 33 + offsetY * 0.3);
  const endStop = Math.min(90, 66 + offsetY * 0.4);
  const alpha1 = (isDarkInk ? 0.3 : 0.22) + Math.abs(offsetX) * 0.008;
  const alpha2 = (isDarkInk ? 0.68 : 0.56) + Math.abs(offsetX) * 0.012;

  return `linear-gradient(${angle.toFixed(1)}deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, ${alpha1.toFixed(3)}) ${startStop.toFixed(1)}%,
    rgba(255, 255, 255, ${alpha2.toFixed(3)}) ${endStop.toFixed(1)}%,
    rgba(255, 255, 255, 0) 100%)`;
}

export const LiquidGlassSurface = forwardRef<
  HTMLDivElement,
  LiquidGlassSurfaceProps
>(
  (
    {
      children,
      className,
      contentClassName,
      style,
      variant = "elevated",
      cornerRadius = 12,
      elastic = false,
      lightweight = false,
      displacementScaleOverride,
      sampleKey,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onMouseUp,
    },
    forwardedRef,
  ) => {
    const surfaceStyle = useAppStore((s) => s.surfaceStyle);
    const liquidGlass = useAppStore((s) => s.liquidGlass);
    const theme = useAppStore((s) => s.theme);

    const innerRef = useRef<HTMLDivElement | null>(null);
    const rimRef = useRef<HTMLSpanElement | null>(null);
    const glowRef = useRef<HTMLSpanElement | null>(null);
    const rectRef = useRef<DOMRect | null>(null);
    const wasActiveRef = useRef(false);

    const filterId = useSafeGlassFilterId();
    const supportsSvg = useMemo(() => supportsSvgBackdropRefraction(), []);

    const [size, setSize] = useState({ width: 240, height: 44 });
    const [isHovered, setIsHovered] = useState(false);

    const glowRadius = Math.round(
      clamp(Math.min(size.width, size.height) * 0.65, 72, 180),
    );
    const glowDiameter = glowRadius * 2;
    const glowRadiusRef = useRef(glowRadius);
    glowRadiusRef.current = glowRadius;

    const isLiquid = surfaceStyle === "liquid";

    const setMergedRef = (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const { ink, isMixedContrast, sample, sampleVersion } =
      useAdaptiveGlassContrast(innerRef, {
        enabled: isLiquid && liquidGlass.adaptiveContrast,
        overLight: liquidGlass.overLight,
        theme,
        trackCanvas: variant !== "bar",
        sampleKey,
      });

    const isDarkInk = ink === "dark";
    const contrastCtxValue = useMemo(
      () => ({
        sample,
        sampleVersion,
        enabled: isLiquid && liquidGlass.adaptiveContrast,
        overLight: liquidGlass.overLight,
        fallbackInk: (theme === "light" ? "dark" : "light") as "dark" | "light",
      }),
      [
        sample,
        sampleVersion,
        isLiquid,
        liquidGlass.adaptiveContrast,
        liquidGlass.overLight,
        theme,
      ],
    );

    // 实时追踪容器真实宽高与缓存包围盒（避免在 pointermove 中频繁 getBoundingClientRect）
    useEffect(() => {
      const el = innerRef.current;
      if (!el || !isLiquid) {
        rectRef.current = null;
        return;
      }

      const refreshGeometry = () => {
        const rect = el.getBoundingClientRect();
        rectRef.current = rect;
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        setSize((prev) =>
          Math.abs(prev.width - w) < 2 && Math.abs(prev.height - h) < 2
            ? prev
            : { width: w, height: h },
        );
      };

      refreshGeometry();
      const ro =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(refreshGeometry)
          : null;
      ro?.observe(el);

      const refreshRectOnly = () => {
        if (innerRef.current) {
          rectRef.current = innerRef.current.getBoundingClientRect();
        }
      };
      window.addEventListener("resize", refreshRectOnly);
      window.addEventListener("scroll", refreshRectOnly, true);

      return () => {
        ro?.disconnect();
        window.removeEventListener("resize", refreshRectOnly);
        window.removeEventListener("scroll", refreshRectOnly, true);
      };
    }, [isLiquid]);

    // 零 React setState 指针监听：仅直接驱动 rimRef.style.background 与 innerRef.style.transform
    useEffect(() => {
      if (!isLiquid || typeof window === "undefined") {
        if (innerRef.current) innerRef.current.style.transform = "";
        wasActiveRef.current = false;
        return;
      }

      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const enableElastic =
        elastic && liquidGlass.elasticity > 0 && !reducedMotion;

      if (!enableElastic && !isHovered) {
        if (innerRef.current) innerRef.current.style.transform = "";
        if (rimRef.current) {
          rimRef.current.style.background = buildRimGradient(0, 0, isDarkInk);
        }
        wasActiveRef.current = false;
        return;
      }

      let rafPending = false;
      let latestX = 0;
      let latestY = 0;

      const flushPointer = () => {
        rafPending = false;
        const el = innerRef.current;
        const rect = rectRef.current ?? el?.getBoundingClientRect() ?? null;
        if (!el || !rect || rect.width < 1 || rect.height < 1) return;
        rectRef.current = rect;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = latestX - cx;
        const dy = latestY - cy;

        const edgeDistX = Math.max(0, Math.abs(dx) - rect.width / 2);
        const edgeDistY = Math.max(0, Math.abs(dy) - rect.height / 2);
        const edgeDist = Math.hypot(edgeDistX, edgeDistY);

        if (!isHovered && edgeDist > ACTIVATION_ZONE_PX) {
          if (wasActiveRef.current) {
            wasActiveRef.current = false;
            el.style.transform = "";
            if (rimRef.current) {
              rimRef.current.style.background = buildRimGradient(
                0,
                0,
                isDarkInk,
              );
            }
          }
          return;
        }

        wasActiveRef.current = true;
        const nextOffsetX = clamp((dx / rect.width) * 100, -50, 50);
        const nextOffsetY = clamp((dy / rect.height) * 100, -50, 50);

        if (rimRef.current) {
          rimRef.current.style.background = buildRimGradient(
            nextOffsetX,
            nextOffsetY,
            isDarkInk,
          );
        }

        if (isHovered && glowRef.current) {
          const r = glowRadiusRef.current;
          const gx = latestX - rect.left - r;
          const gy = latestY - rect.top - r;
          glowRef.current.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
        }

        if (!enableElastic) {
          return;
        }

        const fadeIn = 1 - edgeDist / ACTIVATION_ZONE_PX;
        const centerDist = Math.hypot(dx, dy);
        if (centerDist < 0.5) {
          el.style.transform = "";
          return;
        }

        const nx = dx / centerDist;
        const ny = dy / centerDist;
        const eFactor = liquidGlass.elasticity;
        const stretch = Math.min(centerDist / 300, 1) * eFactor * fadeIn;

        const scaleX = clamp(
          1 + Math.abs(nx) * stretch * 0.24 - Math.abs(ny) * stretch * 0.12,
          0.94,
          1.06,
        );
        const scaleY = clamp(
          1 + Math.abs(ny) * stretch * 0.24 - Math.abs(nx) * stretch * 0.12,
          0.94,
          1.06,
        );
        const tx = clamp(dx * eFactor * 0.05 * fadeIn, -8, 8);
        const ty = clamp(dy * eFactor * 0.05 * fadeIn, -8, 8);

        el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scaleX(${scaleX.toFixed(3)}) scaleY(${scaleY.toFixed(3)})`;
      };

      const onPointerMove = (e: PointerEvent) => {
        latestX = e.clientX;
        latestY = e.clientY;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(flushPointer);
        }
      };

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      return () => {
        window.removeEventListener("pointermove", onPointerMove);
      };
    }, [isLiquid, elastic, liquidGlass.elasticity, isHovered, isDarkInk]);

    // ----------------------------------------------------------------------
    // 模式 A：普通非液态工程质感
    // ----------------------------------------------------------------------
    if (!isLiquid) {
      const stdClass =
        variant === "bar" ? "mk-surface-standard-bar" : "mk-surface-standard";

      return (
        <div
          ref={setMergedRef}
          className={cn("mk-theme-transition relative", stdClass, className)}
          style={{
            borderRadius: `${cornerRadius}px`,
            ...style,
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
        >
          <div className={cn("relative z-10", contentClassName)}>
            {children}
          </div>
        </div>
      );
    }

    // ----------------------------------------------------------------------
    // 模式 B：真实光学液态玻璃（参考 liquid-glass-react，精简 GPU 管线版）
    // ----------------------------------------------------------------------
    const baseDisplacement =
      displacementScaleOverride ??
      (lightweight
        ? Math.min(32, liquidGlass.displacementScale * 0.45)
        : liquidGlass.displacementScale);
    const displacementScale = liquidGlass.overLight
      ? baseDisplacement * 0.5
      : baseDisplacement;

    // 停靠顶栏 (variant="bar") 仅使用硬件加速 backdrop-filter，不挂载宽幅 SVG 折射滤镜
    const useSvgRefraction =
      supportsSvg && variant !== "bar" && displacementScale > 0;

    const blurPx =
      (liquidGlass.overLight ? 12 : 4) + liquidGlass.blurAmount * 32;
    const baseBackdrop = `blur(${blurPx.toFixed(1)}px) saturate(${liquidGlass.saturation}%)`;
    const backdropFilterValue = useSvgRefraction
      ? `url(#${filterId}) ${baseBackdrop}`
      : baseBackdrop;

    const outerShadow =
      variant === "bar"
        ? "0 4px 20px rgba(0, 0, 0, 0.14)"
        : liquidGlass.overLight
          ? "0 16px 48px rgba(0, 0, 0, 0.42)"
          : isDarkInk
            ? "0 12px 34px rgba(15, 23, 42, 0.14)"
            : "0 14px 40px rgba(0, 0, 0, 0.32)";

    const hairlineBorderShadow =
      "inset 0 0 0 1px rgba(255, 255, 255, 0.34), 0 0 0 1px rgba(15, 23, 42, 0.14)";

    const defaultRimBg = buildRimGradient(0, 0, isDarkInk);

    return (
      <div
        ref={setMergedRef}
        data-surface="liquid"
        data-glass-ink={ink}
        data-glass-mixed={isMixedContrast ? "true" : "false"}
        className={cn("mk-theme-transition relative", className)}
        style={{
          borderRadius: `${cornerRadius}px`,
          boxShadow: outerShadow,
          transition: elastic
            ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms ease, box-shadow 180ms ease"
            : "color 160ms ease, box-shadow 180ms ease",
          ...style,
        }}
        onMouseEnter={(e) => {
          if (innerRef.current) {
            const rect = innerRef.current.getBoundingClientRect();
            rectRef.current = rect;
            if (glowRef.current) {
              const r = glowRadiusRef.current;
              const gx = e.clientX - rect.left - r;
              const gy = e.clientY - rect.top - r;
              glowRef.current.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
            }
            if (rimRef.current && rect.width > 0 && rect.height > 0) {
              const dx = e.clientX - (rect.left + rect.width / 2);
              const dy = e.clientY - (rect.top + rect.height / 2);
              rimRef.current.style.background = buildRimGradient(
                clamp((dx / rect.width) * 100, -50, 50),
                clamp((dy / rect.height) * 100, -50, 50),
                isDarkInk,
              );
            }
          }
          setIsHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          onMouseLeave?.(e);
        }}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        {/* 光学背景层：独立 overflow-hidden 裁切折射滤镜与单层高光边缘，绝不裁切内容区菜单 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: `${cornerRadius}px` }}
        >
          {useSvgRefraction && size.width > 0 && size.height > 0 && (
            <LiquidGlassFilter
              id={filterId}
              displacementScale={displacementScale}
              aberrationIntensity={liquidGlass.aberrationIntensity}
              width={size.width}
              height={size.height}
              mode={liquidGlass.mode}
              simplified={lightweight}
            />
          )}

          {/* 边缘弯曲折射 + 背景模糊 + 色彩饱和度增强 */}
          <span
            className="mk-liquid-warp absolute inset-0 block"
            style={{
              backdropFilter: backdropFilterValue,
              WebkitBackdropFilter: backdropFilterValue,
              borderRadius: `${cornerRadius}px`,
            }}
          />

          {/* 不参与折射的表面微着色层 + 细描边 */}
          <span
            className="absolute inset-0 block"
            style={{
              backgroundColor: liquidGlass.overLight
                ? "rgba(0, 0, 0, 0.24)"
                : isDarkInk
                  ? "rgba(255, 255, 255, 0.26)"
                  : "rgba(255, 255, 255, 0.08)",
              boxShadow: hairlineBorderShadow,
              borderRadius: `${cornerRadius}px`,
            }}
          />

          {/* OverLight 压暗混合层（仅在开启 Tint Dark 时生效） */}
          {liquidGlass.overLight && (
            <span
              className="absolute inset-0 block bg-black/25 mix-blend-overlay"
              style={{ borderRadius: `${cornerRadius}px` }}
            />
          )}

          {/* 单层动态镜面高光环边（降低 GPU mix-blend 叠加重绘） */}
          <span
            ref={rimRef}
            className="pointer-events-none absolute inset-0 block"
            style={{
              padding: "1.5px",
              WebkitMask:
                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
              borderRadius: `${cornerRadius}px`,
              mixBlendMode: isDarkInk ? "overlay" : "screen",
              opacity: isDarkInk ? 0.72 : 0.45,
              background: defaultRimBg,
            }}
          />

          {/* 悬停表面微高光（预光栅化圆斑 GPU 平移跟随鼠标指针，零重绘） */}
          <span
            ref={glowRef}
            data-glass-glow="true"
            className="pointer-events-none absolute top-0 left-0 block rounded-full transition-opacity duration-200 ease-out"
            style={{
              width: `${glowDiameter}px`,
              height: `${glowDiameter}px`,
              opacity: isHovered ? 1 : 0,
              backgroundImage: isDarkInk
                ? "radial-gradient(circle, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.14) 38%, rgba(255, 255, 255, 0) 70%)"
                : "radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.08) 38%, rgba(255, 255, 255, 0) 70%)",
              mixBlendMode: isDarkInk ? "screen" : "overlay",
              willChange: "transform, opacity",
            }}
          />
        </div>

        {/* 前景内容层：不设 overflow-hidden，确保二级菜单与气泡完整溢出展示 */}
        <GlassContrastContext.Provider value={contrastCtxValue}>
          <div
            className={cn(
              "mk-theme-transition relative z-10",
              contentClassName,
            )}
          >
            {children}
          </div>
        </GlassContrastContext.Provider>
      </div>
    );
  },
);

LiquidGlassSurface.displayName = "LiquidGlassSurface";
