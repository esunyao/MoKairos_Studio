import { useEffect, useState } from "react";
import { ROBOT_ROLES_2027, type RobotRole2027 } from "@/domain/protocol/constants";
import {
  STARTER_TEMPLATES,
  type StarterTemplateId,
} from "@/domain/templates/starterTemplates";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Primitives";
import { SimpleSelect } from "@/components/ui/Controls";
import { cn } from "@/components/ui/cn";
import {
  createNewProjectFromWizard,
  importRmuiProject,
} from "@/services/projectActions";
import { useAppStore } from "@/stores/useAppStore";

/**
 * 新建 1920×1080 HUD 工程向导弹窗
 */

export function NewProjectDialog() {
  const open = useAppStore((s) => s.newProjectModalOpen);
  const defaultTemplate = useAppStore((s) => s.newProjectDefaultTemplate);
  const close = useAppStore((s) => s.closeNewProjectModal);

  const [name, setName] = useState("Infantry_2027_HUD");
  const [robotRole, setRobotRole] = useState<RobotRole2027>("infantry_3");
  const [templateId, setTemplateId] = useState<StarterTemplateId>(defaultTemplate);

  useEffect(() => {
    if (open) {
      setTemplateId(defaultTemplate);
      const tpl = STARTER_TEMPLATES.find((t) => t.id === defaultTemplate);
      if (tpl) {
        setRobotRole(tpl.recommendedRole);
      }
    }
  }, [open, defaultTemplate]);

  const handleCreate = async () => {
    await createNewProjectFromWizard({
      templateId,
      name: name.trim() || "未命名 HUD 工程",
      robotRole,
    });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        title="新建 1920×1080 HUD 工程"
        description="基于 RoboMaster 2027 串口协议创建工程（支持后续随时保存为 .mkui 压缩包）"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--mk-text-secondary)]">
              工程名称
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：Infantry_3_Combat"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--mk-text-secondary)]">
              目标兵种（2027 协议 ID 映射）
            </label>
            <SimpleSelect
              value={robotRole}
              onValueChange={(v) => setRobotRole(v as RobotRole2027)}
              options={ROBOT_ROLES_2027.map((r) => ({
                value: r.role,
                label: r.label,
              }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--mk-text-secondary)]">
              起始模板
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STARTER_TEMPLATES.map((tpl) => {
                const active = tpl.id === templateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setTemplateId(tpl.id);
                      setRobotRole(tpl.recommendedRole);
                    }}
                    className={cn(
                      "rounded-[var(--mk-radius-md)] border p-2.5 text-left transition-all cursor-pointer",
                      active
                        ? "border-[var(--mk-border-focus)] bg-[var(--mk-accent-primary-tint)]"
                        : "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] hover:border-[var(--mk-border-strong)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--mk-text-primary)]">
                        {tpl.name}
                      </span>
                      <span className="rounded bg-[var(--mk-bg-panel)] px-1.5 py-0.5 text-[10px] text-[var(--mk-accent-primary)]">
                        {tpl.badge}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[var(--mk-text-secondary)]">
                      {tpl.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--mk-border-subtle)] pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                close();
                await importRmuiProject();
              }}
            >
              改为导入 .rmui 文件…
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="md" onClick={close}>
                取消
              </Button>
              <Button variant="primary" size="md" onClick={() => void handleCreate()}>
                创建并进入画布
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
