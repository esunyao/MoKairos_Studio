import { describe, expect, it } from "vitest";
import {
  compositeRgbaOver,
  computeRelativeLuminance,
  parseCssColor,
  resolveAdaptiveInk,
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

    // 50% 透明白叠加纯黑 -> 亮度约 0.214，低于 0.44 保持白字
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

  it("具备 0.44~0.52 迟滞防抖阈值并支持 overLight 深色衰减", () => {
    // 浅底 -> 黑字
    expect(resolveAdaptiveInk(0.85, "light")).toBe("dark");
    // 深底 -> 白字
    expect(resolveAdaptiveInk(0.12, "dark")).toBe("light");

    // 处于 0.44~0.52 迟滞区时维持当前极性，避免临界闪烁
    expect(resolveAdaptiveInk(0.48, "dark")).toBe("dark");
    expect(resolveAdaptiveInk(0.48, "light")).toBe("light");

    // 开启 overLight（玻璃压暗）后，中等亮背景 0.65 * 0.62 = 0.403 < 0.44 -> 使用白色字
    expect(resolveAdaptiveInk(0.65, "dark", { overLight: true })).toBe("light");
    // 未开启 overLight 时，0.65 > 0.52 -> 使用黑色字
    expect(resolveAdaptiveInk(0.65, "light", { overLight: false })).toBe("dark");
  });
});
