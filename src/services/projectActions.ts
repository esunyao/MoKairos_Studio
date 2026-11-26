import { toast } from "@/components/ui/toast";
import type { RobotRole2027 } from "@/domain/protocol/constants";
import {
  createDocumentFromTemplate,
  type StarterTemplateId,
} from "@/domain/templates/starterTemplates";
import { useAppStore } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSimulatorStore } from "@/stores/useSimulatorStore";
import { useVersionStore } from "@/stores/useVersionStore";
import {
  exportDocumentAsJson,
  exportDocumentAsRmui,
  openMkuiAtPath,
  pickAndImportRmui,
  pickAndOpenMkui,
  saveMkuiAtPath,
  saveMkuiWithDialog,
} from "./mkuiFileService";
import { guardUnsavedChanges } from "./unsavedGuard";

/**
 * 跨视图共享的工程打开、新建、保存、导入与导出编排函数
 */

export async function createNewProjectFromWizard(params: {
  templateId: StarterTemplateId;
  name: string;
  robotRole: RobotRole2027;
  targetView?: "design" | "simulate" | "export";
}): Promise<void> {
  const executeCreate = async () => {
    const doc = createDocumentFromTemplate(
      params.templateId,
      params.name,
      params.robotRole,
    );
    useDocumentStore.getState().loadDocument(doc);
    useCanvasStore.getState().clearSelection();
    useVersionStore.getState().resetHistory();
    useSimulatorStore.getState().resetOverrides();
    useCodegenStore.getState().resetToDefault();
    await useProjectStore.getState().markOpened({ filePath: null, doc });
    useAppStore.getState().setView(params.targetView ?? "design");
    toast.success(`已创建工程「${doc.name}」`, {
      description: "画布逻辑尺寸 1920×1080，左下角原点已就绪",
    });
  };

  guardUnsavedChanges({
    actionLabel: "新建工程",
    onContinue: executeCreate,
  });
}

export async function openProjectWithDialog(): Promise<void> {
  const executeOpen = async () => {
    try {
      const opened = await pickAndOpenMkui();
      if (!opened) return;
      useDocumentStore.getState().loadDocument(opened.document);
      useCanvasStore.getState().clearSelection();
      useVersionStore.getState().setVersionHistory(opened.history);
      useSimulatorStore.getState().resetOverrides();
      await useCodegenStore.getState().loadFromArchive(opened.codegen);
      await useProjectStore.getState().markOpened({
        filePath: opened.filePath,
        doc: opened.document,
        archiveBytes: opened.archiveSizeBytes,
        commitCount: opened.history.commits.length,
        headCommitId: opened.history.headCommitId,
      });
      useAppStore.getState().setView("design");
      toast.success(`已打开 ${opened.document.name}`, {
        description: `压缩包 ${(opened.archiveSizeBytes / 1024).toFixed(1)} KB · 历史版本 ${opened.history.commits.length} 个`,
      });
    } catch (err) {
      toast.error("打开 .mkui 失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  guardUnsavedChanges({
    actionLabel: "打开工程",
    onContinue: executeOpen,
  });
}

export async function openProjectByPath(filePath: string): Promise<void> {
  const executeOpen = async () => {
    try {
      const opened = await openMkuiAtPath(filePath);
      useDocumentStore.getState().loadDocument(opened.document);
      useCanvasStore.getState().clearSelection();
      useVersionStore.getState().setVersionHistory(opened.history);
      useSimulatorStore.getState().resetOverrides();
      await useCodegenStore.getState().loadFromArchive(opened.codegen);
      await useProjectStore.getState().markOpened({
        filePath: opened.filePath,
        doc: opened.document,
        archiveBytes: opened.archiveSizeBytes,
        commitCount: opened.history.commits.length,
        headCommitId: opened.history.headCommitId,
      });
      useAppStore.getState().setView("design");
    } catch (err) {
      toast.error("无法打开最近工程", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  guardUnsavedChanges({
    actionLabel: "打开工程",
    onContinue: executeOpen,
  });
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
    const codegenBundle = useCodegenStore.getState().toBundle();

    const receipt =
      !saveAs && project.filePath
        ? await saveMkuiAtPath(project.filePath, doc, pendingHistory, codegenBundle)
        : await saveMkuiWithDialog(doc, doc.name, pendingHistory, codegenBundle);

    if (!receipt) {
      return false;
    }

    useCodegenStore.getState().markSaved();
    await project.markSaved({
      filePath: receipt.filePath,
      doc,
      archiveBytes: receipt.archiveSizeBytes,
      msgpackBytes: receipt.msgpackBytes,
      commitCount: receipt.manifest.commitCount,
      headCommitId: receipt.manifest.headCommitId,
    });

    await version.refreshFromArchive(receipt.filePath);

    toast.success("已保存 .mkui 归档", {
      description: `MessagePack ${receipt.msgpackBytes} B → ZIP 整包 ${receipt.archiveSizeBytes} B`,
    });
    return true;
  } catch (err) {
    toast.error("保存 .mkui 失败", {
      description: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function importRmuiProject(): Promise<void> {
  const executeImport = async () => {
    try {
      const res = await pickAndImportRmui();
      if (!res) return;
      useDocumentStore.getState().loadDocument(res.document);
      useCanvasStore.getState().clearSelection();
      useVersionStore.getState().resetHistory();
      useSimulatorStore.getState().resetOverrides();
      useCodegenStore.getState().resetToDefault();
      await useProjectStore.getState().markOpened({
        filePath: null,
        doc: res.document,
      });
      useAppStore.getState().setView("design");
      if (res.warnings.length > 0) {
        toast.warn(`已导入 .rmui 工程「${res.sourceName}」`, {
          description: res.warnings.slice(0, 2).join("；"),
        });
      } else {
        toast.success(`已导入 .rmui 工程「${res.sourceName}」`, {
          description: `共 ${res.document.frames.length} 个画面，已自动分配 3 字节短名`,
        });
      }
    } catch (err) {
      toast.error("导入 .rmui 失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  guardUnsavedChanges({
    actionLabel: "导入 .rmui",
    onContinue: executeImport,
  });
}

export async function exportCurrentAsRmui(): Promise<void> {
  try {
    const doc = useDocumentStore.getState().doc;
    const saved = await exportDocumentAsRmui(doc);
    if (saved) {
      toast.success("已兼容导出 .rmui", { description: saved });
    }
  } catch (err) {
    toast.error("导出 .rmui 失败", {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function exportCurrentAsJson(): Promise<void> {
  try {
    const doc = useDocumentStore.getState().doc;
    const saved = await exportDocumentAsJson(doc);
    if (saved) {
      toast.success("已导出调试 JSON", { description: saved });
    }
  } catch (err) {
    toast.error("导出 JSON 失败", {
      description: err instanceof Error ? err.message : String(err),
    });
  }
}
