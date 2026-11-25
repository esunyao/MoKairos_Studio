import { open, save } from "@tauri-apps/plugin-dialog";
import { exportToRmuiJson, importRmuiJson } from "@/domain/adapters/rmuiAdapter";
import type {
  MkuiDocument,
  MkuiManifest,
  VersionIndex,
} from "@/domain/protocol/types";
import { invokeCommand, isTauriRuntime } from "./tauriBridge";

/**
 * .mkui（ZIP + MessagePack）读写服务与 .rmui / .json 导入导出适配服务
 */

export interface OpenedMkuiProject {
  filePath: string;
  manifest: MkuiManifest;
  document: MkuiDocument;
  history: VersionIndex;
  archiveSizeBytes: number;
}

export interface SavedMkuiReceipt {
  filePath: string;
  manifest: MkuiManifest;
  archiveSizeBytes: number;
  msgpackBytes: number;
}

export interface PendingHistoryPayload {
  index: VersionIndex;
  snapshots: Record<string, MkuiDocument>;
}

/** 弹出系统文件选择框读取 .mkui 工程 */
export async function pickAndOpenMkui(): Promise<OpenedMkuiProject | null> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式不支持本地 .mkui ZIP 解包，请在桌面端运行或使用 .rmui/.json 导入。");
  }
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "MoKairos UI 工程 (.mkui)", extensions: ["mkui"] }],
  });
  if (typeof selected !== "string" || !selected) {
    return null;
  }
  return openMkuiAtPath(selected);
}

export async function openMkuiAtPath(filePath: string): Promise<OpenedMkuiProject> {
  return invokeCommand<OpenedMkuiProject>("project_open_mkui", { filePath });
}

/** 弹出保存对话框选择 .mkui 路径并保存 */
export async function saveMkuiWithDialog(
  doc: MkuiDocument,
  defaultFileName?: string,
  pendingHistory?: PendingHistoryPayload,
): Promise<SavedMkuiReceipt | null> {
  if (!isTauriRuntime()) {
    // 浏览器预览降级：下载 .json 调试文件并提示
    downloadTextInBrowser(
      `${defaultFileName ?? doc.name}.mkui.json`,
      JSON.stringify(doc, null, 2),
    );
    return null;
  }
  const targetPath = await save({
    defaultPath: `${defaultFileName ?? doc.name}.mkui`,
    filters: [{ name: "MoKairos UI 工程 (.mkui)", extensions: ["mkui"] }],
  });
  if (!targetPath) {
    return null;
  }
  return saveMkuiAtPath(targetPath, doc, pendingHistory);
}

export async function saveMkuiAtPath(
  filePath: string,
  document: MkuiDocument,
  pendingHistory?: PendingHistoryPayload,
): Promise<SavedMkuiReceipt> {
  return invokeCommand<SavedMkuiReceipt>("project_save_mkui", {
    filePath,
    document,
    pendingHistory: pendingHistory ?? null,
  });
}

/** 导入 RM-UI-Designer .rmui (JSON) 文件 */
export async function pickAndImportRmui(): Promise<{
  document: MkuiDocument;
  warnings: string[];
  sourceName: string;
} | null> {
  if (isTauriRuntime()) {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "RM-UI-Designer 工程 (.rmui / .json)", extensions: ["rmui", "json"] }],
    });
    if (typeof selected !== "string" || !selected) {
      return null;
    }
    const text = await invokeCommand<string>("project_read_text_file", {
      filePath: selected,
    });
    const baseName =
      selected.replace(/\\/g, "/").split("/").pop()?.replace(/\.(rmui|json)$/i, "") ||
      "导入的工程";
    const result = importRmuiJson(text, baseName);
    return { ...result, sourceName: baseName };
  }

  const picked = await pickFileInBrowser(".rmui,.json");
  if (!picked) {
    return null;
  }
  const text = await picked.text();
  const baseName = picked.name.replace(/\.(rmui|json)$/i, "") || "导入的工程";
  const result = importRmuiJson(text, baseName);
  return { ...result, sourceName: baseName };
}

/** 兼容导出为 .rmui JSON */
export async function exportDocumentAsRmui(doc: MkuiDocument): Promise<string | null> {
  const content = exportToRmuiJson(doc);
  const fileName = `${doc.name || "ui"}.rmui`;
  if (isTauriRuntime()) {
    const targetPath = await save({
      defaultPath: fileName,
      filters: [{ name: "RM-UI-Designer 工程 (.rmui)", extensions: ["rmui"] }],
    });
    if (!targetPath) {
      return null;
    }
    await invokeCommand("project_write_text_file", { filePath: targetPath, content });
    return targetPath;
  }
  downloadTextInBrowser(fileName, content);
  return fileName;
}

/** 导出调试明文 JSON */
export async function exportDocumentAsJson(doc: MkuiDocument): Promise<string | null> {
  const content = JSON.stringify(doc, null, 2);
  const fileName = `${doc.name || "ui"}.json`;
  if (isTauriRuntime()) {
    const targetPath = await save({
      defaultPath: fileName,
      filters: [{ name: "JSON 文件 (.json)", extensions: ["json"] }],
    });
    if (!targetPath) {
      return null;
    }
    await invokeCommand("project_write_text_file", { filePath: targetPath, content });
    return targetPath;
  }
  downloadTextInBrowser(fileName, content);
  return fileName;
}

function downloadTextInBrowser(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function pickFileInBrowser(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}
