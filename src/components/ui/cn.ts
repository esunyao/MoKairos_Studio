import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind 类名并自动去重冲突类 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
