import { save } from "@tauri-apps/plugin-dialog";
import type { MkuiDocument, VersionIndex } from "@/domain/protocol/types";
import { invokeCommand, isTauriRuntime } from "./tauriBridge";

/**
 * .mkui 包内版本控制服务（封装快照提交、历史拉取、版本恢复与独立导出）
 */

export async function commitVersionToArchive(params: {
  filePath: string;
  document: MkuiDocument;
  message: string;
  versionTag?: string | null;
  author?: string;
}): Promise<VersionIndex> {
  return invokeCommand<VersionIndex>("version_commit", {
    filePath: params.filePath,
    document: params.document,
    message: params.message,
    versionTag: params.versionTag ?? null,
    author: params.author ?? "Designer",
  });
}

export async function listVersionsInArchive(filePath: string): Promise<VersionIndex> {
  return invokeCommand<VersionIndex>("version_list", { filePath });
}

export async function loadCommitSnapshot(
  filePath: string,
  commitId: string,
): Promise<MkuiDocument> {
  return invokeCommand<MkuiDocument>("version_load_snapshot", {
    filePath,
    commitId,
  });
}

export async function exportCommitToMkuiWithDialog(
  sourcePath: string,
  commitId: string,
  defaultName: string,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    throw new Error("请在桌面端应用中使用 .mkui 版本导出功能");
  }
  const targetPath = await save({
    defaultPath: `${defaultName}_${commitId.slice(0, 12)}.mkui`,
    filters: [{ name: "MoKairos UI 工程 (.mkui)", extensions: ["mkui"] }],
  });
  if (!targetPath) {
    return null;
  }
  await invokeCommand("version_export_commit", {
    sourcePath,
    targetPath,
    commitId,
  });
  return targetPath;
}
