import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  FileCode2,
  FolderOutput,
  LocateFixed,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Badge, Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { preflightDocument } from "@/domain/protocol/preflight";
import type { MkuiDocument, PreflightIssue } from "@/domain/protocol/types";
import { useDocumentDiagnostics } from "@/hooks/useDocumentDiagnostics";
import {
  exportCurrentAsJson,
  exportCurrentAsRmui,
  saveCurrentProject,
} from "@/services/projectActions";
import { invokeCommand, isTauriRuntime } from "@/services/tauriBridge";
import { useAppStore } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";

/**
 * CMake 与代码生成模拟页 + 真实协议预检与 .mkui 导出中心
 * 说明：
 * - 阶段 1（协议预检）与阶段 3（导出 .mkui / .rmui / .json）为真实可执行功能；
 * - 阶段 2（CMakeLists.txt 与 UICRM-Embedded C++ 变量映射预览）与「写入整车 ui/」为交互模拟页面，绝不修改外部仓库。
 */

function toSafeSymbol(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned.toLowerCase() : `ui_${cleaned.toLowerCase()}`;
}

function buildMockArtifactFiles(doc: MkuiDocument, targetName: string): Record<string, string> {
  const safeTarget = toSafeSymbol(targetName || doc.name);
  const dynamicVars = doc.frames.flatMap((f) =>
    f.graphics
      .filter((g) => g.dynamic)
      .map((g) => ({
        frame: f.name,
        key: g.varKey || g.figureName,
        kind: g.kind,
        display: g.displayName,
      })),
  );

  const cmakeTxt = `# [模拟预览] 由配套 MoKairos CMake 工具集在构建期读取 .mkui 生成
# 开发者只需将 ${doc.name}.mkui 放入工程 ui/ 目录并包含本工具模块
cmake_minimum_required(VERSION 3.16)

mokairos_add_ui_target(${safeTarget}
    MKUI_FILE "\${CMAKE_CURRENT_SOURCE_DIR}/${doc.name}.mkui"
    OUTPUT_HEADER_DIR "\${CMAKE_CURRENT_BINARY_DIR}/generated/include"
)

target_link_libraries(\${ROBOT_FIRMWARE_TARGET} PRIVATE ${safeTarget})
`;

  const headerFile = `// [模拟预览] #include "ui/${safeTarget}.h"
#pragma once
#include <cstdint>
#include "bsp_uart.h"
#include "referee.h"

namespace ui {

class ${safeTarget}_hud {
  public:
    // 传入 UICRM-Embedded 的串口与裁判系统实例快速初始化
    void init(bsp::UART* referee_uart, referee::Referee* ref);

    // 通过变量键或 Map 实时更新 UI 显示
    void set(const char* var_key, float value);
    void set(const char* var_key, int32_t value);
    void set(const char* var_key, const char* text);
    void poll(uint32_t now_ms);
};

} // namespace ui
`;

  const exampleCpp = `// [模拟预览] 整车固件调用示意（配套 UICRM-Embedded）
#include "ui/${safeTarget}.h"

static ui::${safeTarget}_hud hud;

void init_robot_ui(bsp::UART* uart2, referee::Referee* referee) {
    hud.init(uart2, referee);
}

void ui_task_tick(uint32_t now_ms) {
${
  dynamicVars.length > 0
    ? dynamicVars
        .slice(0, 5)
        .map((v) =>
          v.kind === "text"
            ? `    hud.set("${v.key}", "READY"); // ${v.display}`
            : `    hud.set("${v.key}", 86.5f);   // ${v.display}`,
        )
        .join("\n")
    : '    hud.set("status", 1);'
}
    hud.poll(now_ms);
}
`;

  return {
    "CMakeLists.txt": cmakeTxt,
    [`include/ui/${safeTarget}.h`]: headerFile,
    "src/ui_task_example.cpp": exampleCpp,
  };
}

export function ExportMockView() {
  const doc = useDocumentStore((s) => s.doc);
  const setActiveFrame = useDocumentStore((s) => s.setActiveFrame);
  const setView = useAppStore((s) => s.setView);
  const pushToast = useAppStore((s) => s.pushToast);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const filePath = useProjectStore((s) => s.filePath);
  const lastArchiveBytes = useProjectStore((s) => s.lastArchiveBytes);
  const lastMsgpackBytes = useProjectStore((s) => s.lastMsgpackBytes);

  const { budget } = useDocumentDiagnostics();

  const [issues, setIssues] = useState<PreflightIssue[]>(() =>
    preflightDocument(doc),
  );
  const [targetName, setTargetName] = useState("infantry_ui");
  const [mockVehiclePath, setMockVehiclePath] = useState(
    "UICRM-Embedded/programs/infantry/ui/ (演示路径)",
  );
  const [mockWriteDialogOpen, setMockWriteDialogOpen] = useState(false);

  // 调用 Rust 权威预检（浏览器模式回退 TS 预检）
  useEffect(() => {
    let active = true;
    const runPreflight = async () => {
      if (isTauriRuntime()) {
        try {
          const report = await invokeCommand<{ issues: PreflightIssue[] }>(
            "protocol_preflight",
            { document: doc },
          );
          if (active) setIssues(report.issues);
          return;
        } catch {
          // 回退 TS 预检
        }
      }
      if (active) {
        setIssues(preflightDocument(doc));
      }
    };
    void runPreflight();
    return () => {
      active = false;
    };
  }, [doc]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;

  const mockFiles = useMemo(
    () => buildMockArtifactFiles(doc, targetName),
    [doc, targetName],
  );
  const fileNames = Object.keys(mockFiles);
  const [activePreviewFile, setActivePreviewFile] = useState(fileNames[0]);

  useEffect(() => {
    if (!mockFiles[activePreviewFile]) {
      setActivePreviewFile(fileNames[0]);
    }
  }, [mockFiles, activePreviewFile, fileNames]);

  const handleLocateIssue = (issue: PreflightIssue) => {
    if (issue.frameId) {
      setActiveFrame(issue.frameId);
    }
    if (issue.graphicId) {
      setSelectedIds([issue.graphicId]);
    }
    setView("design");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--mk-bg-canvas)]">
      {/* 模拟页边界提示条 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mk-border-subtle)] bg-[var(--mk-status-warn-tint)] px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-[var(--mk-text-primary)]">
          <Badge tone="warn">CMake 接入模拟页</Badge>
          <span>
            协议预检与 `.mkui`（ZIP + MessagePack）打包导出为真实功能；CMake 与 C++ 头文件展示为配套工具链接口模拟预览，不会改动外部仓库。
          </span>
        </div>
        <span className="mk-tabular text-[11px] text-[var(--mk-text-secondary)]">
          当前路径：{filePath ?? "尚未保存 .mkui"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 左栏：三阶段流水线与包预算 */}
        <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-3.5 text-xs">
          <div className="space-y-4">
            <div className="font-semibold text-[var(--mk-text-primary)]">
              交付流水线
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    errorCount === 0
                      ? "bg-[var(--mk-status-ok-tint)] text-[var(--mk-status-ok)]"
                      : "bg-[var(--mk-status-error-tint)] text-[var(--mk-status-error)]",
                  )}
                >
                  1
                </span>
                <div>
                  <div className="font-medium text-[var(--mk-text-primary)]">
                    协议预检门禁（真实）
                  </div>
                  <div className="mk-tabular text-[11px] text-[var(--mk-text-secondary)]">
                    {errorCount} 错误 · {warnCount} 警告
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--mk-accent-primary-tint)] text-[10px] font-bold text-[var(--mk-accent-primary)]">
                  2
                </span>
                <div>
                  <div className="font-medium text-[var(--mk-text-primary)]">
                    CMake / C++ 接口预览（模拟）
                  </div>
                  <div className="text-[11px] text-[var(--mk-text-secondary)]">
                    演示 `#include "ui/..."` 形态
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--mk-status-ok-tint)] text-[10px] font-bold text-[var(--mk-status-ok)]">
                  3
                </span>
                <div>
                  <div className="font-medium text-[var(--mk-text-primary)]">
                    .mkui 打包交付（真实）
                  </div>
                  <div className="text-[11px] text-[var(--mk-text-secondary)]">
                    ZIP + MessagePack + 历史版本
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
            <div className="font-semibold text-[var(--mk-text-primary)]">
              当前分包汇总
            </div>
            <div className="mk-tabular grid grid-cols-2 gap-y-1 text-[11px] text-[var(--mk-text-secondary)]">
              <span>总画面数</span>
              <span className="text-right text-[var(--mk-text-primary)]">
                {doc.frames.length}
              </span>
              <span>当前图元</span>
              <span className="text-right text-[var(--mk-text-primary)]">
                {budget.totalGraphics}
              </span>
              <span>串口数据包</span>
              <span className="text-right text-[var(--mk-text-primary)]">
                {budget.graphicPacketCount} 图 + {budget.charPacketCount} 字
              </span>
              <span>MsgPack 大小</span>
              <span className="text-right text-[var(--mk-accent-primary)]">
                {lastMsgpackBytes ? `${lastMsgpackBytes} B` : "保存后生成"}
              </span>
              <span>ZIP 体积</span>
              <span className="text-right text-[var(--mk-accent-primary)]">
                {lastArchiveBytes ? `${lastArchiveBytes} B` : "保存后生成"}
              </span>
            </div>
          </div>
        </aside>

        {/* 中栏：真实预检结果 + 模拟生成预览 */}
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5 text-xs">
          {/* 阶段 1：预检卡片 */}
          <section className="rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-[var(--mk-accent-primary)]" />
                <span className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  阶段 1：2027 裁判系统协议预检
                </span>
              </div>
              {errorCount === 0 ? (
                <Badge tone="ok">
                  <CheckCircle2 className="h-3 w-3" />
                  预检通过 · {warnCount} 条建议
                </Badge>
              ) : (
                <Badge tone="error">
                  <AlertCircle className="h-3 w-3" />
                  存在 {errorCount} 项协议错误
                </Badge>
              )}
            </div>

            {issues.length === 0 ? (
              <div className="rounded-[var(--mk-radius-sm)] bg-[var(--mk-bg-surface)] px-3 py-2.5 text-[11px] text-[var(--mk-status-ok)]">
                所有图元的 3 字节短名、UTF-8 文本长度、图层范围、协议色与坐标均通过检测。
              </div>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {issue.severity === "error" ? (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mk-status-error)]" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mk-status-warn)]" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--mk-text-primary)]">
                          {issue.message}
                        </div>
                        {issue.detail && (
                          <div className="text-[10px] text-[var(--mk-text-muted)]">
                            {issue.detail}
                          </div>
                        )}
                      </div>
                    </div>
                    {issue.graphicId && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleLocateIssue(issue)}
                      >
                        <LocateFixed className="h-3 w-3" />
                        定位
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 阶段 2：模拟产物预览 */}
          <section className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-[var(--mk-radius-lg)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--mk-border-subtle)] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-[var(--mk-accent-primary)]" />
                <span className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  阶段 2：CMake 与 UICRM-Embedded 接口预览（模拟占位）
                </span>
              </div>
              <Badge tone="neutral">只读示意</Badge>
            </div>
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="w-48 shrink-0 space-y-1 border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2">
                {fileNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setActivePreviewFile(name)}
                    className={cn(
                      "mk-tabular block w-full truncate rounded-[var(--mk-radius-sm)] px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer",
                      activePreviewFile === name
                        ? "bg-[var(--mk-accent-primary-tint)] font-medium text-[var(--mk-accent-primary)]"
                        : "text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)]",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <pre className="mk-tabular min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-[var(--mk-bg-code)] p-4 text-[12px] leading-relaxed text-[var(--mk-text-primary)]">
                {mockFiles[activePreviewFile] ?? ""}
              </pre>
            </div>
          </section>
        </main>

        {/* 右栏：真实导出与模拟写入配置 */}
        <aside className="flex w-68 shrink-0 flex-col justify-between border-l border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-3.5 text-xs">
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-semibold text-[var(--mk-text-primary)]">
                交付目标配置
              </div>
              <p className="mt-1 text-[11px] text-[var(--mk-text-secondary)]">
                导出标准 `.mkui` 工程包用于团队分发、版本存档及后续 CMake 工具链消费。
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                CMake 目标名（模拟预览用）
              </label>
              <Input
                value={targetName}
                className="mk-tabular"
                onChange={(e) => setTargetName(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                整车 `ui/` 模拟路径（不执行真实写入）
              </label>
              <Input
                value={mockVehiclePath}
                className="mk-tabular"
                onChange={(e) => setMockVehiclePath(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-[var(--mk-border-subtle)] pt-3">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void saveCurrentProject(true)}
            >
              <FileArchive className="h-4 w-4" />
              导出 .mkui 工程包
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void exportCurrentAsRmui()}
              >
                导出 .rmui
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void exportCurrentAsJson()}
              >
                导出 .json
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full border border-dashed border-[var(--mk-border-strong)]"
              onClick={() => {
                if (errorCount > 0) {
                  pushToast({
                    tone: "error",
                    title: "预检存在阻断错误",
                    description: `请先修复 ${errorCount} 个协议错误后再执行交付演示`,
                  });
                  return;
                }
                setMockWriteDialogOpen(true);
              }}
            >
              <FolderOutput className="h-3.5 w-3.5" />
              模拟写入整车 ui/（演示）
            </Button>
          </div>
        </aside>
      </div>

      <Dialog open={mockWriteDialogOpen} onOpenChange={setMockWriteDialogOpen}>
        <DialogContent
          title="模拟写入整车 ui/ 演示回执"
          description="本操作仅演示未来配套 CMake 工具集的交付流程，未向任何外部仓库写入文件。"
        >
          <div className="space-y-3 text-xs">
            <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
              <div className="font-medium text-[var(--mk-text-primary)]">
                目标：{mockVehiclePath}
              </div>
              <ul className="mk-tabular mt-2 list-disc space-y-1 pl-4 text-[11px] text-[var(--mk-text-secondary)]">
                <li>{doc.name}.mkui（ZIP + MessagePack，含版本历史）</li>
                <li>CMake 目标：{toSafeSymbol(targetName)}（待工具集定型后自动解析生成）</li>
              </ul>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => setMockWriteDialogOpen(false)}
              >
                我知道了
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
