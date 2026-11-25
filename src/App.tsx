import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { TooltipProvider } from "@/components/ui/Controls";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { Toaster } from "@/components/ui/toast";
import { EditorWorkspace } from "@/features/editor/EditorWorkspace";
import { ExportMockView } from "@/features/export-mock/ExportMockView";
import { LaunchpadView } from "@/features/launchpad/LaunchpadView";
import { NewProjectDialog } from "@/features/launchpad/NewProjectDialog";
import { SettingsDialog } from "@/features/launchpad/SettingsDialog";
import { AppTitleBar } from "@/features/shell/AppTitleBar";
import { ShortcutsHelpDialog } from "@/features/shell/ShortcutsHelpDialog";
import { SimulatorView } from "@/features/simulator/SimulatorView";
import { VersionDrawer } from "@/features/version-control/VersionDrawer";
import { isTauriRuntime } from "@/services/tauriBridge";
import {
  confirmExitAppWithGuard,
  hasUnsavedChanges,
} from "@/services/unsavedGuard";
import { useAppStore, type WorkspaceView } from "@/stores/useAppStore";

/**
 * MoKairos Studio 顶层应用外壳
 * 负责：视图动效切换、全局屏蔽浏览器默认右键菜单、窗口关闭未保存守卫、公共弹窗与 Toaster 挂载
 */

const VIEW_ORDER: Record<WorkspaceView, number> = {
  launchpad: 0,
  design: 1,
  simulate: 2,
  export: 3,
};

export default function App() {
  const view = useAppStore((s) => s.view);
  const prevViewRef = useRef<WorkspaceView>(view);
  const direction = VIEW_ORDER[view] >= VIEW_ORDER[prevViewRef.current] ? 1 : -1;

  useEffect(() => {
    prevViewRef.current = view;
  }, [view]);

  // 全局屏蔽浏览器默认右键菜单（仅在输入框与文本编辑区内保留原生菜单）
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
    };

    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const target = e.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      if (e.key === "?" || e.key === "F1") {
        e.preventDefault();
        const app = useAppStore.getState();
        app.setShortcutsModalOpen(!app.shortcutsModalOpen);
      }
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleGlobalShortcuts);
    };
  }, []);

  // 桌面窗口关闭 / 浏览器标签页关闭时的未保存更改守卫
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    let unlistenClose: (() => void) | null = null;
    if (isTauriRuntime()) {
      void getCurrentWindow()
        .onCloseRequested((event) => {
          if (hasUnsavedChanges()) {
            event.preventDefault();
            confirmExitAppWithGuard();
          }
        })
        .then((unlisten) => {
          unlistenClose = unlisten;
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlistenClose?.();
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div className="mk-theme-transition flex h-screen w-screen flex-col overflow-hidden bg-[var(--mk-bg-canvas)] text-[var(--mk-text-primary)]">
          <AppTitleBar />
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{
                  opacity: 0,
                  x: view === "launchpad" ? 0 : direction * 18,
                  y: view === "launchpad" ? 10 : 0,
                  scale: view === "launchpad" ? 0.992 : 1,
                }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  x: view === "launchpad" ? 0 : -direction * 14,
                  y: view === "launchpad" ? -8 : 0,
                }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-0 w-full flex-1 overflow-hidden"
              >
                {view === "launchpad" && <LaunchpadView />}
                {view === "design" && <EditorWorkspace />}
                {view === "simulate" && <SimulatorView />}
                {view === "export" && <ExportMockView />}
              </motion.div>
            </AnimatePresence>
          </div>
          <VersionDrawer />
          <NewProjectDialog />
          <SettingsDialog />
          <ShortcutsHelpDialog />
          <UnsavedChangesDialog />
          <Toaster />
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
