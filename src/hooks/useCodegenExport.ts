import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/components/ui/toast";
import { exportCmakeModule, exportGeneratedSources } from "@/services/codegenService";
import { saveCurrentProject } from "@/services/projectActions";
import { isTauriRuntime } from "@/services/tauriBridge";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";

/**
 * .mkui 打包、MoKairosUI.cmake 导出与 C/C++ 源码目录直出编排 Hook
 */

export function useCodegenExport() {
  const [busy, setBusy] = useState(false);
  const [lastCmakeSnippet, setLastCmakeSnippet] = useState<string>("");
  const [lastCmakePath, setLastCmakePath] = useState<string>("");
  const [lastSourcesDir, setLastSourcesDir] = useState<string>("");

  const handleSaveMkui = async () => {
    setBusy(true);
    try {
      await saveCurrentProject(false);
    } finally {
      setBusy(false);
    }
  };

  const handleExportCmake = async () => {
    if (!isTauriRuntime()) {
      toast.warn("请在 Tauri 桌面端导出本地 MoKairosUI.cmake 文件");
      return;
    }
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择导出 MoKairosUI.cmake 的目录（通常为整车工程 cmake/）",
    });
    if (typeof dir !== "string" || !dir) return;

    setBusy(true);
    try {
      const doc = useDocumentStore.getState().doc;
      const filePath = useProjectStore.getState().filePath;
      const prefix = useCodegenStore.getState().profile.prefix;
      const mkuiName = filePath
        ? filePath.replace(/\\/g, "/").split("/").pop() || `${doc.name}.mkui`
        : `${doc.name || "ui"}.mkui`;
      const res = await exportCmakeModule({
        targetDir: dir,
        mkuiFileName: `ui/${mkuiName}`,
        prefix,
      });
      setLastCmakePath(res.cmakePath);
      setLastCmakeSnippet(res.snippet);
      toast.success("已导出 MoKairosUI.cmake", { description: res.cmakePath });
    } catch (err) {
      toast.error("导出 MoKairosUI.cmake 失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExportSources = async (includeCustomScaffold: boolean) => {
    if (!isTauriRuntime()) {
      toast.warn("请在 Tauri 桌面端导出 C/C++ 源码目录");
      return;
    }
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择导出 C/C++ UI 源码的目标目录",
    });
    if (typeof dir !== "string" || !dir) return;

    setBusy(true);
    try {
      const doc = useDocumentStore.getState().doc;
      const filePath = useProjectStore.getState().filePath;
      const bundle = useCodegenStore.getState().toBundle();
      const mkuiName = filePath
        ? filePath.replace(/\\/g, "/").split("/").pop() || `${doc.name}.mkui`
        : `${doc.name || "design"}.mkui`;
      const res = await exportGeneratedSources({
        document: doc,
        codegen: bundle,
        targetDir: dir,
        includeCustomScaffold,
        mkuiName,
      });
      setLastSourcesDir(res.targetDir);
      toast.success(`已导出 ${res.writtenFiles.length} 个 UI 源码文件`, {
        description: includeCustomScaffold
          ? `${res.targetDir}（含 generated/ 与 custom/）`
          : res.targetDir,
      });
    } catch (err) {
      toast.error("导出源码失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    lastCmakeSnippet,
    lastCmakePath,
    lastSourcesDir,
    handleSaveMkui,
    handleExportCmake,
    handleExportSources,
  };
}
