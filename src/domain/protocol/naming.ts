import { RM_PROTOCOL_LIMITS } from "./constants";

/**
 * 协议命名、UTF-8 字节长度计算与唯一 3 字节 figure_name 分配工具
 */

const textEncoder = new TextEncoder();

/** 计算字符串在 UTF-8 编码下的真实字节数（1 个汉字通常占 3 字节） */
export function getUtf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

/** 校验裁判系统 3 字节 figure_name 是否合法 */
export function isValidFigureName(name: string): boolean {
  if (!name || name.includes("\0")) {
    return false;
  }
  const bytes = getUtf8ByteLength(name);
  return bytes >= 1 && bytes <= RM_PROTOCOL_LIMITS.maxFigureNameBytes;
}

/** 校验字符串是否适合作为未来 C++ / CMake 标识符 */
export function isValidCIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** 自动分配一个全局不冲突的 3 字节 ASCII 图形名（如 g01 ~ g99, a00 ~ z99） */
export function allocateFigureName(
  existingNames: ReadonlySet<string>,
  preferred?: string,
): string {
  if (preferred) {
    const asciiCandidate = preferred.replace(/[^\x21-\x7e]/g, "").slice(0, 3);
    if (asciiCandidate.length >= 1 && !existingNames.has(asciiCandidate)) {
      return asciiCandidate;
    }
  }

  // 先尝试 g01..g99
  for (let i = 1; i <= 99; i++) {
    const candidate = `g${String(i).padStart(2, "0")}`;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }

  // 再尝试 a00..z99
  const prefixes = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const ch of prefixes) {
    for (let i = 0; i <= 99; i++) {
      const candidate = `${ch}${String(i).padStart(2, "0")}`;
      if (!existingNames.has(candidate)) {
        return candidate;
      }
    }
  }

  // 极端兜底：3 位 36 进制编码
  for (let i = 0; i < 46656; i++) {
    const candidate = i.toString(36).padStart(3, "0").slice(0, 3);
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }
  return "z99";
}

/** 生成内部唯一 UUID */
export function createStableId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
