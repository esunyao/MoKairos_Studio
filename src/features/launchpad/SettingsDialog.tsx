import { useState } from "react";
import { Droplets, Layers, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleSelect, Slider, Switch } from "@/components/ui/Controls";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Primitives";
import { TeamToggle } from "@/components/protocol/TeamToggle";
import { useAppStore, type LiquidGlassMode } from "@/stores/useAppStore";
import { useCanvasStore } from "@/stores/useCanvasStore";

/**
 * 全局应用偏好、材质质感（液态玻璃 / 普通质感）与作者设置弹窗
 */

const REFRACTION_MODES: ReadonlyArray<{
  value: LiquidGlassMode;
  label: string;
}> = [
  { value: "standard", label: "Standard（标准折射）" },
  { value: "polar", label: "Polar（极坐标折射）" },
  { value: "prominent", label: "Prominent（强边缘折射）" },
  { value: "shader", label: "Shader（SDF 着色器）" },
];

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsModalOpen);
  const setOpen = useAppStore((s) => s.setSettingsModalOpen);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const surfaceStyle = useAppStore((s) => s.surfaceStyle);
  const setSurfaceStyle = useAppStore((s) => s.setSurfaceStyle);
  const liquidGlass = useAppStore((s) => s.liquidGlass);
  const updateLiquidGlass = useAppStore((s) => s.updateLiquidGlass);
  const resetLiquidGlass = useAppStore((s) => s.resetLiquidGlass);
  const authorName = useAppStore((s) => s.authorName);
  const setAuthorName = useAppStore((s) => s.setAuthorName);
  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const setPreviewTeam = useCanvasStore((s) => s.setPreviewTeam);

  const [draftAuthor, setDraftAuthor] = useState(authorName);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="工作台偏好设置"
        description="配置界面明暗主题、液态玻璃光学材质、默认预览阵营与版本提交作者名"
        className="w-[min(94vw,600px)]"
      >
        <div className="max-h-[75vh] space-y-3.5 overflow-y-auto pr-1 text-xs">
          {/* 界面主题 */}
          <div className="flex items-center justify-between gap-3 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
            <div>
              <div className="font-medium text-[var(--mk-text-primary)]">
                界面主题（App Shell）
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--mk-text-secondary)]">
                仅切换工具外壳明暗风格，画布内严格锁定裁判系统 9 色协议
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
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

          {/* 界面材质质感切换：液态玻璃 vs 普通非液态 */}
          <div className="space-y-3 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-[var(--mk-text-primary)]">
                  界面质感风格
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--mk-text-secondary)]">
                  在光学折射液态玻璃与零滤镜普通工程质感之间即时切换
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant={surfaceStyle === "liquid" ? "primary" : "secondary"}
                  onClick={() => setSurfaceStyle("liquid")}
                >
                  <Droplets className="h-3.5 w-3.5" />
                  液态玻璃
                </Button>
                <Button
                  size="sm"
                  variant={surfaceStyle === "standard" ? "primary" : "secondary"}
                  onClick={() => setSurfaceStyle("standard")}
                >
                  <Layers className="h-3.5 w-3.5" />
                  普通质感
                </Button>
              </div>
            </div>

            {surfaceStyle === "liquid" && (
              <div className="space-y-3 border-t border-[var(--mk-border-subtle)] pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--mk-text-primary)]">
                    液态玻璃光学参数
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={resetLiquidGlass}
                  >
                    <RotateCcw className="h-3 w-3" />
                    恢复推荐默认
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                      折射模式 (Refraction Mode)
                    </label>
                    <SimpleSelect
                      value={liquidGlass.mode}
                      onValueChange={(v) =>
                        updateLiquidGlass({ mode: v as LiquidGlassMode })
                      }
                      options={REFRACTION_MODES}
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-[var(--mk-text-secondary)]">
                        边缘折射强度 (Displacement)
                      </span>
                      <span className="mk-tabular font-semibold text-[var(--mk-text-primary)]">
                        {liquidGlass.displacementScale}
                      </span>
                    </div>
                    <Slider
                      value={[liquidGlass.displacementScale]}
                      min={0}
                      max={160}
                      step={2}
                      onValueChange={([val]) =>
                        updateLiquidGlass({ displacementScale: val ?? 70 })
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-[var(--mk-text-secondary)]">
                        模糊度 (Blur Amount)
                      </span>
                      <span className="mk-tabular font-semibold text-[var(--mk-text-primary)]">
                        {liquidGlass.blurAmount.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[liquidGlass.blurAmount]}
                      min={0}
                      max={1}
                      step={0.02}
                      onValueChange={([val]) =>
                        updateLiquidGlass({ blurAmount: val ?? 0.2 })
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-[var(--mk-text-secondary)]">
                        饱和度 (Saturation)
                      </span>
                      <span className="mk-tabular font-semibold text-[var(--mk-text-primary)]">
                        {liquidGlass.saturation}%
                      </span>
                    </div>
                    <Slider
                      value={[liquidGlass.saturation]}
                      min={100}
                      max={260}
                      step={5}
                      onValueChange={([val]) =>
                        updateLiquidGlass({ saturation: val ?? 140 })
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-[var(--mk-text-secondary)]">
                        色散强度 (Chromatic Aberration)
                      </span>
                      <span className="mk-tabular font-semibold text-[var(--mk-text-primary)]">
                        {liquidGlass.aberrationIntensity}
                      </span>
                    </div>
                    <Slider
                      value={[liquidGlass.aberrationIntensity]}
                      min={0}
                      max={10}
                      step={1}
                      onValueChange={([val]) =>
                        updateLiquidGlass({ aberrationIntensity: val ?? 2 })
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="text-[var(--mk-text-secondary)]">
                        液态弹性 (Elasticity)
                      </span>
                      <span className="mk-tabular font-semibold text-[var(--mk-text-primary)]">
                        {liquidGlass.elasticity.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[liquidGlass.elasticity]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={([val]) =>
                        updateLiquidGlass({ elasticity: val ?? 0.55 })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] px-2.5 py-2">
                    <div>
                      <div className="font-medium text-[var(--mk-text-primary)]">
                        深色玻璃压暗 (Over Light)
                      </div>
                      <div className="text-[10px] text-[var(--mk-text-muted)]">
                        关闭时保持纯正透明光泽（默认 false）
                      </div>
                    </div>
                    <Switch
                      checked={liquidGlass.overLight}
                      onCheckedChange={(checked) =>
                        updateLiquidGlass({ overLight: checked })
                      }
                      aria-label="深色玻璃压暗"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] px-2.5 py-2">
                    <div>
                      <div className="font-medium text-[var(--mk-text-primary)]">
                        背景自适应黑白文字
                      </div>
                      <div className="text-[10px] text-[var(--mk-text-muted)]">
                        浅色背景自动黑字、深色背景自动白字
                      </div>
                    </div>
                    <Switch
                      checked={liquidGlass.adaptiveContrast}
                      onCheckedChange={(checked) =>
                        updateLiquidGlass({ adaptiveContrast: checked })
                      }
                      aria-label="背景自适应黑白文字"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 默认阵营预览色 */}
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
