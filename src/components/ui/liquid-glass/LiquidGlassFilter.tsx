import { useEffect, useId, useState } from "react";
import type { LiquidGlassMode } from "@/stores/useAppStore";
import {
  displacementMap,
  getCachedShaderDisplacementMap,
  polarDisplacementMap,
  prominentDisplacementMap,
} from "./displacementMaps";

/**
 * 液态玻璃边缘 SVG 位移折射与 RGB 三通道色散滤镜
 * 依据 MIT 协议适配自 liquid-glass-react (Copyright 2025 Max Rovensky)
 */

function resolveDisplacementHref(
  mode: LiquidGlassMode,
  shaderMapUrl: string,
): string {
  switch (mode) {
    case "standard":
      return displacementMap;
    case "polar":
      return polarDisplacementMap;
    case "prominent":
      return prominentDisplacementMap;
    case "shader":
      return shaderMapUrl || displacementMap;
  }
}

export function supportsSvgBackdropRefraction(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  if (/Firefox/i.test(ua)) {
    return false;
  }
  return /Chrome|Chromium|Edg/i.test(ua);
}

export function useSafeGlassFilterId(): string {
  const raw = useId();
  return `mk-lg-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function LiquidGlassFilter({
  id,
  displacementScale,
  aberrationIntensity,
  width,
  height,
  mode,
}: {
  id: string;
  displacementScale: number;
  aberrationIntensity: number;
  width: number;
  height: number;
  mode: LiquidGlassMode;
}) {
  const [shaderMapUrl, setShaderMapUrl] = useState("");

  useEffect(() => {
    if (mode !== "shader" || width < 4 || height < 4) {
      return;
    }
    setShaderMapUrl(getCachedShaderDisplacementMap(width, height));
  }, [mode, width, height]);

  const href = resolveDisplacementHref(mode, shaderMapUrl);
  const scaleSign = mode === "shader" ? 1 : -1;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: Math.max(1, width),
        height: Math.max(1, height),
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <defs>
        <filter
          id={id}
          x="-35%"
          y="-35%"
          width="170%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            x="0"
            y="0"
            width="100%"
            height="100%"
            result="DISPLACEMENT_MAP"
            href={href}
            preserveAspectRatio="xMidYMid slice"
          />

          {/* 利用位移图生成边缘遮罩，保持中心区域文字与图形锐利 */}
          <feColorMatrix
            in="DISPLACEMENT_MAP"
            type="matrix"
            values="0.3 0.3 0.3 0 0
                    0.3 0.3 0.3 0 0
                    0.3 0.3 0.3 0 0
                    0 0 0 1 0"
            result="EDGE_INTENSITY"
          />
          <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
            <feFuncA
              type="discrete"
              tableValues={`0 ${aberrationIntensity * 0.05} 1`}
            />
          </feComponentTransfer>

          <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />

          {/* R / G / B 三通道渐进式边缘位移形成色散 */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={displacementScale * scaleSign}
            xChannelSelector="R"
            yChannelSelector="B"
            result="RED_DISPLACED"
          />
          <feColorMatrix
            in="RED_DISPLACED"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="RED_CHANNEL"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={displacementScale * (scaleSign - aberrationIntensity * 0.05)}
            xChannelSelector="R"
            yChannelSelector="B"
            result="GREEN_DISPLACED"
          />
          <feColorMatrix
            in="GREEN_DISPLACED"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="GREEN_CHANNEL"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={displacementScale * (scaleSign - aberrationIntensity * 0.1)}
            xChannelSelector="R"
            yChannelSelector="B"
            result="BLUE_DISPLACED"
          />
          <feColorMatrix
            in="BLUE_DISPLACED"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="BLUE_CHANNEL"
          />

          <feBlend
            in="GREEN_CHANNEL"
            in2="BLUE_CHANNEL"
            mode="screen"
            result="GB_COMBINED"
          />
          <feBlend
            in="RED_CHANNEL"
            in2="GB_COMBINED"
            mode="screen"
            result="RGB_COMBINED"
          />

          <feGaussianBlur
            in="RGB_COMBINED"
            stdDeviation={Math.max(0.1, 0.5 - aberrationIntensity * 0.1)}
            result="ABERRATED_BLURRED"
          />
          <feComposite
            in="ABERRATED_BLURRED"
            in2="EDGE_MASK"
            operator="in"
            result="EDGE_ABERRATION"
          />

          <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feComposite
            in="CENTER_ORIGINAL"
            in2="INVERTED_MASK"
            operator="in"
            result="CENTER_CLEAN"
          />
          <feComposite
            in="EDGE_ABERRATION"
            in2="CENTER_CLEAN"
            operator="over"
          />
        </filter>
      </defs>
    </svg>
  );
}
