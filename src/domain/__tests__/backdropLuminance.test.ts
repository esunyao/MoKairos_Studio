import { describe, expect, it } from "vitest";
import {
  compositeRgbaOver,
  computeRelativeLuminance,
  parseCssColor,
  resolveAdaptiveInk,
  sampleSubRectFromGrid,
  type BackdropGridSample,
} from "@/services/backdropLuminance";

describe("backdropLuminance", () => {
  it("正确解析 hex / rgb / rgba / transparent 颜色", () => {
    expect(parseCssColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#0d1117")).toEqual({ r: 13, g: 17, b: 23, a: 1 });
    expect(parseCssColor("#0af")).toEqual({ r: 0, g: 170, b: 255, a: 1 });
    expect(parseCssColor("rgb(244, 246, 249)")).toEqual({
      r: 244,
      g: 246,
      b: 249,
      a: 1,
    });
    expect(parseCssColor("rgba(0, 0, 0, 0.52)")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0.52,
    });
    expect(parseCssColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("按 Porter-Duff 正确叠加半透明遮罩并计算相对亮度", () => {
    const whiteLum = computeRelativeLuminance(255, 255, 255);
    const blackLum = computeRelativeLuminance(0, 0, 0);
    expect(whiteLum).toBeCloseTo(1, 4);
    expect(blackLum).toBeCloseTo(0, 4);

    // 浅色主题底色 #f4f6f9
    expect(computeRelativeLuminance(244, 246, 249)).toBeGreaterThan(0.9);
    // 暗色主题底色 #0d1117
    expect(computeRelativeLuminance(13, 17, 23)).toBeLessThan(0.05);

    // 50% 透明白叠加纯黑 -> 亮度约 0.214，低于 0.24 保持白字
    const halfWhiteOverBlack = compositeRgbaOver(
      { r: 255, g: 255, b: 255, a: 0.5 },
      { r: 0, g: 0, b: 0, a: 1 },
    );
    const lum = computeRelativeLuminance(
      halfWhiteOverBlack.r,
      halfWhiteOverBlack.g,
      halfWhiteOverBlack.b,
    );
    expect(lum).toBeCloseTo(0.214, 2);
  });

  it("遵循校准后 WCAG 线性化阈值（0.24~0.31）与 overLight 衰减", () => {
    // RM 暗灰竞技场底图 #707478 (L ≈ 0.17) -> 白字
    const arenaLum = computeRelativeLuminance(0x70, 0x74, 0x78);
    expect(arenaLum).toBeLessThan(0.24);
    expect(resolveAdaptiveInk(arenaLum, "dark")).toBe("light");

    // 浅中灰工作区 #a8aeb8 / 浅底 #e4e8ee -> 黑字
    const midLightLum = computeRelativeLuminance(0xa8, 0xae, 0xb8);
    expect(midLightLum).toBeGreaterThan(0.31);
    expect(resolveAdaptiveInk(midLightLum, "light")).toBe("dark");
    expect(resolveAdaptiveInk(0.85, "light")).toBe("dark");

    // 处于 0.24~0.31 迟滞区时维持当前极性
    expect(resolveAdaptiveInk(0.27, "dark")).toBe("dark");
    expect(resolveAdaptiveInk(0.27, "light")).toBe("light");

    // 开启 overLight 后，中等亮背景 0.38 * 0.58 = 0.22 < 0.24 -> 白字
    expect(resolveAdaptiveInk(0.38, "dark", { overLight: true })).toBe("light");
    expect(resolveAdaptiveInk(0.38, "light", { overLight: false })).toBe(
      "dark",
    );
  });

  it("支持纵向与横向明暗跨界网格的逐区域独立黑白字判决", () => {
    // 模拟 200×240 右键菜单：上方 25% 位于浅色留白 (L=0.80)，下方 75% 位于深色画布 (L=0.16)
    const verticalGrid = new Float32Array(16 * 16);
    for (let y = 0; y < 16; y++) {
      const lum = y < 4 ? 0.8 : 0.16;
      for (let x = 0; x < 16; x++) {
        verticalGrid[y * 16 + x] = lum;
      }
    }
    const menuSample: BackdropGridSample = {
      luminance: 0.32,
      variance: 0.08,
      valid: true,
      gridWidth: 16,
      gridHeight: 16,
      grid: verticalGrid,
      rect: { left: 100, top: 100, width: 200, height: 240 },
    };

    const topRow = sampleSubRectFromGrid(menuSample, {
      left: 108,
      top: 106,
      width: 184,
      height: 30,
    });
    const bottomRow = sampleSubRectFromGrid(menuSample, {
      left: 108,
      top: 260,
      width: 184,
      height: 30,
    });

    expect(resolveAdaptiveInk(topRow.luminance, "light")).toBe("dark");
    expect(resolveAdaptiveInk(bottomRow.luminance, "dark")).toBe("light");

    // 模拟 320×36 底部胶囊横跨浅/深边界：左半亮区 (0.85)，右半暗区 (0.10)
    const horizontalGrid = new Float32Array(16 * 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        horizontalGrid[y * 16 + x] = x < 8 ? 0.85 : 0.1;
      }
    }
    const pillSample: BackdropGridSample = {
      luminance: 0.475,
      variance: 0.14,
      valid: true,
      gridWidth: 16,
      gridHeight: 16,
      grid: horizontalGrid,
      rect: { left: 400, top: 800, width: 320, height: 36 },
    };

    const leftSlot = sampleSubRectFromGrid(pillSample, {
      left: 410,
      top: 804,
      width: 80,
      height: 28,
    });
    const rightSlot = sampleSubRectFromGrid(pillSample, {
      left: 600,
      top: 804,
      width: 100,
      height: 28,
    });

    expect(resolveAdaptiveInk(leftSlot.luminance, "light")).toBe("dark");
    expect(resolveAdaptiveInk(rightSlot.luminance, "dark")).toBe("light");
  });
});
