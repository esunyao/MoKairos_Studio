/**
 * 实时背景相对亮度采样与自适应黑白文字引擎
 * 支持：
 * 1. CSS 颜色解析与 Alpha 源上合成（pure functions，可完整单元测试）
 * 2. Konva <canvas> 与 DOM / <img> 混合叠层的 8×4 轻量离屏合成采样
 * 3. 带迟滞阈值的浅底黑字 / 深底白字防闪烁判决
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type GlassInk = "dark" | "light";

export interface BackdropSampleResult {
  luminance: number;
  variance: number;
  valid: boolean;
}

const SAMPLE_W = 8;
const SAMPLE_H = 4;

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = SAMPLE_W;
    scratchCanvas.height = SAMPLE_H;
    scratchCtx = scratchCanvas.getContext("2d", { willReadFrequently: true });
  }
  return scratchCtx;
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, n));
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 解析常见 CSS 颜色字符串（hex / rgb / rgba / transparent）
 */
export function parseCssColor(color: string): Rgba | null {
  const raw = color.trim().toLowerCase();
  if (!raw || raw === "transparent" || raw === "none") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
      return { r, g, b, a };
    }
    return null;
  }

  const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/);
  if (!rgbMatch) {
    return null;
  }

  // 同时兼容逗号分隔与现代空格 + "/" 分隔语法
  const body = rgbMatch[1].replace(/\//g, ",").trim();
  const parts = body.includes(",")
    ? body.split(",").map((s) => s.trim())
    : body.split(/\s+/).map((s) => s.trim());

  if (parts.length < 3) {
    return null;
  }

  const parseChannel = (token: string): number => {
    if (token.endsWith("%")) {
      return clampByte((parseFloat(token) / 100) * 255);
    }
    return clampByte(parseFloat(token));
  };

  const r = parseChannel(parts[0]);
  const g = parseChannel(parts[1]);
  const b = parseChannel(parts[2]);

  let a = 1;
  if (parts.length >= 4 && parts[3] !== undefined && parts[3] !== "") {
    a = parts[3].endsWith("%")
      ? clampUnit(parseFloat(parts[3]) / 100)
      : clampUnit(parseFloat(parts[3]));
  }

  return { r, g, b, a };
}

/**
 * Porter-Duff source-over 前景透明度叠加到背景色
 */
export function compositeRgbaOver(fg: Rgba, bg: Rgba): Rgba {
  const fa = clampUnit(fg.a);
  const ba = clampUnit(bg.a);
  const outA = fa + ba * (1 - fa);
  if (outA <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const r = (fg.r * fa + bg.r * ba * (1 - fa)) / outA;
  const g = (fg.g * fa + bg.g * ba * (1 - fa)) / outA;
  const b = (fg.b * fa + bg.b * ba * (1 - fa)) / outA;
  return { r, g, b, a: outA };
}

function linearizeChannel(byteVal: number): number {
  const s = clampUnit(byteVal / 255);
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.1 sRGB 相对亮度计算（Rec.709 权重），返回 [0, 1]
 */
export function computeRelativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * 根据背景相对亮度、迟滞区间与 overLight 深色压暗状态判定自适应文字极性
 * - dark: 浅色背景 -> 使用深黑色文字
 * - light: 深色背景 -> 使用纯白色文字
 */
export function resolveAdaptiveInk(
  luminance: number,
  prevInk: GlassInk,
  options?: {
    overLight?: boolean;
    lightThreshold?: number;
    darkThreshold?: number;
  },
): GlassInk {
  const lightThreshold = options?.lightThreshold ?? 0.52;
  const darkThreshold = options?.darkThreshold ?? 0.44;
  const effective = options?.overLight ? luminance * 0.62 : luminance;

  if (effective > lightThreshold) {
    return "dark";
  }
  if (effective < darkThreshold) {
    return "light";
  }
  return prevInk;
}

function rectIntersection(a: DOMRect, b: DOMRect) {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.right, b.right);
  const y2 = Math.min(a.bottom, b.bottom);
  if (x2 <= x1 || y2 <= y1) {
    return null;
  }
  return { x1, y1, x2, y2 };
}

function drawCanvasToScratch(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  elRect: DOMRect,
) {
  const cRect = sourceCanvas.getBoundingClientRect();
  if (cRect.width < 1 || cRect.height < 1 || sourceCanvas.width < 1 || sourceCanvas.height < 1) {
    return;
  }
  const inter = rectIntersection(elRect, cRect);
  if (!inter) return;

  const scaleX = sourceCanvas.width / cRect.width;
  const scaleY = sourceCanvas.height / cRect.height;

  const sx = Math.max(0, (inter.x1 - cRect.left) * scaleX);
  const sy = Math.max(0, (inter.y1 - cRect.top) * scaleY);
  const sw = Math.max(1, (inter.x2 - inter.x1) * scaleX);
  const sh = Math.max(1, (inter.y2 - inter.y1) * scaleY);

  const dx = ((inter.x1 - elRect.left) / elRect.width) * SAMPLE_W;
  const dy = ((inter.y1 - elRect.top) / elRect.height) * SAMPLE_H;
  const dw = ((inter.x2 - inter.x1) / elRect.width) * SAMPLE_W;
  const dh = ((inter.y2 - inter.y1) / elRect.height) * SAMPLE_H;

  try {
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  } catch {
    // 跨域或 GPU 上下文丢失时忽略该层
  }
}

function drawImageToScratch(
  ctx: CanvasRenderingContext2D,
  imgEl: HTMLImageElement,
  elRect: DOMRect,
) {
  if (!imgEl.complete || imgEl.naturalWidth < 1 || imgEl.naturalHeight < 1) {
    return;
  }
  const iRect = imgEl.getBoundingClientRect();
  if (iRect.width < 1 || iRect.height < 1) return;
  const inter = rectIntersection(elRect, iRect);
  if (!inter) return;

  const scaleX = imgEl.naturalWidth / iRect.width;
  const scaleY = imgEl.naturalHeight / iRect.height;

  const sx = Math.max(0, (inter.x1 - iRect.left) * scaleX);
  const sy = Math.max(0, (inter.y1 - iRect.top) * scaleY);
  const sw = Math.max(1, (inter.x2 - inter.x1) * scaleX);
  const sh = Math.max(1, (inter.y2 - inter.y1) * scaleY);

  const dx = ((inter.x1 - elRect.left) / elRect.width) * SAMPLE_W;
  const dy = ((inter.y1 - elRect.top) / elRect.height) * SAMPLE_H;
  const dw = ((inter.x2 - inter.x1) / elRect.width) * SAMPLE_W;
  const dh = ((inter.y2 - inter.y1) / elRect.height) * SAMPLE_H;

  try {
    ctx.drawImage(imgEl, sx, sy, sw, sh, dx, dy, dw, dh);
  } catch {
    // 忽略跨域图片 readback 异常
  }
}

function collectBehindStack(el: HTMLElement, elRect: DOMRect): Element[] {
  const probePoints: Array<[number, number]> = [
    [elRect.left + elRect.width * 0.5, elRect.top + elRect.height * 0.5],
    [elRect.left + elRect.width * 0.2, elRect.top + elRect.height * 0.5],
    [elRect.left + elRect.width * 0.8, elRect.top + elRect.height * 0.5],
    [elRect.left + elRect.width * 0.5, elRect.top + elRect.height * 0.2],
    [elRect.left + elRect.width * 0.5, elRect.top + elRect.height * 0.8],
  ];

  // 选取命中非自身层最丰富的探测结果，以主堆栈有序合成
  let bestBehind: Element[] = [];
  for (const [px, py] of probePoints) {
    if (
      px < 0 ||
      py < 0 ||
      px >= window.innerWidth ||
      py >= window.innerHeight
    ) {
      continue;
    }
    const stack = document.elementsFromPoint(px, py);
    const selfIdx = stack.findIndex((node) => node === el || el.contains(node));
    const behind =
      selfIdx >= 0
        ? stack.slice(selfIdx + 1)
        : stack.filter((node) => !el.contains(node));

    if (behind.length > bestBehind.length) {
      bestBehind = behind;
    }
    // 中心点若已触达非透明底座，优先采用中心主栈
    if (bestBehind.length >= 2) {
      break;
    }
  }
  return bestBehind;
}

/**
 * 实时采样指定 DOM 元素背后区域的相对亮度均值与方差
 */
export function sampleElementBackdropLuminance(
  el: HTMLElement,
): BackdropSampleResult {
  const ctx = getScratchContext();
  if (!ctx || typeof window === "undefined") {
    return { luminance: 0.5, variance: 0, valid: false };
  }

  const elRect = el.getBoundingClientRect();
  if (elRect.width < 2 || elRect.height < 2) {
    return { luminance: 0.5, variance: 0, valid: false };
  }

  // 1. 以当前主题根画布色铺底，避免画布边缘透明区域或未填满处失真
  const rootBgRaw =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--mk-bg-canvas")
      .trim() || getComputedStyle(document.body).backgroundColor;
  const baseRgba = parseCssColor(rootBgRaw) ?? { r: 13, g: 17, b: 23, a: 1 };

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgb(${Math.round(baseRgba.r)}, ${Math.round(baseRgba.g)}, ${Math.round(baseRgba.b)})`;
  ctx.fillRect(0, 0, SAMPLE_W, SAMPLE_H);

  // 2. 从探测栈中找到最接近的完全不透明遮挡底，截断冗余祖先
  const behind = collectBehindStack(el, elRect);
  let opaqueStopIdx = behind.length - 1;
  for (let i = 0; i < behind.length; i++) {
    const node = behind[i];
    if (
      node instanceof HTMLCanvasElement ||
      node instanceof HTMLImageElement ||
      node.classList.contains("konvajs-content")
    ) {
      opaqueStopIdx = i;
      continue;
    }
    const parsedBg = parseCssColor(getComputedStyle(node).backgroundColor);
    if (parsedBg && parsedBg.a >= 0.99) {
      opaqueStopIdx = i;
      break;
    }
  }

  // 3. 自深层向浅层（从底层背景到紧贴玻璃的遮罩层）依次绘制到 8×4 离屏画布
  const visibleLayers = behind.slice(0, opaqueStopIdx + 1).reverse();
  const drawnCanvases = new Set<HTMLCanvasElement>();

  for (const node of visibleLayers) {
    if (node instanceof HTMLCanvasElement) {
      if (!drawnCanvases.has(node)) {
        drawnCanvases.add(node);
        drawCanvasToScratch(ctx, node, elRect);
      }
      continue;
    }

    if (node.classList.contains("konvajs-content")) {
      const canvases = node.querySelectorAll("canvas");
      canvases.forEach((canvas) => {
        if (!drawnCanvases.has(canvas)) {
          drawnCanvases.add(canvas);
          drawCanvasToScratch(ctx, canvas, elRect);
        }
      });
    }

    if (node instanceof HTMLImageElement) {
      drawImageToScratch(ctx, node, elRect);
    }

    const bg = parseCssColor(getComputedStyle(node).backgroundColor);
    if (bg && bg.a > 0.01) {
      const nRect = node.getBoundingClientRect();
      const inter = rectIntersection(elRect, nRect);
      if (inter) {
        const dx = ((inter.x1 - elRect.left) / elRect.width) * SAMPLE_W;
        const dy = ((inter.y1 - elRect.top) / elRect.height) * SAMPLE_H;
        const dw = ((inter.x2 - inter.x1) / elRect.width) * SAMPLE_W;
        const dh = ((inter.y2 - inter.y1) / elRect.height) * SAMPLE_H;
        ctx.fillStyle = `rgba(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}, ${bg.a})`;
        ctx.fillRect(dx, dy, dw, dh);
      }
    }
  }

  // 4. 读取 32 个像素并计算均值与方差
  try {
    const pixels = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const count = SAMPLE_W * SAMPLE_H;
    let sum = 0;
    const lumList = new Float64Array(count);

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      const lum = computeRelativeLuminance(
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
      );
      lumList[i] = lum;
      sum += lum;
    }

    const mean = sum / count;
    let sqDiff = 0;
    for (let i = 0; i < count; i++) {
      const d = lumList[i] - mean;
      sqDiff += d * d;
    }

    return {
      luminance: mean,
      variance: sqDiff / count,
      valid: true,
    };
  } catch {
    return { luminance: 0.5, variance: 0, valid: false };
  }
}
