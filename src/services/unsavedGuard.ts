import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "./tauriBridge";
import { saveCurrentProject } from "./projectActions";
import { useAppStore } from "@/stores/useAppStore";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";

/**
 * 画布未保存修改离开守卫服务
 * 覆盖：返回工程大厅、新建/打开/导入替换当前工程、关闭桌面应用窗口
 */

export function hasUnsavedChanges(): boolean {
  const project = useProjectStore.getState();
  const codegenDirty = useCodegenStore.getState().isDirty;
  return project.hasOpenProject && (project.isDirty || codegenDirty);
}

export function guardUnsavedChanges(params: {
  actionLabel?: string;
  onContinue: () => Promise<void> | void;
}): void {
  if (!hasUnsavedChanges()) {
    void params.onContinue();
    return;
  }

  const docName = useDocumentStore.getState().doc.name;
  const filePath = useProjectStore.getState().filePath;
  const actionLabel = params.actionLabel ?? "离开当前画布";

  useAppStore.getState().openUnsavedPrompt({
    title: `是否保存对「${docName}」的更改？`,
    description: filePath
      ? `工程已修改但尚未保存至 ${filePath}。`
      : "当前新建或导入的工程尚未保存为 .mkui 文件。",
    saveAndContinueLabel: `保存并${actionLabel}`,
    discardLabel: `不保存直接${actionLabel}`,
    onSaveAndContinue: async () => {
      const saved = await saveCurrentProject(false);
      if (saved) {
        useAppStore.getState().closeUnsavedPrompt();
        await params.onContinue();
      }
    },
    onDiscard: async () => {
      useProjectStore.getState().closeProject();
      await params.onContinue();
    },
  });
}

/** 返回工程大厅（若存在未保存修改则弹窗确认） */
export function navigateToLaunchpadWithGuard(): void {
  const app = useAppStore.getState();
  if (app.view === "launchpad") {
    return;
  }

  if (!hasUnsavedChanges()) {
    app.setVersionDrawerOpen(false);
    app.setView("launchpad");
    return;
  }

  const docName = useDocumentStore.getState().doc.name;
  const filePath = useProjectStore.getState().filePath;

  app.openUnsavedPrompt({
    title: `离开前是否保存「${docName}」？`,
    description: filePath
      ? `当前画布有尚未保存的更改，返回工程大厅后可能继续新建或切换其他工程。`
      : "当前新建或导入的画布尚未保存为 .mkui 工程包，直接返回并丢弃将丢失本次编辑。",
    saveAndContinueLabel: "保存并返回大厅",
    discardLabel: "不保存直接返回",
    onSaveAndContinue: async () => {
      const saved = await saveCurrentProject(false);
      if (saved) {
        useAppStore.getState().closeUnsavedPrompt();
        useAppStore.getState().setVersionDrawerOpen(false);
        useAppStore.getState().setView("launchpad");
      }
    },
    onDiscard: () => {
      useProjectStore.getState().closeProject();
      useAppStore.getState().setVersionDrawerOpen(false);
      useAppStore.getState().setView("launchpad");
    },
  });
}

/** 关闭桌面应用窗口前的未保存守卫 */
export function confirmExitAppWithGuard(): void {
  const docName = useDocumentStore.getState().doc.name;
  const filePath = useProjectStore.getState().filePath;

  useAppStore.getState().openUnsavedPrompt({
    title: `退出前是否保存「${docName}」？`,
    description: filePath
      ? `工程「${docName}」存在未保存修改。`
      : "当前画布尚未首次保存为 .mkui 工程包。",
    saveAndContinueLabel: "保存并退出",
    discardLabel: "不保存直接退出",
    onSaveAndContinue: async () => {
      const saved = await saveCurrentProject(false);
      if (saved && isTauriRuntime()) {
        useAppStore.getState().closeUnsavedPrompt();
        await getCurrentWindow().destroy();
      }
    },
    onDiscard: async () => {
      if (isTauriRuntime()) {
        await getCurrentWindow().destroy();
      }
    },
  });
}
