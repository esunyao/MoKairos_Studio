import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Dialog, DialogContent } from "./Dialog";
import { useAppStore } from "@/stores/useAppStore";

/**
 * 公共未保存更改离开确认弹窗（保存并继续 / 不保存直接离开 / 取消）
 */

export function UnsavedChangesDialog() {
  const prompt = useAppStore((s) => s.unsavedPrompt);
  const close = useAppStore((s) => s.closeUnsavedPrompt);
  const [busy, setBusy] = useState(false);

  const handleSaveAndContinue = async () => {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.onSaveAndContinue();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.onDiscard();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={prompt !== null} onOpenChange={(next) => !next && !busy && close()}>
      <DialogContent
        title={prompt?.title ?? "当前画布有未保存的修改"}
        description={prompt?.description}
        className="w-[min(92vw,460px)]"
      >
        <div className="space-y-4 text-xs">
          <div className="flex items-start gap-2.5 rounded-[var(--mk-radius-md)] border border-[var(--mk-status-warn)]/35 bg-[var(--mk-status-warn-tint)] p-3 text-[var(--mk-text-primary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mk-status-warn)]" />
            <div className="leading-relaxed text-[var(--mk-text-secondary)]">
              若不保存直接离开，本次在工作台内新建或修改的画布内容将会丢失。
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="md" disabled={busy} onClick={close}>
              取消
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={busy}
              onClick={() => void handleDiscard()}
            >
              {prompt?.discardLabel ?? "不保存直接离开"}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={busy}
              onClick={() => void handleSaveAndContinue()}
            >
              {prompt?.saveAndContinueLabel ?? "保存并继续"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
