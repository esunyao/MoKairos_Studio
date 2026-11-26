import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Eye,
  FileCode2,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import { useCodefileSync } from "@/hooks/useCodefileSync";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { MonacoCodeEditor } from "./MonacoCodeEditor";
import { updateMonacoCompletionContext } from "./monacoSetup";

/**
 * 纯代码与基底 lib 定制页（Monaco IDE）
 * 左侧文件树：
 * 1. code/：用户自由代码文件（保存即无损解析同步至 React Flow 节点）
 * 2. lib/：官方基底 lib 模板只读浏览 + 一键复制覆写（打包入 .mkui codegen/lib/）
 * 3. 生成预览：只读查看当前 Rust 生成的 C/C++ 文件
 */

type ActiveFileSelection =
  | { group: "code"; name: string }
  | { group: "lib"; name: string }
  | { group: "preview"; name: string };

export function CodeTab({
  initialFile,
  initialLine,
  jumpNonce,
}: {
  initialFile?: string | null;
  initialLine?: number | null;
  jumpNonce?: number;
}) {
  const doc = useDocumentStore((s) => s.doc);
  const profile = useCodegenStore((s) => s.profile);
  const codeFiles = useCodegenStore((s) => s.codeFiles);
  const libOverrides = useCodegenStore((s) => s.libOverrides);
  const builtinBaseTemplates = useCodegenStore((s) => s.builtinBaseTemplates);
  const previewFiles = useCodegenStore((s) => s.previewFiles);
  const parsedFiles = useCodegenStore((s) => s.parsedFiles);
  const overrideBaseTemplate = useCodegenStore((s) => s.overrideBaseTemplate);
  const resetBaseTemplate = useCodegenStore((s) => s.resetBaseTemplate);
  const deleteCodeFile = useCodegenStore((s) => s.deleteCodeFile);
  const { saveAndSyncCodeFile } = useCodefileSync();

  const codeNames = Object.keys(codeFiles).sort();
  const libNames = Object.keys(builtinBaseTemplates).sort();
  const previewNames = Object.keys(previewFiles).sort();

  const [sel, setSel] = useState<ActiveFileSelection>(() => ({
    group: "code",
    name: codeNames[0] ?? "nodes.c",
  }));
  const [newFileName, setNewFileName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [activeJumpLine, setActiveJumpLine] = useState<number | null>(initialLine ?? null);

  useEffect(() => {
    if (!initialFile) return;
    if (useCodegenStore.getState().codeFiles[initialFile] !== undefined) {
      setSel({ group: "code", name: initialFile });
      setActiveJumpLine(initialLine ?? null);
    } else if (useCodegenStore.getState().previewFiles[initialFile] !== undefined) {
      setSel({ group: "preview", name: initialFile });
      setActiveJumpLine(initialLine ?? null);
    }
  }, [initialFile, initialLine, jumpNonce]);

  // 更新 Monaco 智能补全上下文
  useEffect(() => {
    const P = profile.prefix.toUpperCase();
    const fnNames = Object.values(parsedFiles).flatMap((p) => p.functions.map((f) => f.name));
    const frameEnums = doc.frames.map((f) => `${P}_FRAME_${f.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`);
    const graphicEnums = doc.frames.flatMap((f) =>
      f.graphics.map((g) => `${P}_G_${(g.varKey || g.figureName).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`),
    );
    updateMonacoCompletionContext({
      prefix: profile.prefix,
      symbolIds: profile.symbols.map((s) => s.id),
      functionNames: fnNames,
      frameEnums,
      graphicEnums,
    });
  }, [doc, profile, parsedFiles]);

  const currentContent = useMemo(() => {
    if (sel.group === "code") {
      return codeFiles[sel.name] ?? "";
    }
    if (sel.group === "lib") {
      return libOverrides[sel.name] ?? builtinBaseTemplates[sel.name] ?? "";
    }
    return previewFiles[sel.name] ?? "";
  }, [sel, codeFiles, libOverrides, builtinBaseTemplates, previewFiles]);

  useEffect(() => {
    setDraftContent(currentContent);
  }, [sel.group, sel.name, currentContent]);

  const isLibOverridden = sel.group === "lib" && libOverrides[sel.name] !== undefined;
  const isReadOnly =
    sel.group === "preview" || (sel.group === "lib" && !isLibOverridden);

  const editorLang: "c" | "cpp" | "ini" = useMemo(() => {
    if (sel.name.includes(".cpp") || sel.name.includes(".hpp")) return "cpp";
    if (sel.name.endsWith(".toml")) return "ini";
    return "c";
  }, [sel.name]);

  const handleSave = async (text = draftContent) => {
    if (sel.group === "code") {
      await saveAndSyncCodeFile(sel.name, text);
    } else if (sel.group === "lib" && isLibOverridden) {
      overrideBaseTemplate(sel.name, text);
      toast.success(`已保存基底模板覆写 lib/${sel.name}`);
    }
  };

  const handleCreateCodeFile = async () => {
    const clean = newFileName.trim();
    if (!clean || !/^[a-zA-Z0-9_.-]+\.(c|h)$/.test(clean)) {
      toast.warn("文件名需以 .c 或 .h 结尾（仅限字母数字下划线）");
      return;
    }
    await saveAndSyncCodeFile(
      clean,
      `/* ${clean} */\n#include <stdint.h>\n`,
    );
    setNewFileName("");
    setSel({ group: "code", name: clean });
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* 左侧三区文件树 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] overflow-y-auto p-3 space-y-4 text-xs">
        {/* 1. code/ */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--mk-text-primary)] flex items-center gap-1.5">
              <FileCode2 className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />
              code/（双向同步）
            </span>
          </div>
          <div className="space-y-1">
            {codeNames.map((name) => {
              const active = sel.group === "code" && sel.name === name;
              const fnCount = parsedFiles[name]?.functions.length ?? 0;
              return (
                <div
                  key={name}
                  className={cn(
                    "flex items-center justify-between rounded-[var(--mk-radius-sm)] px-2 py-1 cursor-pointer",
                    active
                      ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]"
                      : "hover:bg-[var(--mk-bg-surface)] text-[var(--mk-text-secondary)]",
                  )}
                  onClick={() => {
                    setActiveJumpLine(null);
                    setSel({ group: "code", name });
                  }}
                >
                  <span className="truncate font-mono text-[11px]">{name}</span>
                  <div className="flex items-center gap-1">
                    <Badge tone="neutral">{fnCount}fn</Badge>
                    {codeNames.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextTarget = codeNames.find((n) => n !== name) ?? "nodes.c";
                          deleteCodeFile(name);
                          if (active) {
                            setActiveJumpLine(null);
                            setSel({ group: "code", name: nextTarget });
                          }
                        }}
                        className="text-[var(--mk-status-error)] hover:opacity-80 cursor-pointer"
                        title="删除文件"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 pt-1">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="新建如 helper.c"
              className="h-6 font-mono text-[11px]"
            />
            <Button variant="secondary" size="sm" onClick={() => void handleCreateCodeFile()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* 2. lib/ 基底模板 */}
        <div className="space-y-1.5 pt-2 border-t border-[var(--mk-border-subtle)]">
          <div className="font-semibold text-[var(--mk-text-primary)] flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-[var(--mk-status-warn)]" />
            lib/（基底模板覆写）
          </div>
          <div className="space-y-1">
            {libNames.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-[var(--mk-text-muted)]">
                浏览器预览模式无法读取内置模板，请在桌面端查看并覆写 `*.j2` 基底。
              </div>
            ) : (
              libNames.map((name) => {
                const active = sel.group === "lib" && sel.name === name;
                const overridden = libOverrides[name] !== undefined;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setActiveJumpLine(null);
                      setSel({ group: "lib", name });
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[var(--mk-radius-sm)] px-2 py-1 text-left cursor-pointer",
                      active
                        ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]"
                        : "hover:bg-[var(--mk-bg-surface)] text-[var(--mk-text-secondary)]",
                    )}
                  >
                    <span className="truncate font-mono text-[11px]">{name}</span>
                    {overridden && <Badge tone="warn">已覆写</Badge>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 3. 生成预览（只读） */}
        <div className="space-y-1.5 pt-2 border-t border-[var(--mk-border-subtle)]">
          <div className="font-semibold text-[var(--mk-text-primary)] flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-[var(--mk-text-muted)]" />
            生成预览（只读）
          </div>
          <div className="space-y-1">
            {previewNames.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-[var(--mk-text-muted)]">
                暂无预览文件（需 Tauri 桌面端且无阻断错误）。
              </div>
            ) : (
              previewNames.map((name) => {
                const active = sel.group === "preview" && sel.name === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setActiveJumpLine(null);
                      setSel({ group: "preview", name });
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[var(--mk-radius-sm)] px-2 py-1 text-left cursor-pointer",
                      active
                        ? "bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)]"
                        : "hover:bg-[var(--mk-bg-surface)] text-[var(--mk-text-secondary)]",
                    )}
                  >
                    <span className="truncate font-mono text-[11px]">{name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>

      {/* 右侧 Monaco 编辑器区 */}
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--mk-bg-canvas)]">
        <div className="flex items-center justify-between border-b border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-[var(--mk-text-primary)]">
              {sel.group}/{sel.name}
            </span>
            {isReadOnly && <Badge tone="neutral">只读</Badge>}
            {isLibOverridden && <Badge tone="warn">已启用工程覆写（打包进 .mkui）</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {sel.group === "lib" && !isLibOverridden && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  overrideBaseTemplate(sel.name, builtinBaseTemplates[sel.name] ?? "");
                  toast.success(`已复制 lib/${sel.name} 为工程自定义基底模板`);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                复制为工程覆写
              </Button>
            )}
            {sel.group === "lib" && isLibOverridden && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  resetBaseTemplate(sel.name);
                  toast.info(`已恢复 lib/${sel.name} 为官方默认`);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                恢复官方默认
              </Button>
            )}
            {!isReadOnly && (
              <Button variant="primary" size="sm" onClick={() => void handleSave()}>
                <Save className="h-3.5 w-3.5" />
                保存并同步 (Ctrl+S)
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <MonacoCodeEditor
            value={draftContent}
            language={editorLang}
            readOnly={isReadOnly}
            jumpLine={activeJumpLine}
            onChange={setDraftContent}
            onSave={(val) => void handleSave(val)}
          />
        </div>
      </div>
    </div>
  );
}
