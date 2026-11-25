import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Cpu,
  FileArchive,
  FolderOpen,
  FolderUp,
  Home,
  Keyboard,
  LayoutTemplate,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import clientBgUrl from "@/assets/rm-client-background.png";
import { getRobotRoleMeta, type RobotRole2027 } from "@/domain/protocol/constants";
import { STARTER_TEMPLATES } from "@/domain/templates/starterTemplates";
import { Badge } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import {
  createNewProjectFromWizard,
  importRmuiProject,
  openProjectByPath,
  openProjectWithDialog,
} from "@/services/projectActions";
import { useAppStore } from "@/stores/useAppStore";
import { useProjectStore } from "@/stores/useProjectStore";

/**
 * 工程大厅（Home Launchpad）
 * 提供新建 HUD 工程、打开 .mkui、兼容导入 .rmui、兵种模板快速启动与最近工程管理
 */

type LaunchpadSection = "home" | "templates" | "cmake_mock";

const ROLE_FILTERS: ReadonlyArray<{ id: "all" | RobotRole2027; label: string }> = [
  { id: "all", label: "全部" },
  { id: "infantry_3", label: "步兵" },
  { id: "heavy_1", label: "重装" },
  { id: "aerial_6", label: "空中" },
  { id: "sentry_7", label: "哨兵" },
];

export function LaunchpadView() {
  const openNewProjectModal = useAppStore((s) => s.openNewProjectModal);
  const setView = useAppStore((s) => s.setView);
  const setShortcutsModalOpen = useAppStore((s) => s.setShortcutsModalOpen);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const refreshRecentProjects = useProjectStore((s) => s.refreshRecentProjects);
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject);
  const hasOpenProject = useProjectStore((s) => s.hasOpenProject);

  const [section, setSection] = useState<LaunchpadSection>("home");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RobotRole2027>("all");

  useEffect(() => {
    void refreshRecentProjects();
  }, [refreshRecentProjects]);

  const filteredRecent = useMemo(() => {
    return recentProjects.filter((item) => {
      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "infantry_3"
          ? item.robotRole.startsWith("infantry")
          : item.robotRole === roleFilter);
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.filePath.toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [recentProjects, roleFilter, search]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--mk-bg-canvas)]">
      {/* 左侧导航栏 */}
      <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-3">
        <div className="space-y-4">
          <Button
            variant="primary"
            size="lg"
            className="w-full justify-center"
            onClick={() => openNewProjectModal("infantry_combat")}
          >
            <Plus className="h-4 w-4" />
            新建 HUD 工程
          </Button>

          <nav className="space-y-1 text-xs">
            {[
              { id: "home" as const, label: "工作空间首页", icon: Home },
              { id: "templates" as const, label: "2027 兵种模板", icon: LayoutTemplate },
              { id: "cmake_mock" as const, label: "CMake 工具集概览", icon: Cpu },
            ].map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[var(--mk-radius-sm)] px-2.5 py-2 font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]"
                      : "text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                if (hasOpenProject) {
                  setView("simulate");
                } else {
                  void createNewProjectFromWizard({
                    templateId: "infantry_combat",
                    name: "Quick_Sim_HUD",
                    robotRole: "infantry_3",
                    targetView: "simulate",
                  });
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[var(--mk-radius-sm)] px-2.5 py-2 font-medium text-[var(--mk-text-secondary)] transition-colors hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
            >
              <Radio className="h-4 w-4" />
              <span>启动 HUD 模拟器</span>
            </button>

            <button
              type="button"
              onClick={() => setShortcutsModalOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-[var(--mk-radius-sm)] px-2.5 py-2 font-medium text-[var(--mk-text-secondary)] transition-colors hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
            >
              <Keyboard className="h-4 w-4" />
              <span>快捷键操作指南</span>
            </button>
          </nav>
        </div>

        {/* 底部整车固件关联占位提示卡 */}
        <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--mk-text-primary)]">
              UICRM-Embedded 对接
            </span>
            <Badge tone="warn">模拟阶段</Badge>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--mk-text-secondary)]">
            当前聚焦完成编辑、`.mkui`（ZIP + MessagePack）打包、导出与版本控制；CMake 自动加载处于模拟预览阶段。
          </p>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <main className="mk-launchpad-liquid-ambient min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* 搜索栏 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-[var(--mk-text-primary)]">
                {section === "home" && "工作空间首页"}
                {section === "templates" && "2027 兵种预设模板"}
                {section === "cmake_mock" && "CMake 工具集接入规划（模拟说明）"}
              </h1>
              <p className="mt-0.5 text-xs text-[var(--mk-text-secondary)]">
                1920×1080 裁判系统标准画布 · 8 类基本图元 · 9 色协议隔离 · .mkui 压缩包归档
              </p>
            </div>
            <div className="relative w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--mk-text-muted)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索最近工程名或路径…"
                className="h-8 pl-8"
              />
            </div>
          </div>

          {/* 快捷动作三联卡 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              onClick={() => openNewProjectModal("infantry_combat")}
              className="group flex items-start gap-3 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4 text-left transition-colors hover:border-[var(--mk-border-focus)] cursor-pointer"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--mk-radius-md)] bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  新建 1920×1080 HUD
                </div>
                <div className="mt-1 text-xs text-[var(--mk-text-secondary)]">
                  选择 2027 兵种与 1920×1080 标准初始模板
                </div>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              onClick={() => void openProjectWithDialog()}
              className="group flex items-start gap-3 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4 text-left transition-colors hover:border-[var(--mk-border-focus)] cursor-pointer"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--mk-radius-md)] bg-[var(--mk-bg-surface)] text-[var(--mk-text-primary)]">
                <FolderOpen className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  打开 .mkui 工程包
                </div>
                <div className="mt-1 text-xs text-[var(--mk-text-secondary)]">
                  解包 MessagePack 设计数据与完整历史版本快照
                </div>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16 }}
              onClick={() => void importRmuiProject()}
              className="group flex items-start gap-3 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4 text-left transition-colors hover:border-[var(--mk-border-focus)] cursor-pointer"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--mk-radius-md)] bg-[var(--mk-bg-surface)] text-[var(--mk-text-primary)]">
                <FolderUp className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  兼容导入 .rmui 工程
                </div>
                <div className="mt-1 text-xs text-[var(--mk-text-secondary)]">
                  无损迁移 RM-UI-Designer 历史设计稿并自动规范化
                </div>
              </div>
            </motion.button>
          </div>

          {section === "home" && (
            <>
              {/* 最近工程 */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--mk-text-primary)]">
                    最近工程
                  </h2>
                  <div className="flex items-center gap-1">
                    {ROLE_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setRoleFilter(f.id)}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                          roleFilter === f.id
                            ? "bg-[var(--mk-accent-primary)] text-[var(--mk-accent-on-primary)]"
                            : "bg-[var(--mk-bg-panel)] text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)]",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredRecent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[var(--mk-radius-lg)] border border-dashed border-[var(--mk-border-strong)] bg-[var(--mk-bg-panel)]/60 py-12 text-center">
                    <FileArchive className="h-8 w-8 text-[var(--mk-text-muted)]" />
                    <div className="mt-3 text-sm font-medium text-[var(--mk-text-primary)]">
                      暂无已保存的最近工程记录
                    </div>
                    <p className="mt-1 max-w-md text-xs text-[var(--mk-text-secondary)]">
                      你可以立即从下方模板新建 1920×1080 画布，或点击「导入 .rmui 工程」迁移已有设计并保存为 `.mkui`。
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="primary"
                        onClick={() => openNewProjectModal("infantry_combat")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新建工程
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void importRmuiProject()}
                      >
                        导入 .rmui
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredRecent.map((item) => {
                      const roleMeta = getRobotRoleMeta(item.robotRole);
                      return (
                        <div
                          key={item.filePath}
                          className="group relative overflow-hidden rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] transition-all hover:border-[var(--mk-border-focus)]"
                        >
                          <div
                            onClick={() => void openProjectByPath(item.filePath)}
                            className="relative aspect-video cursor-pointer overflow-hidden bg-[#1b2230]"
                          >
                            <img
                              src={clientBgUrl}
                              alt="RM Client"
                              className="h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                            <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between">
                              <Badge tone="accent">{roleMeta.shortLabel}</Badge>
                              <Badge tone="neutral" className="mk-tabular">
                                {item.graphicCount} 图元 · v{item.commitCount}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-[var(--mk-text-primary)]">
                                {item.name}
                              </div>
                              <div className="mk-tabular mt-0.5 truncate text-[10px] text-[var(--mk-text-muted)]">
                                {item.filePath}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="从最近列表移除"
                              onClick={() => void removeRecentProject(item.filePath)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 兵种预设模板速览 */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  从 2027 兵种模板快速启动
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {STARTER_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() =>
                        void createNewProjectFromWizard({
                          templateId: tpl.id,
                          name: tpl.name.replace(/\s+/g, "_"),
                          robotRole: tpl.recommendedRole,
                        })
                      }
                      className="flex flex-col justify-between rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-3.5 text-left transition-all hover:border-[var(--mk-border-focus)] cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--mk-text-primary)]">
                            {tpl.name}
                          </span>
                          <Badge tone="accent">{tpl.badge}</Badge>
                        </div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--mk-text-secondary)]">
                          {tpl.subtitle}
                        </p>
                      </div>
                      <span className="mt-3 text-[11px] font-medium text-[var(--mk-accent-primary)]">
                        一键创建 →
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {section === "templates" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {STARTER_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex flex-col justify-between rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[var(--mk-text-primary)]">
                        {tpl.name}
                      </h3>
                      <Badge tone="accent">{tpl.badge}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--mk-text-secondary)]">
                      {tpl.subtitle}
                    </p>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openNewProjectModal(tpl.id)}
                    >
                      自定义工程名…
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        void createNewProjectFromWizard({
                          templateId: tpl.id,
                          name: tpl.name.replace(/\s+/g, "_"),
                          robotRole: tpl.recommendedRole,
                        })
                      }
                    >
                      直接打开
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === "cmake_mock" && (
            <div className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-5 text-xs leading-relaxed text-[var(--mk-text-secondary)]">
              <div className="mb-3 flex items-center gap-2">
                <Badge tone="warn">模拟预览阶段</Badge>
                <span className="font-semibold text-[var(--mk-text-primary)]">
                  配套 CMake 自动解包 `.mkui` 与 `UICRM-Embedded` 变量映射路线
                </span>
              </div>
              <p>
                MoKairos Studio 产出的 `.mkui` 文件本质为标准 ZIP 压缩包，内置明文 `manifest.json` 与紧凑的 `design.msgpack`。后续将由配套 CMake 模块在构建期自动读取 `.mkui` 并生成 `ui/&lt;project&gt;.h`，固件端仅需传入 `bsp::UART` 初始化并通过 `varKey` 映射更新 UI 数值。
              </p>
              <div className="mt-4">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    void createNewProjectFromWizard({
                      templateId: "infantry_combat",
                      name: "Infantry_CMake_Preview",
                      robotRole: "infantry_3",
                      targetView: "export",
                    })
                  }
                >
                  前往导出模拟页体验 →
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
