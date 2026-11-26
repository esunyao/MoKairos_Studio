import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Code2,
  Cpu,
  Network,
  PackageCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { LiquidGlassSurface } from "@/components/ui/liquid-glass";
import { useCodegenPreview } from "@/hooks/useCodegenPreview";
import { type CodegenSubTab, useCodegenStore } from "@/stores/useCodegenStore";
import { CodeTab } from "./CodeTab";
import { ExportTab } from "./ExportTab";
import { FlowTab } from "./FlowTab";
import { WizardTab } from "./WizardTab";

/**
 * 代码生成总工作台（向导配置 / React Flow 节点编排 / Monaco 纯代码与基底编辑 / 打包导出）
 */

const SUB_TABS: ReadonlyArray<{
  id: CodegenSubTab;
  label: string;
  subtitle: string;
  icon: typeof SlidersHorizontal;
}> = [
  { id: "wizard", label: "配置向导", subtitle: "预设、通道与符号", icon: SlidersHorizontal },
  { id: "nodes", label: "节点编排", subtitle: "Dify 式拓扑逻辑", icon: Network },
  { id: "code", label: "纯代码 / 基底", subtitle: "Monaco 双向同步", icon: Code2 },
  { id: "export", label: "打包与导出", subtitle: "CMake 与源码直出", icon: PackageCheck },
];

export function CodegenView() {
  const activeSubTab = useCodegenStore((s) => s.activeSubTab);
  const setActiveSubTab = useCodegenStore((s) => s.setActiveSubTab);
  const bootstrapMetadata = useCodegenStore((s) => s.bootstrapMetadata);
  const profile = useCodegenStore((s) => s.profile);
  const previewFiles = useCodegenStore((s) => s.previewFiles);
  const previewDiagnostics = useCodegenStore((s) => s.previewDiagnostics);

  const [codeJump, setCodeJump] = useState<{ file: string; line?: number; nonce: number } | null>(
    null,
  );

  useEffect(() => {
    void bootstrapMetadata();
  }, [bootstrapMetadata]);

  const { loading } = useCodegenPreview();

  const errorCount = useMemo(
    () => previewDiagnostics.filter((d) => d.severity === "error").length,
    [previewDiagnostics],
  );
  const warnCount = useMemo(
    () => previewDiagnostics.filter((d) => d.severity === "warn").length,
    [previewDiagnostics],
  );

  const handleOpenCodeFile = (file: string, line?: number) => {
    setCodeJump((prev) => ({ file, line, nonce: (prev?.nonce ?? 0) + 1 }));
    setActiveSubTab("code");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      {/* 顶部子标签导航与状态条 */}
      <LiquidGlassSurface
        variant="bar"
        cornerRadius={14}
        elastic={false}
        lightweight
        className="shrink-0"
        contentClassName="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[var(--mk-radius-md)] bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)] flex items-center justify-center">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
              通用 RM UI 代码生成工作台
            </div>
            <div className="text-[10px] text-[var(--mk-text-muted)]">
              模式：{profile.mode === "mapping" ? "映射驱动 (Mapping)" : "纯数据接口 (API)"} ·
              通道：{profile.transport.kind === "frame" ? "整帧 Write+CRC" : "Payload 复用发送"} ·
              前缀：<code className="text-[var(--mk-text-secondary)]">{profile.prefix}</code>
            </div>
          </div>
        </div>

        {/* 4 个工作流子页签 */}
        <div className="flex items-center gap-1 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]/50 p-1">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={cn(
                  "px-2.5 py-1.5 rounded-[var(--mk-radius-sm)] text-xs transition-colors flex items-center gap-1.5",
                  active
                    ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)] font-medium"
                    : "text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)] hover:bg-[var(--mk-bg-surface-hover)]",
                )}
                title={tab.subtitle}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === "export" && errorCount > 0 && (
                  <AlertCircle className="w-3 h-3 text-[var(--mk-status-error)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* 实时校验概况 */}
        <div className="flex items-center gap-1.5">
          {loading && (
            <Badge tone="accent">生成预览中…</Badge>
          )}
          <Badge tone={errorCount > 0 ? "error" : "ok"}>
            {errorCount > 0 ? `${errorCount} 错误` : "校验通过"}
          </Badge>
          {warnCount > 0 && <Badge tone="warn">{warnCount} 警告</Badge>}
          <Badge tone="neutral">{Object.keys(previewFiles).length} 生成文件</Badge>
        </div>
      </LiquidGlassSurface>

      {/* 子页面主内容 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeSubTab === "wizard" && <WizardTab />}
        {activeSubTab === "nodes" && (
          <FlowTab onOpenCodeFile={(file, line) => handleOpenCodeFile(file, line)} />
        )}
        {activeSubTab === "code" && (
          <CodeTab
            initialFile={codeJump?.file}
            initialLine={codeJump?.line}
            jumpNonce={codeJump?.nonce}
          />
        )}
        {activeSubTab === "export" && (
          <ExportTab onJumpToCode={(file, line) => handleOpenCodeFile(file, line)} />
        )}
      </div>
    </div>
  );
}
