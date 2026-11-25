import { invoke } from "@tauri-apps/api/core";

/**
 * Tauri 桌面运行环境探测与类型安全 IPC 桥接工具
 */

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`当前处于浏览器预览模式，无法调用桌面原生命令：${command}`);
  }
  return invoke<T>(command, args);
}
