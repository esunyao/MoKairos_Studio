import type { RecentProjectEntry } from "@/domain/protocol/types";
import { invokeCommand, isTauriRuntime } from "./tauriBridge";

/**
 * 跨平台最近工程索引服务
 */

const LOCAL_STORAGE_KEY = "mokairos.recentProjects.v1";

export async function loadRecentProjects(): Promise<RecentProjectEntry[]> {
  if (isTauriRuntime()) {
    try {
      return await invokeCommand<RecentProjectEntry[]>("recent_projects_load");
    } catch {
      return [];
    }
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentProjectEntry[]) : [];
  } catch {
    return [];
  }
}

export async function saveRecentProjects(
  entries: RecentProjectEntry[],
): Promise<void> {
  const trimmed = entries.slice(0, 16);
  if (isTauriRuntime()) {
    await invokeCommand("recent_projects_save", { entries: trimmed });
    return;
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 忽略浏览器配额异常
  }
}
