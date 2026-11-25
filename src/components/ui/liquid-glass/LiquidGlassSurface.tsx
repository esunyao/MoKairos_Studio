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

/**
 * 公共液态玻璃 / 普通质感统一表面容器
 * - 支持全应用一键切换液态玻璃与普通非液态工程质感
 * - 双层 DOM 隔离：光学层独立 overflow-hidden 承载折射与动态高光，内容层绝不裁切二级弹出菜单
 * - 自动绑定 ResizeObserver 与背景相对亮度采样（浅底黑字 / 深底白字）
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
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  onMouseUp?: MouseEventHandler<HTMLDivElement>;
}

const ACTIVATION_ZONE_PX = 200;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export const LiquidGlassSurface = forwardRef<HTMLDivElement, LiquidGlassSurfaceProps>(
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
    const filterId = useSafeGlassFilterId();
    const supportsSvg = useMemo(() => supportsSvgBackdropRefraction(), []);

    const [size, setSize] = useState({ width: 240, height: 44 });
    const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
    const [elasticTransform, setElasticTransform] = useState<string | undefined>(undefined);
    const [isHovered, setIsHovered] = useState(false);

    const isLiquid = surfaceStyle === "liquid";

    const setMergedRef = (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const { ink, isMixedContrast } = useAdaptiveGlassContrast(innerRef, {
      enabled: isLiquid && liquidGlass.adaptiveContrast,
      overLight: liquidGlass.overLight,
      theme,
    });

    // 实时追踪容器真实宽高，保证 SVG 位移贴图与 Shader 比例对齐
    useEffect(() => {
      const el = innerRef.current;
      if (!el || !isLiquid) return;

      const update = () => {
        const rect = el.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        setSize((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h },
        );
      };

      update();
      if (typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }, [isLiquid]);

    // 高光边框方向随指针移动 & 可选磁性弹性形变
    useEffect(() => {
      if (!isLiquid || typeof window === "undefined") {
        setElasticTransform(undefined);
        return;
      }

      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const enableElastic =
        elastic && liquidGlass.elasticity > 0 && !reducedMotion;

      if (!enableElastic && !isHovered) {
        return;
      }

      let rafPending = false;
      let latestX = 0;
      let latestY = 0;

      const flushPointer = () => {
        rafPending = false;
        const el = innerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = latestX - cx;
        const dy = latestY - cy;

        const nextOffsetX = clamp((dx / rect.width) * 100, -50, 50);
        const nextOffsetY = clamp((dy / rect.height) * 100, -50, 50);
        setMouseOffset((prev) =>
          Math.abs(prev.x - nextOffsetX) < 1 && Math.abs(prev.y - nextOffsetY) < 1
            ? prev
            : { x: nextOffsetX, y: nextOffsetY },
        );

        if (!enableElastic) {
          setElasticTransform(undefined);
          return;
        }

        const edgeDistX = Math.max(0, Math.abs(dx) - rect.width / 2);
        const edgeDistY = Math.max(0, Math.abs(dy) - rect.height / 2);
        const edgeDist = Math.hypot(edgeDistX, edgeDistY);

        if (edgeDist > ACTIVATION_ZONE_PX) {
          setElasticTransform(undefined);
          return;
        }

        const fadeIn = 1 - edgeDist / ACTIVATION_ZONE_PX;
        const centerDist = Math.hypot(dx, dy);
        if (centerDist < 0.5) {
          setElasticTransform(undefined);
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

        setElasticTransform(
          `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scaleX(${scaleX.toFixed(3)}) scaleY(${scaleY.toFixed(3)})`,
        );
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
    }, [isLiquid, elastic, liquidGlass.elasticity, isHovered]);

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
    // 模式 B：真实光学液态玻璃（参考 liquid-glass-react）
    // ----------------------------------------------------------------------
    const baseDisplacement =
      displacementScaleOverride ??
      (lightweight
        ? Math.min(32, liquidGlass.displacementScale * 0.45)
        : liquidGlass.displacementScale);
    const displacementScale = liquidGlass.overLight
      ? baseDisplacement * 0.5
      : baseDisplacement;

    const blurPx =
      (liquidGlass.overLight ? 12 : 4) + liquidGlass.blurAmount * 32;
    const backdropFilterValue = `blur(${blurPx.toFixed(1)}px) saturate(${liquidGlass.saturation}%)`;
    const angle = 135 + mouseOffset.x * 1.2;

    const outerShadow =
      variant === "bar"
        ? "0 4px 20px rgba(0, 0, 0, 0.14)"
        : liquidGlass.overLight
          ? "0 16px 48px rgba(0, 0, 0, 0.42)"
          : ink === "dark"
            ? "0 12px 34px rgba(15, 23, 42, 0.14)"
            : "0 14px 40px rgba(0, 0, 0, 0.32)";

    const hairlineBorderShadow =
      ink === "dark" && !liquidGlass.overLight
        ? "inset 0 0 0 1px rgba(15, 23, 42, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.9)"
        : "inset 0 0 0 1px rgba(255, 255, 255, 0.16), inset 0 1px 1px rgba(255, 255, 255, 0.28)";

    const ringMaskStyle: CSSProperties = {
      padding: "1.5px",
      WebkitMask:
        "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
      WebkitMaskComposite: "xor",
      maskComposite: "exclude",
    };

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
          transform: elasticTransform,
          transition: elastic
            ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms ease, box-shadow 180ms ease"
            : "color 160ms ease, box-shadow 180ms ease",
          ...style,
        }}
        onMouseEnter={(e) => {
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
        {/* 光学背景层：独立 overflow-hidden 裁切折射滤镜与双高光边缘，绝不裁切内容区菜单 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: `${cornerRadius}px` }}
        >
          {supportsSvg && size.width > 0 && size.height > 0 && (
            <LiquidGlassFilter
              id={filterId}
              displacementScale={displacementScale}
              aberrationIntensity={liquidGlass.aberrationIntensity}
              width={size.width}
              height={size.height}
              mode={liquidGlass.mode}
            />
          )}

          {/* 边缘弯曲折射 + 背景模糊 + 色彩饱和度增强 */}
          <span
            className="mk-liquid-warp absolute inset-0 block"
            style={{
              filter: supportsSvg ? `url(#${filterId})` : undefined,
              backdropFilter: backdropFilterValue,
              WebkitBackdropFilter: backdropFilterValue,
              backgroundColor: liquidGlass.overLight
                ? "rgba(0, 0, 0, 0.24)"
                : ink === "dark"
                  ? "rgba(255, 255, 255, 0.2)"
                  : "rgba(255, 255, 255, 0.04)",
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

          {/* 双层动态镜面高光环边（screen + overlay） */}
          <span
            className="pointer-events-none absolute inset-0 block"
            style={{
              ...ringMaskStyle,
              borderRadius: `${cornerRadius}px`,
              mixBlendMode: "screen",
              opacity: ink === "dark" ? 0.5 : 0.28,
              background: `linear-gradient(${angle}deg,
                rgba(255, 255, 255, 0) 0%,
                rgba(255, 255, 255, ${0.14 + Math.abs(mouseOffset.x) * 0.008}) ${Math.max(10, 33 + mouseOffset.y * 0.3)}%,
                rgba(255, 255, 255, ${0.44 + Math.abs(mouseOffset.x) * 0.012}) ${Math.min(90, 66 + mouseOffset.y * 0.4)}%,
                rgba(255, 255, 255, 0) 100%)`,
            }}
          />
          <span
            className="pointer-events-none absolute inset-0 block"
            style={{
              ...ringMaskStyle,
              borderRadius: `${cornerRadius}px`,
              mixBlendMode: "overlay",
              opacity: ink === "dark" ? 0.55 : 0.42,
              background: `linear-gradient(${angle}deg,
                rgba(255, 255, 255, 0) 0%,
                rgba(255, 255, 255, ${0.32 + Math.abs(mouseOffset.x) * 0.008}) ${Math.max(10, 33 + mouseOffset.y * 0.3)}%,
                rgba(255, 255, 255, ${0.65 + Math.abs(mouseOffset.x) * 0.012}) ${Math.min(90, 66 + mouseOffset.y * 0.4)}%,
                rgba(255, 255, 255, 0) 100%)`,
            }}
          />

          {/* 悬停表面微高光 */}
          {isHovered && (
            <span
              className="pointer-events-none absolute inset-0 block"
              style={{
                borderRadius: `${cornerRadius}px`,
                backgroundImage:
                  "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0) 65%)",
                mixBlendMode: "overlay",
              }}
            />
          )}
        </div>

        {/* 前景内容层：不设 overflow-hidden，确保二级菜单与气泡完整溢出展示 */}
        <div
          className={cn("mk-theme-transition relative z-10", contentClassName)}
        >
          {children}
        </div>
      </div>
    );
  },
);

LiquidGlassSurface.displayName = "LiquidGlassSurface";
