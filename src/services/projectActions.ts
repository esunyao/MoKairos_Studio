import { createDocumentFromTemplate, type StarterTemplateId } from "@/domain/templates/starterTemplates";
import type { RobotRole2027 } from "@/domain/protocol/constants";
import {
  exportDocumentAsJson,
  exportDocumentAsRmui,
  openMkuiAtPath,
  pickAndImportRmui,
  pickAndOpenMkui,
  saveMkuiAtPath,
  saveMkuiWithDialog,
} from "./mkuiFileService";
import { useAppStore } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSimulatorStore } from "@/stores/useSimulatorStore";
import { useVersionStore } from "@/stores/useVersionStore";

/**
 * 跨视图共享的工程打开、新建、保存、导入与导出编排函数（避免页面组件重复写相同流程）
 */

export async function createNewProjectFromWizard(params: {
  templateId: StarterTemplateId;
  name: string;
  robotRole: RobotRole2027;
  targetView?: "design" | "simulate" | "export";
}): Promise<void> {
  const doc = createDocumentFromTemplate(
    params.templateId,
    params.name,
    params.robotRole,
  );
  useDocumentStore.getState().loadDocument(doc);
  useCanvasStore.getState().clearSelection();
  useVersionStore.getState().resetHistory();
  useSimulatorStore.getState().resetOverrides();
  await useProjectStore.getState().markOpened({ filePath: null, doc });
  useAppStore.getState().setView(params.targetView ?? "design");
  useAppStore.getState().pushToast({
    tone: "success",
    title: `已创建工程「${doc.name}」`,
    description: "画布逻辑尺寸 1920×1080，左下角原点已就绪",
  });
}

export async function openProjectWithDialog(): Promise<void> {
  try {
    const opened = await pickAndOpenMkui();
    if (!opened) return;
    useDocumentStore.getState().loadDocument(opened.document);
    useCanvasStore.getState().clearSelection();
    useVersionStore.getState().setVersionHistory(opened.history);
    useSimulatorStore.getState().resetOverrides();
    await useProjectStore.getState().markOpened({
      filePath: opened.filePath,
      doc: opened.document,
      archiveBytes: opened.archiveSizeBytes,
      commitCount: opened.history.commits.length,
      headCommitId: opened.history.headCommitId,
    });
    useAppStore.getState().setView("design");
    useAppStore.getState().pushToast({
      tone: "success",
      title: `已打开 ${opened.document.name}`,
      description: `压缩包 ${(opened.archiveSizeBytes / 1024).toFixed(1)} KB · 历史版本 ${opened.history.commits.length} 个`,
    });
  } catch (err) {
    useAppStore.getState().pushToast({
      tone: "error",
      title: "打开 .mkui 失败",
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function openProjectByPath(filePath: string): Promise<void> {
  try {
    const opened = await openMkuiAtPath(filePath);
    useDocumentStore.getState().loadDocument(opened.document);
    useCanvasStore.getState().clearSelection();
    useVersionStore.getState().setVersionHistory(opened.history);
    useSimulatorStore.getState().resetOverrides();
    await useProjectStore.getState().markOpened({
      filePath: opened.filePath,
      doc: opened.document,
      archiveBytes: opened.archiveSizeBytes,
      commitCount: opened.history.commits.length,
      headCommitId: opened.history.headCommitId,
    });
    useAppStore.getState().setView("design");
  } catch (err) {
    useAppStore.getState().pushToast({
      tone: "error",
      title: "无法打开最近工程",
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function saveCurrentProject(saveAs = false): Promise<boolean> {
  const doc = useDocumentStore.getState().doc;
  const project = useProjectStore.getState();
  const version = useVersionStore.getState();

  try {
    const pendingHistory =
      version.index.commits.length > 0
        ? { index: version.index, snapshots: version.memorySnapshots }
        : undefined;

    const receipt =
      !saveAs && project.filePath
        ? await saveMkuiAtPath(project.filePath, doc, pendingHistory)
        : await saveMkuiWithDialog(doc, doc.name, pendingHistory);

    if (!receipt) {
      return false;
    }

    await project.markSaved({
      filePath: receipt.filePath,
      doc,
      archiveBytes: receipt.archiveSizeBytes,
      msgpackBytes: receipt.msgpackBytes,
      commitCount: receipt.manifest.commitCount,
      headCommitId: receipt.manifest.headCommitId,
    });

    // 已落盘后刷新版本列表，释放草稿缓存
    await version.refreshFromArchive(receipt.filePath);

    useAppStore.getState().pushToast({
      tone: "success",
      title: "已保存 .mkui 归档",
      description: `MessagePack ${receipt.msgpackBytes} B → ZIP 整包 ${receipt.archiveSizeBytes} B`,
    });
    return true;
  } catch (err) {
    useAppStore.getState().pushToast({
      tone: "error",
      title: "保存 .mkui 失败",
      description: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function importRmuiProject(): Promise<void> {
  try {
    const res = await pickAndImportRmui();
    if (!res) return;
    useDocumentStore.getState().loadDocument(res.document);
    useCanvasStore.getState().clearSelection();
    useVersionStore.getState().resetHistory();
    useSimulatorStore.getState().resetOverrides();
    await useProjectStore.getState().markOpened({
      filePath: null,
      doc: res.document,
    });
    useAppStore.getState().setView("design");
    useAppStore.getState().pushToast({
      tone: res.warnings.length > 0 ? "warn" : "success",
      title: `已导入 .rmui 工程「${res.sourceName}」`,
      description:
        res.warnings.length > 0
          ? res.warnings.slice(0, 2).join("；")
          : `共 ${res.document.frames.length} 个画面，已自动分配 3 字节短名`,
    });
  } catch (err) {
    useAppStore.getState().pushToast({
      tone: "error",
      title: "导入 .rmui 失败",
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function exportCurrentAsRmui(): Promise<void> {
  try {
    const doc = useDocumentStore.getState().doc;
    const saved = await exportDocumentAsRmui(doc);
    if (saved) {
      useAppStore.getState().pushToast({
        tone: "success",
        title: "已兼容导出 .rmui",
        description: saved,
      });
    }
  } catch (err) {
    useAppStore.getState().pushToast({
      tone: "error",
      title: "导出 .rmui 失败",
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function exportCurrentAsJson(): Promise<void> {
  try {
    const doc = useDocumentStore.getState().doc;
    const saved = await exportDocumentAsJson(doc);
    if (saved) {
      useAppStore.getState().pushToast({
        tone: "success",
        title: "已导出调试 JSON",
        description: saved,
      });
    }
  } catch (err) {
    useAppStore.getState().pushToast({
      tone: "error",
      title: "导出 JSON 失败",
      description: err instanceof Error ? err.message : String(err),
    });
  }
}
