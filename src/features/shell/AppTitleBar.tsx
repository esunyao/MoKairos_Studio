import { motion } from "motion/react";
import {
  Cpu,
  Droplets,
  GitBranch,
  Home,
  Keyboard,
  Layers,
  Moon,
  Radio,
  Redo2,
  Save,
  Settings,
  Sun,
  Undo2,
  Wrench,
} from "lucide-react";
import { TeamToggle } from "@/components/protocol/TeamToggle";
import { Button } from "@/components/ui/Button";
import { SimpleSelect, Tooltip } from "@/components/ui/Controls";
import { cn } from "@/components/ui/cn";
import { LiquidGlassSurface } from "@/components/ui/liquid-glass";
import { saveCurrentProject } from "@/services/projectActions";
import { navigateToLaunchpadWithGuard } from "@/services/unsavedGuard";
import { useAppStore, type WorkspaceView } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useVersionStore } from "@/stores/useVersionStore";

/**
 * 44px 半透明磨砂玻璃顶部主控栏
 * 承担工作流三态切换（带未保存离开守卫的返回大厅）、撤销重做、阵营切换、版本抽屉、快捷键指南与明暗主题切换
 */

const WORKSPACE_TABS: ReadonlyArray<{
  id: Exclude<WorkspaceView, "launchpad">;
  label: string;
  icon: typeof Wrench;
}> = [
  { id: "design", label: "编辑", icon: Wrench },
  { id: "simulate", label: "模拟", icon: Radio },
  { id: "export", label: "导出", icon: Cpu },
];

export function AppTitleBar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const surfaceStyle = useAppStore((s) => s.surfaceStyle);
  const toggleSurfaceStyle = useAppStore((s) => s.toggleSurfaceStyle);
  const setVersionDrawerOpen = useAppStore((s) => s.setVersionDrawerOpen);
  const versionDrawerOpen = useAppStore((s) => s.versionDrawerOpen);
  const setSettingsModalOpen = useAppStore((s) => s.setSettingsModalOpen);
  const setShortcutsModalOpen = useAppStore((s) => s.setShortcutsModalOpen);

  const doc = useDocumentStore((s) => s.doc);
  const setActiveFrame = useDocumentStore((s) => s.setActiveFrame);
  const canUndo = useDocumentStore((s) => s.past.length > 0);
  const canRedo = useDocumentStore((s) => s.future.length > 0);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);

  const hasOpenProject = useProjectStore((s) => s.hasOpenProject);
  const isDirty = useProjectStore((s) => s.isDirty);

  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const setPreviewTeam = useCanvasStore((s) => s.setPreviewTeam);

  const commitCount = useVersionStore((s) => s.index.commits.length);

  return (
    <header className="relative z-30 h-[var(--mk-topbar-height)] shrink-0">
      <LiquidGlassSurface
        variant="bar"
        cornerRadius={0}
        elastic={false}
        className="h-full w-full border-b"
        contentClassName="flex h-full w-full items-center justify-between px-3"
      >
        {/* 左侧：品牌 + 带守卫的返回大厅 + 工程/画面选择 */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={navigateToLaunchpadWithGuard}
          className="flex items-center gap-2 rounded-[var(--mk-radius-sm)] px-1.5 py-1 transition-colors hover:bg-[var(--mk-bg-surface-hover)] cursor-pointer"
          title="返回工程大厅"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[var(--mk-accent-primary)] text-xs font-bold text-[var(--mk-accent-on-primary)]">
            M
          </span>
          <span className="hidden text-xs font-semibold tracking-tight text-[var(--mk-text-primary)] sm:inline">
            MoKairos Studio
          </span>
        </button>

        {view !== "launchpad" && (
          <>
            <span className="h-4 w-px bg-[var(--mk-border-subtle)]" />
            <Tooltip content="返回工程大厅">
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateToLaunchpadWithGuard}
                aria-label="工程大厅"
              >
                <Home className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>

            <div className="flex items-center gap-1.5 truncate text-xs">
              <span className="max-w-[160px] truncate font-medium text-[var(--mk-text-primary)]">
                {doc.name}
              </span>
              {isDirty && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-[var(--mk-status-warn)]"
                  title="有未保存更改"
                />
              )}
            </div>

            {doc.frames.length > 0 && (
              <div className="hidden w-36 md:block">
                <SimpleSelect
                  value={doc.activeFrameId}
                  onValueChange={setActiveFrame}
                  options={doc.frames.map((f) => ({
                    value: f.id,
                    label: `画面: ${f.name}`,
                  }))}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 中间：三态工作流切换滑块（工程大厅时隐藏） */}
      {view !== "launchpad" ? (
        <nav className="flex h-8 items-center rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-0.5">
          {WORKSPACE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className={cn(
                  "relative flex h-full items-center gap-1.5 rounded-[7px] px-3.5 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "text-[var(--mk-text-primary)]"
                    : "text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)]",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="workspace-tab-pill"
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    className="absolute inset-0 rounded-[7px] border border-[var(--mk-border-strong)] bg-[var(--mk-bg-panel)] shadow-sm"
                  />
                )}
                <Icon className="relative z-10 h-3.5 w-3.5" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      ) : (
        <div className="text-xs text-[var(--mk-text-muted)]">
          RoboMaster 2027 协议 HUD 桌面工作台
        </div>
      )}

      {/* 右侧：撤销重做、版本控制、阵营切换、快捷键指南、明暗切换、保存 */}
      <div className="flex items-center gap-1.5">
        {view !== "launchpad" && (
          <>
            {view === "design" && (
              <div className="hidden items-center gap-0.5 sm:flex">
                <Tooltip content="撤销 (Ctrl+Z)">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!canUndo}
                    onClick={undo}
                    aria-label="撤销"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
                <Tooltip content="重做 (Ctrl+Shift+Z)">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!canRedo}
                    onClick={redo}
                    aria-label="重做"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              </div>
            )}

            <TeamToggle
              team={previewTeam}
              onChange={setPreviewTeam}
              layoutId="topbar-team-pill"
            />

            <Tooltip content="版本历史与快照对比">
              <Button
                variant={versionDrawerOpen ? "primary" : "secondary"}
                size="sm"
                onClick={() => setVersionDrawerOpen(!versionDrawerOpen)}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">版本</span>
                <span className="mk-tabular rounded-full bg-black/20 px-1.5 py-0.2 text-[10px]">
                  {commitCount}
                </span>
              </Button>
            </Tooltip>

            <Tooltip content="保存 .mkui 压缩包 (Ctrl+S)">
              <Button
                variant="primary"
                size="sm"
                onClick={() => void saveCurrentProject(false)}
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">保存 .mkui</span>
              </Button>
            </Tooltip>
          </>
        )}

        {view === "launchpad" && hasOpenProject && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setView("design")}
          >
            回到当前编辑
          </Button>
        )}

        <Tooltip content="快捷键与键鼠操作指南 (? / F1)">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShortcutsModalOpen(true)}
            aria-label="快捷键指南"
          >
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>

        <Tooltip
          content={
            surfaceStyle === "liquid"
              ? "当前：液态玻璃质感（点击切换为普通质感）"
              : "当前：普通非液态质感（点击切换为液态玻璃）"
          }
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSurfaceStyle}
            aria-label="切换液态玻璃质感"
          >
            {surfaceStyle === "liquid" ? (
              <Droplets className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
          </Button>
        </Tooltip>

        <Tooltip content={theme === "dark" ? "切换到浅色模式" : "切换到暗色模式"}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="切换明暗主题"
          >
            {theme === "dark" ? (
              <Sun className="h-3.5 w-3.5 text-[var(--mk-status-warn)]" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
        </Tooltip>

        <Tooltip content="应用偏好与作者设置">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsModalOpen(true)}
            aria-label="设置"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
      </LiquidGlassSurface>
    </header>
  );
}
