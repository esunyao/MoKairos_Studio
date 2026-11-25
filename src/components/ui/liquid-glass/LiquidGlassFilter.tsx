import { memo, useEffect, useId, useState } from "react";
import type { LiquidGlassMode } from "@/stores/useAppStore";
import {
  displacementMap,
  getCachedShaderDisplacementMap,
  polarDisplacementMap,
  prominentDisplacementMap,
} from "./displacementMaps";

/**
 * 液态玻璃边缘 SVG 位移折射与 RGB 三通道色散滤镜（精简 GPU 管线版）
 * - simplified=true（轻量浮层）仅使用 2 个基元（feImage + 单次 feDisplacementMap）
 * - simplified=false（浮动胶囊）使用 9 个精简基元呈现 RGB 色散，剔除冗余遮罩与二次模糊 Pass
 * - 过滤区域从 170%×170% 收紧至 108%×108%，大幅降低 GPU 纹理采样面积
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

export const LiquidGlassFilter = memo(function LiquidGlassFilter({
  id,
  displacementScale,
  aberrationIntensity,
  width,
  height,
  mode,
  simplified = false,
}: {
  id: string;
  displacementScale: number;
  aberrationIntensity: number;
  width: number;
  height: number;
  mode: LiquidGlassMode;
  simplified?: boolean;
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
  const useSinglePass = simplified || aberrationIntensity <= 0;

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
          x="-4%"
          y="-4%"
          width="108%"
          height="108%"
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

          {useSinglePass ? (
            <feDisplacementMap
              in="SourceGraphic"
              in2="DISPLACEMENT_MAP"
              scale={displacementScale * scaleSign}
              xChannelSelector="R"
              yChannelSelector="B"
            />
          ) : (
            <>
              {/* 精简 R / G / B 三通道色散管线（9 基元），利用位移图中心 #808080 零偏移保持中心锐利 */}
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
                scale={
                  displacementScale * (scaleSign - aberrationIntensity * 0.05)
                }
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
                scale={
                  displacementScale * (scaleSign - aberrationIntensity * 0.1)
                }
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
              <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" />
            </>
          )}
        </filter>
      </defs>
    </svg>
  );
});
