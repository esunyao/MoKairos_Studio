import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Download,
  GitBranch,
  GitCommitHorizontal,
  History,
  RotateCcw,
  X,
} from "lucide-react";
import { computeDocumentDiff } from "@/domain/versioning/diffEngine";
import { Button } from "@/components/ui/Button";
import { Badge, Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { useAppStore } from "@/stores/useAppStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useVersionStore } from "@/stores/useVersionStore";

/**
 * 玻璃质感侧滑版本控制抽屉
 * 支持：提交版本快照、时间线浏览、结构化属性 Diff 对比、安全回滚与独立导出 .mkui
 */

export function VersionDrawer() {
  const open = useAppStore((s) => s.versionDrawerOpen);
  const setOpen = useAppStore((s) => s.setVersionDrawerOpen);
  const authorName = useAppStore((s) => s.authorName);
  const pushToast = useAppStore((s) => s.pushToast);

  const doc = useDocumentStore((s) => s.doc);
  const replaceDocumentFromVersion = useDocumentStore(
    (s) => s.replaceDocumentFromVersion,
  );
  const filePath = useProjectStore((s) => s.filePath);

  const index = useVersionStore((s) => s.index);
  const selectedCompareCommitId = useVersionStore(
    (s) => s.selectedCompareCommitId,
  );
  const compareDocument = useVersionStore((s) => s.compareDocument);
  const isBusy = useVersionStore((s) => s.isBusy);
  const commitSnapshot = useVersionStore((s) => s.commitSnapshot);
  const selectCompareCommit = useVersionStore((s) => s.selectCompareCommit);
  const loadSnapshotDoc = useVersionStore((s) => s.loadSnapshotDoc);
  const exportSnapshotAsMkui = useVersionStore((s) => s.exportSnapshotAsMkui);

  const [message, setMessage] = useState("");
  const [versionTag, setVersionTag] = useState("");
  const [backupBeforeRollback, setBackupBeforeRollback] = useState(true);

  const orderedCommits = useMemo(
    () => [...index.commits].reverse(),
    [index.commits],
  );

  const diff = useMemo(() => {
    if (!compareDocument) return null;
    return computeDocumentDiff(compareDocument, doc);
  }, [compareDocument, doc]);

  const handleCommit = async () => {
    try {
      await commitSnapshot({
        filePath,
        document: doc,
        message: message.trim() || "更新 UI 布局快照",
        versionTag: versionTag.trim() || undefined,
        author: authorName,
      });
      setMessage("");
      setVersionTag("");
      pushToast({
        tone: "success",
        title: "已提交版本快照",
        description: filePath
          ? "快照已写入 .mkui 压缩包 history/"
          : "草稿快照已暂存，保存 .mkui 时将一并打包",
      });
    } catch (err) {
      pushToast({
        tone: "error",
        title: "提交版本失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleRollback = async (commitId: string) => {
    try {
      if (backupBeforeRollback) {
        await commitSnapshot({
          filePath,
          document: doc,
          message: `回滚前自动保护备份 (目标 ${commitId.slice(0, 10)})`,
          author: authorName,
        });
      }
      const targetDoc = await loadSnapshotDoc(filePath, commitId);
      replaceDocumentFromVersion(targetDoc);
      pushToast({
        tone: "success",
        title: "已回滚到选定版本",
        description: "你仍可使用撤销 (Ctrl+Z) 返回刚才的工作状态",
      });
    } catch (err) {
      pushToast({
        tone: "error",
        title: "回滚版本失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleExportCommit = async (commitId: string) => {
    try {
      const saved = await exportSnapshotAsMkui(filePath, commitId, doc.name);
      if (saved) {
        pushToast({
          tone: "success",
          title: "已导出历史版本 .mkui",
          description: saved,
        });
      }
    } catch (err) {
      pushToast({
        tone: "error",
        title: "导出历史版本失败",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: 420, opacity: 0.7 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0.7 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="mk-glass-elevated fixed top-[var(--mk-topbar-height)] right-0 bottom-0 z-50 flex w-[min(94vw,430px)] flex-col border-l"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between border-b border-[var(--mk-border-subtle)] px-4 py-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-[var(--mk-accent-primary)]" />
                <span className="text-sm font-semibold text-[var(--mk-text-primary)]">
                  工程版本控制
                </span>
                <Badge tone="accent" className="mk-tabular">
                  {index.commits.length} 提交
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[var(--mk-text-secondary)] hover:bg-[var(--mk-bg-surface-hover)] hover:text-[var(--mk-text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 新建快照表单 */}
            <div className="space-y-2 border-b border-[var(--mk-border-subtle)] p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--mk-text-primary)]">
                  提交新快照（MessagePack 归档）
                </span>
                {!filePath && <Badge tone="warn">草稿暂存</Badge>}
              </div>
              <div className="flex gap-2">
                <Input
                  value={versionTag}
                  onChange={(e) => setVersionTag(e.target.value)}
                  placeholder="标签 (如 v1.2)"
                  className="mk-tabular w-28"
                />
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="输入本次修改说明…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCommit();
                  }}
                />
              </div>
              <Button
                variant="primary"
                size="md"
                className="w-full"
                disabled={isBusy}
                onClick={() => void handleCommit()}
              >
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                提交当前画布为版本快照
              </Button>
            </div>

            {/* 历史时间线 + Diff 对比区 */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
              {orderedCommits.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[var(--mk-radius-md)] border border-dashed border-[var(--mk-border-strong)] py-10 text-center">
                  <History className="h-7 w-7 text-[var(--mk-text-muted)]" />
                  <div className="mt-2 font-medium text-[var(--mk-text-primary)]">
                    尚未创建版本快照
                  </div>
                  <p className="mt-1 max-w-xs text-[11px] text-[var(--mk-text-secondary)]">
                    每次提交均以紧凑 MessagePack 存入 `.mkui` 的 `history/commits/` 目录，支持随时对比与回滚。
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orderedCommits.map((commit) => {
                    const isHead = commit.commitId === index.headCommitId;
                    const isSelected =
                      commit.commitId === selectedCompareCommitId;
                    return (
                      <div
                        key={commit.commitId}
                        onClick={() =>
                          void selectCompareCommit(
                            isSelected ? null : commit.commitId,
                            filePath,
                          )
                        }
                        className={cn(
                          "rounded-[var(--mk-radius-md)] border p-3 transition-all cursor-pointer",
                          isSelected
                            ? "border-[var(--mk-border-focus)] bg-[var(--mk-accent-primary-tint)]"
                            : "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/80 hover:border-[var(--mk-border-strong)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {commit.versionTag && (
                              <Badge tone="accent">{commit.versionTag}</Badge>
                            )}
                            {isHead && <Badge tone="ok">HEAD</Badge>}
                            <span className="font-semibold text-[var(--mk-text-primary)]">
                              {commit.message}
                            </span>
                          </div>
                          <span className="mk-tabular shrink-0 text-[10px] text-[var(--mk-text-muted)]">
                            {commit.sha256.slice(0, 7)}
                          </span>
                        </div>
                        <div className="mk-tabular mt-1.5 flex items-center justify-between text-[10px] text-[var(--mk-text-secondary)]">
                          <span>
                            {commit.author} · {new Date(commit.createdAt).toLocaleString()}
                          </span>
                          <span>
                            {commit.frameCount} 画面 / {commit.graphicCount} 图元
                          </span>
                        </div>

                        {isSelected && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-3 space-y-2.5 border-t border-[var(--mk-border-subtle)] pt-2.5"
                          >
                            {diff && (
                              <div className="space-y-1.5 rounded-[var(--mk-radius-sm)] bg-[var(--mk-bg-panel)] p-2">
                                <div className="flex items-center justify-between text-[11px] font-medium">
                                  <span className="text-[var(--mk-text-secondary)]">
                                    相对当前工作区差异
                                  </span>
                                  <span className="mk-tabular flex gap-2">
                                    <span className="text-[var(--mk-status-ok)]">
                                      +{diff.addedCount}
                                    </span>
                                    <span className="text-[var(--mk-status-warn)]">
                                      ~{diff.modifiedCount}
                                    </span>
                                    <span className="text-[var(--mk-status-error)]">
                                      -{diff.removedCount}
                                    </span>
                                  </span>
                                </div>
                                {diff.graphicDiffs.length === 0 &&
                                diff.frameDiffs.length === 0 ? (
                                  <div className="flex items-center gap-1 text-[11px] text-[var(--mk-status-ok)]">
                                    <Check className="h-3.5 w-3.5" />
                                    与当前画布完全一致
                                  </div>
                                ) : (
                                  <div className="max-h-36 space-y-1 overflow-y-auto text-[11px]">
                                    {diff.graphicDiffs.map((item) => (
                                      <div
                                        key={`${item.kind}_${item.graphicId}`}
                                        className="rounded bg-[var(--mk-bg-surface)] px-2 py-1"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium text-[var(--mk-text-primary)]">
                                            {item.kind === "added" && "当前新增："}
                                            {item.kind === "removed" && "当前已删："}
                                            {item.kind === "modified" && "已修改："}
                                            {item.displayName}
                                          </span>
                                          <span className="mk-tabular text-[10px] text-[var(--mk-text-muted)]">
                                            {item.frameName} · #{item.figureName}
                                          </span>
                                        </div>
                                        {item.changes.length > 0 && (
                                          <div className="mk-tabular mt-0.5 text-[10px] text-[var(--mk-text-secondary)]">
                                            {item.changes
                                              .slice(0, 3)
                                              .map(
                                                (c) =>
                                                  `${c.label}: ${c.before} → ${c.after}`,
                                              )
                                              .join(" · ")}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <label className="flex items-center gap-2 text-[11px] text-[var(--mk-text-secondary)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={backupBeforeRollback}
                                onChange={(e) =>
                                  setBackupBeforeRollback(e.target.checked)
                                }
                              />
                              回滚前先为当前工作区自动创建保护快照
                            </label>

                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                onClick={() =>
                                  void handleRollback(commit.commitId)
                                }
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                回滚到此版本
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={!filePath}
                                title={
                                  filePath
                                    ? "导出该历史快照为独立 .mkui 文件"
                                    : "请先保存工程为 .mkui"
                                }
                                onClick={() =>
                                  void handleExportCommit(commit.commitId)
                                }
                              >
                                <Download className="h-3.5 w-3.5" />
                                导出 .mkui
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
