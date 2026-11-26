import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  FolderOutput,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Controls";
import { Badge } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import type { CodegenDiagnostic } from "@/domain/codegen/types";
import { useCodegenExport } from "@/hooks/useCodegenExport";
import { exportCurrentAsJson, exportCurrentAsRmui } from "@/services/projectActions";
import { useAppStore } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";

/**
 * 打包与导出页：统一诊断面板、生成文件预览、.mkui / MoKairosUI.cmake / C/C++ 源码直出与 RMUI 兼容导出
 */

export function ExportTab({
  onJumpToCode,
}: {
  onJumpToCode: (file: string, line?: number) => void;
}) {
  const filePath = useProjectStore((s) => s.filePath);
  const projectDirty = useProjectStore((s) => s.isDirty);
  const codegenDirty = useCodegenStore((s) => s.isDirty);
  const profile = useCodegenStore((s) => s.profile);
  const previewFiles = useCodegenStore((s) => s.previewFiles);
  const previewDiagnostics = useCodegenStore((s) => s.previewDiagnostics);
  const setActiveSubTab = useCodegenStore((s) => s.setActiveSubTab);
  const setActiveFlowId = useCodegenStore((s) => s.setActiveFlowId);

  const setView = useAppStore((s) => s.setView);
  const setActiveFrame = useDocumentStore((s) => s.setActiveFrame);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);

  const {
    busy,
    lastCmakeSnippet,
    lastCmakePath,
    lastSourcesDir,
    handleSaveMkui,
    handleExportCmake,
    handleExportSources,
  } = useCodegenExport();

  const [includeCustomScaffold, setIncludeCustomScaffold] = useState(true);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const errorCount = useMemo(
    () => previewDiagnostics.filter((d) => d.severity === "error").length,
    [previewDiagnostics],
  );
  const warnCount = useMemo(
    () => previewDiagnostics.filter((d) => d.severity === "warn").length,
    [previewDiagnostics],
  );

  const previewNames = useMemo(() => Object.keys(previewFiles).sort(), [previewFiles]);
  const activePreviewName =
    selectedPreviewFile && previewFiles[selectedPreviewFile] !== undefined
      ? selectedPreviewFile
      : (previewNames[0] ?? null);
  const activePreviewContent = activePreviewName ? previewFiles[activePreviewName] ?? "" : "";

  const handleJumpDiagnostic = (diag: CodegenDiagnostic) => {
    if (diag.frameId || diag.graphicId) {
      if (diag.frameId) setActiveFrame(diag.frameId);
      if (diag.graphicId) setSelectedIds([diag.graphicId]);
      setView("design");
      return;
    }
    if (diag.flowId) {
      setActiveFlowId(diag.flowId);
      setActiveSubTab("nodes");
      return;
    }
    if (diag.file) {
      const normalized = diag.file.replace(/^codegen\/code\//, "");
      onJumpToCode(normalized, diag.line);
      return;
    }
    setActiveSubTab("wizard");
  };

  const handleCopySnippet = async () => {
    if (!lastCmakeSnippet) return;
    await navigator.clipboard.writeText(lastCmakeSnippet);
    setCopiedSnippet(true);
    toast.success("已复制 CMake 调用片段");
    window.setTimeout(() => setCopiedSnippet(false), 1800);
  };

  return (
    <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
      {/* 左列：导出操作区 */}
      <div className="w-[380px] shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
        {/* 状态摘要 */}
        <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[var(--mk-text-primary)]">构建前校验门禁</h3>
            {errorCount === 0 ? (
              <Badge tone="ok">
                <CheckCircle2 className="w-3 h-3 mr-1" /> 可导出
              </Badge>
            ) : (
              <Badge tone="error">
                <AlertCircle className="w-3 h-3 mr-1" /> {errorCount} 个阻断错误
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-[var(--mk-text-muted)] space-y-1">
            <div>
              模式：<span className="text-[var(--mk-text-primary)] font-medium">{profile.mode}</span> ·
              通道：<span className="text-[var(--mk-text-primary)] font-medium">{profile.transport.kind}</span> ·
              符号前缀：<code className="text-[var(--mk-text-primary)]">{profile.prefix}</code>
            </div>
            <div>
              当前工程：
              <span className="text-[var(--mk-text-primary)] font-mono">
                {filePath ? filePath.replace(/\\/g, "/").split("/").pop() : "未保存草稿"}
              </span>
              {(projectDirty || codegenDirty) && (
                <span className="ml-1.5 text-[var(--mk-status-warn)]">（有未保存修改）</span>
              )}
            </div>
          </div>
        </section>

        {/* 动作 1：保存打包 .mkui */}
        <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-[var(--mk-accent-primary)]" />
            <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
              1. 打包并保存 .mkui 工程包
            </div>
          </div>
          <p className="text-[11px] text-[var(--mk-text-muted)] leading-relaxed">
            把图形设计、`codegen/profile.toml`、`codegen/code/*` 与 `codegen/lib/*` 覆写打包进 `.mkui`。整车仓库放入 `.mkui` 后，CMake 会检测其变更并自动重新生成 C/C++ 代码。
          </p>
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={busy}
            onClick={() => void handleSaveMkui()}
          >
            <Archive className="w-3.5 h-3.5" /> 保存工程包 (.mkui)
          </Button>
        </section>

        {/* 动作 2：导出 MoKairosUI.cmake */}
        <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-[var(--mk-accent-primary)]" />
            <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
              2. 导出 MoKairosUI.cmake（CMake 接入）
            </div>
          </div>
          <p className="text-[11px] text-[var(--mk-text-muted)] leading-relaxed">
            生成兼容 CMake 3.10+ 的工具链模块：支持 SHA256 校验、版本固定、自定义下载源、本地持久化离线缓存回退及 `BASE_LIB` 目录注入。
          </p>
          <Button
            variant="secondary"
            className="w-full justify-center"
            disabled={busy}
            onClick={() => void handleExportCmake()}
          >
            导出 MoKairosUI.cmake 到整车仓库…
          </Button>
          {lastCmakePath && (
            <div className="text-[11px] text-[var(--mk-text-muted)] font-mono truncate" title={lastCmakePath}>
              已写入：{lastCmakePath}
            </div>
          )}
          {lastCmakeSnippet && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--mk-text-secondary)]">
                  复制到整车 CMakeLists.txt：
                </span>
                <Button variant="ghost" size="sm" onClick={() => void handleCopySnippet()}>
                  {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedSnippet ? "已复制" : "复制"}
                </Button>
              </div>
              <pre className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-code)] p-2 text-[10px] font-mono text-[var(--mk-text-primary)] overflow-x-auto whitespace-pre-wrap">
                {lastCmakeSnippet}
              </pre>
            </div>
          )}
        </section>

        {/* 动作 3：直接导出 C/C++ 源码目录 */}
        <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-3.5 space-y-2.5">
          <div className="flex items-center gap-2">
            <FolderOutput className="w-4 h-4 text-[var(--mk-accent-primary)]" />
            <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
              3. 直接导出 C/C++ 源码目录（方案 1 + 3）
            </div>
          </div>
          <p className="text-[11px] text-[var(--mk-text-muted)] leading-relaxed">
            无需运行 CMake CLI，直接由内置 Rust 生成引擎清空并覆写 `generated/` 全部生成文件。
          </p>
          <div className="flex items-center justify-between rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] px-2.5 py-2">
            <div>
              <div className="text-xs text-[var(--mk-text-primary)]">首次生成 custom/ 用户骨架</div>
              <div className="text-[10px] text-[var(--mk-text-muted)]">仅当 custom/ 文件不存在时创建一次，绝不覆盖已有手写代码</div>
            </div>
            <Switch checked={includeCustomScaffold} onCheckedChange={setIncludeCustomScaffold} />
          </div>
          <Button
            variant="primary"
            className="w-full justify-center"
            disabled={busy || errorCount > 0}
            onClick={() => void handleExportSources(includeCustomScaffold)}
          >
            {errorCount > 0 ? "请先修复阻断错误后再导出源码" : "直接导出 generated/ 源码到目录…"}
          </Button>
          {lastSourcesDir && (
            <div className="text-[11px] text-[var(--mk-text-muted)] font-mono truncate" title={lastSourcesDir}>
              最近导出：{lastSourcesDir}
            </div>
          )}
        </section>

        {/* 动作 4：RMUI / JSON 兼容导出 */}
        <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/60 p-3 space-y-2">
          <div className="text-[11px] font-medium text-[var(--mk-text-secondary)]">
            旧版格式兼容导出
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => void exportCurrentAsRmui()}>
              导出 .rmui
            </Button>
            <Button variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => void exportCurrentAsJson()}>
              导出 .json
            </Button>
          </div>
        </section>
      </div>

      {/* 右列：统一诊断列表 + 生成文件即时预览 */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">
        {/* 诊断列表 */}
        <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 p-3 flex flex-col max-h-[240px]">
          <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
            <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
              统一校验诊断（协议预检 + 配置绑定 + DAG 节点图 + 代码文件）
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Badge tone={errorCount > 0 ? "error" : "neutral"}>{errorCount} 错误</Badge>
              <Badge tone={warnCount > 0 ? "warn" : "neutral"}>{warnCount} 警告</Badge>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            {previewDiagnostics.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-[var(--mk-status-ok)] py-2">
                <CheckCircle2 className="w-4 h-4" />
                未发现配置错误或警告，生成产物随时可编译接入。
              </div>
            ) : (
              previewDiagnostics.map((d, idx) => (
                <button
                  key={`${d.code}-${idx}`}
                  type="button"
                  onClick={() => handleJumpDiagnostic(d)}
                  className={cn(
                    "w-full text-left rounded-[var(--mk-radius-md)] border px-2.5 py-2 transition-colors flex items-start gap-2",
                    d.severity === "error"
                      ? "border-[var(--mk-status-error)]/40 bg-[var(--mk-status-error-tint)] hover:bg-[var(--mk-status-error)]/20"
                      : "border-[var(--mk-status-warn)]/35 bg-[var(--mk-status-warn-tint)] hover:bg-[var(--mk-status-warn)]/20",
                  )}
                >
                  {d.severity === "error" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-[var(--mk-status-error)] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-[var(--mk-status-warn)] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-[var(--mk-text-primary)]">
                        {d.code}
                      </span>
                      {d.location && (
                        <span className="font-mono text-[10px] text-[var(--mk-text-muted)] truncate">
                          @ {d.location}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[var(--mk-accent-primary)] shrink-0">
                        点击定位
                      </span>
                    </div>
                    <div className="text-xs text-[var(--mk-text-primary)] mt-0.5">{d.message}</div>
                    {d.detail && (
                      <div className="text-[11px] text-[var(--mk-text-muted)] mt-0.5">{d.detail}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        {/* 生成文件只读预览 */}
        <section className="flex-1 min-h-0 rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--mk-border-subtle)] flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-[11px] font-semibold text-[var(--mk-text-secondary)] shrink-0">
              generated/ 预览：
            </span>
            {previewNames.length === 0 ? (
              <span className="text-[11px] text-[var(--mk-text-muted)]">
                暂无预览文件（请修复阻断错误或在 Tauri 桌面端查看完整生成结果）
              </span>
            ) : (
              previewNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedPreviewFile(name)}
                  className={cn(
                    "px-2 py-1 rounded-[var(--mk-radius-sm)] text-[11px] font-mono transition-colors shrink-0",
                    activePreviewName === name
                      ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)] font-medium"
                      : "text-[var(--mk-text-muted)] hover:text-[var(--mk-text-primary)]",
                  )}
                >
                  {name}
                </button>
              ))
            )}
          </div>
          <pre className="flex-1 min-h-0 overflow-auto p-3 text-[11px] leading-relaxed font-mono text-[var(--mk-text-primary)] bg-[var(--mk-bg-code)]">
            {activePreviewContent || "// 选择左侧生成文件即可预览（仅桌面端与 CLI 生成完整 C/C++ 代码）"}
          </pre>
        </section>
      </div>
    </div>
  );
}
