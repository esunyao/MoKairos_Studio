/**
 * 实时背景相对亮度采样与空间网格自适应黑白文字引擎
 * 支持：
 * 1. CSS 颜色解析与 Alpha 源上合成（pure functions，可完整单元测试）
 * 2. 16×16 空间亮度网格采样（Konva <canvas> + DOM / <img> 混合叠层），并支持子控件 O(cells) 零 GPU 开销局部取样
 * 3. 纯 CSS 均一背景零 GPU readback 快速通道
 * 4. 校准后的 WCAG 2.1 线性化亮度迟滞阈值（0.24 ~ 0.31）
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

export interface BackdropGridSample extends BackdropSampleResult {
  gridWidth: number;
  gridHeight: number;
  grid: Float32Array;
  rect: { left: number; top: number; width: number; height: number };
}

export const GRID_W = 16;
export const GRID_H = 16;

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
    scratchCanvas.width = GRID_W;
    scratchCanvas.height = GRID_H;
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
export function computeRelativeLuminance(
  r: number,
  g: number,
  b: number,
): number {
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * 根据 WCAG 线性化相对亮度、迟滞区间与 overLight 深色压暗状态判定自适应文字极性
 * - dark: 浅/中亮背景 -> 使用深黑色文字
 * - light: 深/中暗背景 -> 使用纯白色文字
 * （WCAG 线性黑白分界约 0.179；0.24~0.31 可让暗灰比赛场 #707478 保持白字、#989898+ 切黑字）
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
  const lightThreshold = options?.lightThreshold ?? 0.31;
  const darkThreshold = options?.darkThreshold ?? 0.24;
  const effective = options?.overLight ? luminance * 0.58 : luminance;

  if (effective > lightThreshold) {
    return "dark";
  }
  if (effective < darkThreshold) {
    return "light";
  }
  return prevInk;
}

/**
 * 从已采样的空间亮度网格中零开销提取任意子区域的相对亮度均值与方差
 */
export function sampleSubRectFromGrid(
  sample: BackdropGridSample,
  childRect: { left: number; top: number; width: number; height: number },
): BackdropSampleResult {
  if (
    !sample.valid ||
    sample.rect.width < 1 ||
    sample.rect.height < 1 ||
    childRect.width < 1 ||
    childRect.height < 1
  ) {
    return {
      luminance: sample.luminance,
      variance: sample.variance,
      valid: false,
    };
  }

  const gw = sample.gridWidth;
  const gh = sample.gridHeight;
  const relLeft = (childRect.left - sample.rect.left) / sample.rect.width;
  const relTop = (childRect.top - sample.rect.top) / sample.rect.height;
  const relRight =
    (childRect.left + childRect.width - sample.rect.left) / sample.rect.width;
  const relBottom =
    (childRect.top + childRect.height - sample.rect.top) / sample.rect.height;

  const x1 = Math.max(0, Math.min(gw - 1, Math.floor(relLeft * gw)));
  const y1 = Math.max(0, Math.min(gh - 1, Math.floor(relTop * gh)));
  const x2 = Math.max(x1, Math.min(gw - 1, Math.ceil(relRight * gw) - 1));
  const y2 = Math.max(y1, Math.min(gh - 1, Math.ceil(relBottom * gh) - 1));

  let sum = 0;
  let sqSum = 0;
  let count = 0;

  for (let y = y1; y <= y2; y++) {
    const rowOffset = y * gw;
    for (let x = x1; x <= x2; x++) {
      const val = sample.grid[rowOffset + x] ?? sample.luminance;
      sum += val;
      sqSum += val * val;
      count++;
    }
  }

  if (count === 0) {
    return {
      luminance: sample.luminance,
      variance: sample.variance,
      valid: false,
    };
  }

  const mean = sum / count;
  const variance = Math.max(0, sqSum / count - mean * mean);
  return {
    luminance: mean,
    variance,
    valid: true,
  };
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

function rectCoversAll(outer: DOMRect, inner: DOMRect): boolean {
  return (
    outer.left <= inner.left + 1 &&
    outer.top <= inner.top + 1 &&
    outer.right >= inner.right - 1 &&
    outer.bottom >= inner.bottom - 1
  );
}

function drawCanvasToScratch(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  elRect: DOMRect,
) {
  const cRect = sourceCanvas.getBoundingClientRect();
  if (
    cRect.width < 1 ||
    cRect.height < 1 ||
    sourceCanvas.width < 1 ||
    sourceCanvas.height < 1
  ) {
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

  const dx = ((inter.x1 - elRect.left) / elRect.width) * GRID_W;
  const dy = ((inter.y1 - elRect.top) / elRect.height) * GRID_H;
  const dw = ((inter.x2 - inter.x1) / elRect.width) * GRID_W;
  const dh = ((inter.y2 - inter.y1) / elRect.height) * GRID_H;

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

  const dx = ((inter.x1 - elRect.left) / elRect.width) * GRID_W;
  const dy = ((inter.y1 - elRect.top) / elRect.height) * GRID_H;
  const dw = ((inter.x2 - inter.x1) / elRect.width) * GRID_W;
  const dh = ((inter.y2 - inter.y1) / elRect.height) * GRID_H;

  try {
    ctx.drawImage(imgEl, sx, sy, sw, sh, dx, dy, dw, dh);
  } catch {
    // 忽略跨域图片 readback 异常
  }
}

/**
 * 无早退 5 点全采样探测元素背后的可见层并集（按绘制先后排序：底层在前，顶层在后）
 */
function collectBehindLayers(el: HTMLElement, elRect: DOMRect): Element[] {
  const probePoints: Array<[number, number]> = [
    [elRect.left + elRect.width * 0.5, elRect.top + elRect.height * 0.5],
    [elRect.left + elRect.width * 0.08, elRect.top + elRect.height * 0.08],
    [elRect.left + elRect.width * 0.92, elRect.top + elRect.height * 0.08],
    [elRect.left + elRect.width * 0.08, elRect.top + elRect.height * 0.92],
    [elRect.left + elRect.width * 0.92, elRect.top + elRect.height * 0.92],
  ];

  const layerScore = new Map<Element, number>();

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

    let stopIdx = behind.length - 1;
    for (let i = 0; i < behind.length; i++) {
      const node = behind[i];
      if (
        node instanceof HTMLCanvasElement ||
        node instanceof HTMLImageElement ||
        node.classList.contains("konvajs-content")
      ) {
        stopIdx = i;
        continue;
      }
      const parsedBg = parseCssColor(getComputedStyle(node).backgroundColor);
      if (parsedBg && parsedBg.a >= 0.99) {
        stopIdx = i;
        break;
      }
    }

    // 记录每个命中的唯一元素及其在堆栈中的深度权重（越靠后越小）
    const active = behind.slice(0, stopIdx + 1);
    for (let i = 0; i < active.length; i++) {
      const node = active[i];
      const depthFromTop = i;
      const prev = layerScore.get(node);
      if (prev === undefined || depthFromTop > prev) {
        layerScore.set(node, depthFromTop);
      }
    }
  }

  const union = Array.from(layerScore.keys());
  union.sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    // a 包含 b -> a 是祖先（先绘制）；a 被 b 包含 -> b 先绘制
    if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) return -1;
    if (pos & Node.DOCUMENT_POSITION_CONTAINS) return 1;
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return (layerScore.get(b) ?? 0) - (layerScore.get(a) ?? 0);
  });

  return union;
}

const INVALID_EMPTY_GRID = new Float32Array(0);

/**
 * 实时采样指定 DOM 元素背后区域的 16×16 空间相对亮度网格
 */
export function sampleElementBackdropGrid(el: HTMLElement): BackdropGridSample {
  if (typeof window === "undefined") {
    return {
      luminance: 0.5,
      variance: 0,
      valid: false,
      gridWidth: 0,
      gridHeight: 0,
      grid: INVALID_EMPTY_GRID,
      rect: { left: 0, top: 0, width: 0, height: 0 },
    };
  }

  const elRect = el.getBoundingClientRect();
  if (elRect.width < 2 || elRect.height < 2) {
    return {
      luminance: 0.5,
      variance: 0,
      valid: false,
      gridWidth: 0,
      gridHeight: 0,
      grid: INVALID_EMPTY_GRID,
      rect: { left: 0, top: 0, width: 0, height: 0 },
    };
  }

  const rectMeta = {
    left: elRect.left,
    top: elRect.top,
    width: elRect.width,
    height: elRect.height,
  };

  // 1. 解析当前主题根画布底色
  const rootBgRaw =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--mk-bg-canvas")
      .trim() || getComputedStyle(document.body).backgroundColor;
  const baseRgba = parseCssColor(rootBgRaw) ?? { r: 13, g: 17, b: 23, a: 1 };

  // 2. 无早退 5 点扫描收集并集可视背景叠层
  const visibleLayers = collectBehindLayers(el, elRect);
  const hasPixelSource = visibleLayers.some(
    (node) =>
      node instanceof HTMLCanvasElement ||
      node instanceof HTMLImageElement ||
      node.classList.contains("konvajs-content"),
  );

  // 仅当无像素源且所有可见有色 DOM 层完整铺满 elRect 时才走纯 JS 零 canvas 快速通道
  const layerRects = new Map<Element, { bg: Rgba; rect: DOMRect }>();
  let allFullCover = true;
  if (!hasPixelSource) {
    for (const node of visibleLayers) {
      const bg = parseCssColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.01) {
        const nRect = node.getBoundingClientRect();
        layerRects.set(node, { bg, rect: nRect });
        if (!rectCoversAll(nRect, elRect)) {
          allFullCover = false;
        }
      }
    }
  }

  if (!hasPixelSource && allFullCover) {
    let acc: Rgba = { ...baseRgba };
    for (const { bg } of layerRects.values()) {
      acc = compositeRgbaOver(bg, acc);
    }
    const luminance = computeRelativeLuminance(acc.r, acc.g, acc.b);
    const grid = new Float32Array(GRID_W * GRID_H);
    grid.fill(luminance);
    return {
      luminance,
      variance: 0,
      valid: true,
      gridWidth: GRID_W,
      gridHeight: GRID_H,
      grid,
      rect: rectMeta,
    };
  }

  // 3. 存在 <canvas>/<img> 或局部叠层跨界时，在 16×16 离屏画布逐层空间合成
  const ctx = getScratchContext();
  if (!ctx) {
    return {
      luminance: 0.5,
      variance: 0,
      valid: false,
      gridWidth: 0,
      gridHeight: 0,
      grid: INVALID_EMPTY_GRID,
      rect: rectMeta,
    };
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgb(${Math.round(baseRgba.r)}, ${Math.round(baseRgba.g)}, ${Math.round(baseRgba.b)})`;
  ctx.fillRect(0, 0, GRID_W, GRID_H);

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

    const cached = layerRects.get(node);
    const bg = cached
      ? cached.bg
      : parseCssColor(getComputedStyle(node).backgroundColor);
    if (bg && bg.a > 0.01) {
      const nRect = cached ? cached.rect : node.getBoundingClientRect();
      const inter = rectIntersection(elRect, nRect);
      if (inter) {
        const dx = ((inter.x1 - elRect.left) / elRect.width) * GRID_W;
        const dy = ((inter.y1 - elRect.top) / elRect.height) * GRID_H;
        const dw = ((inter.x2 - inter.x1) / elRect.width) * GRID_W;
        const dh = ((inter.y2 - inter.y1) / elRect.height) * GRID_H;
        ctx.fillStyle = `rgba(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)}, ${bg.a})`;
        ctx.fillRect(dx, dy, dw, dh);
      }
    }
  }

  // 4. 一次性读取 256 像素填入 Float32Array 空间亮度网格
  try {
    const pixels = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    const count = GRID_W * GRID_H;
    const grid = new Float32Array(count);
    let sum = 0;

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      const lum = computeRelativeLuminance(
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
      );
      grid[i] = lum;
      sum += lum;
    }

    const mean = sum / count;
    let sqDiff = 0;
    for (let i = 0; i < count; i++) {
      const d = grid[i] - mean;
      sqDiff += d * d;
    }

    return {
      luminance: mean,
      variance: sqDiff / count,
      valid: true,
      gridWidth: GRID_W,
      gridHeight: GRID_H,
      grid,
      rect: rectMeta,
    };
  } catch {
    return {
      luminance: 0.5,
      variance: 0,
      valid: false,
      gridWidth: 0,
      gridHeight: 0,
      grid: INVALID_EMPTY_GRID,
      rect: rectMeta,
    };
  }
}

/**
 * 兼容旧签名：返回指定元素背后的整体相对亮度与方差
 */
export function sampleElementBackdropLuminance(
  el: HTMLElement,
): BackdropSampleResult {
  const { luminance, variance, valid } = sampleElementBackdropGrid(el);
  return { luminance, variance, valid };
}
