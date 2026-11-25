import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "./tauriBridge";

/**
 * 跨平台桌面窗口控制与标题同步服务
 */

export async function syncWindowTitle(projectName?: string, isDirty = false): Promise<void> {
  const title = projectName
    ? `${isDirty ? "● " : ""}${projectName} — MoKairos Studio`
    : "MoKairos Studio — RoboMaster UI 设计器";
  document.title = title;
  if (!isTauriRuntime()) {
    return;
  }
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    // 非桌面环境忽略
  }
}
