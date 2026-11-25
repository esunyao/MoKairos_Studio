import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Primitives";
import { TeamToggle } from "@/components/protocol/TeamToggle";
import { useAppStore } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";

/**
 * 全局应用偏好与作者设置弹窗
 */

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const authorName = useAppStore((s) => s.authorName);
  const setAuthorName = useAppStore((s) => s.setAuthorName);
  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const setPreviewTeam = useCanvasStore((s) => s.setPreviewTeam);

  const [draftAuthor, setDraftAuthor] = useState(authorName);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="工作台偏好设置"
        description="配置界面明暗主题、默认预览阵营与版本提交作者名"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
            <div>
              <div className="font-medium text-[var(--mk-text-primary)]">
                界面主题（App Shell）
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--mk-text-secondary)]">
                仅切换工具外壳明暗风格，画布内严格锁定裁判系统 9 色协议
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={theme === "dark" ? "primary" : "secondary"}
                onClick={() => setTheme("dark")}
              >
                暗色工作室
              </Button>
              <Button
                size="sm"
                variant={theme === "light" ? "primary" : "secondary"}
                onClick={() => setTheme("light")}
              >
                浅色精密
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
            <div>
              <div className="font-medium text-[var(--mk-text-primary)]">
                默认阵营预览色
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--mk-text-secondary)]">
                控制画布中「0 = 红蓝主色」图元的实时显示颜色
              </div>
            </div>
            <TeamToggle
              team={previewTeam}
              onChange={setPreviewTeam}
              layoutId="settings-team-pill"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-[var(--mk-text-secondary)]">
              版本提交作者署名（写入 .mkui 历史索引）
            </label>
            <Input
              value={draftAuthor}
              onChange={(e) => setDraftAuthor(e.target.value)}
              placeholder="Designer"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--mk-border-subtle)] pt-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              关闭
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAuthorName(draftAuthor);
                setOpen(false);
              }}
            >
              保存设置
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
