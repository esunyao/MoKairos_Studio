import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/Controls";
import { EditorWorkspace } from "@/features/editor/EditorWorkspace";
import { ExportMockView } from "@/features/export-mock/ExportMockView";
import { LaunchpadView } from "@/features/launchpad/LaunchpadView";
import { NewProjectDialog } from "@/features/launchpad/NewProjectDialog";
import { SettingsDialog } from "@/features/launchpad/SettingsDialog";
import { AppTitleBar } from "@/features/shell/AppTitleBar";
import { ToastHost } from "@/features/shell/ToastHost";
import { SimulatorView } from "@/features/simulator/SimulatorView";
import { VersionDrawer } from "@/features/version-control/VersionDrawer";
import { useAppStore } from "@/stores/useAppStore";

/**
 * MoKairos Studio 顶层应用外壳与视图分发器
 */

export default function App() {
  const view = useAppStore((s) => s.view);

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div className="mk-theme-transition flex h-screen w-screen flex-col overflow-hidden bg-[var(--mk-bg-canvas)] text-[var(--mk-text-primary)]">
          <AppTitleBar />
          {view === "launchpad" && <LaunchpadView />}
          {view === "design" && <EditorWorkspace />}
          {view === "simulate" && <SimulatorView />}
          {view === "export" && <ExportMockView />}
          <VersionDrawer />
          <NewProjectDialog />
          <SettingsDialog />
          <ToastHost />
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
