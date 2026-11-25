import { AlertCircle, AlertTriangle, CheckCircle2, LocateFixed, Trash2 } from "lucide-react";
import { ProtocolColorPicker } from "@/components/protocol/ProtocolColorPicker";
import { Button } from "@/components/ui/Button";
import { SimpleSelect, Switch } from "@/components/ui/Controls";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Badge, Input } from "@/components/ui/Primitives";
import {
  GRAPHIC_KIND_MAP,
  RM_CANVAS_HEIGHT,
  RM_CANVAS_WIDTH,
  RM_PROTOCOL_LIMITS,
  type RmColorId,
} from "@/domain/protocol/constants";
import { getUtf8ByteLength } from "@/domain/protocol/naming";
import type {
  LayerIndex,
  MkuiFrame,
  MkuiGraphic,
  PacketBudgetReport,
  PreflightIssue,
} from "@/domain/protocol/types";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 右侧 276px 属性检查器与协议预算面板
 * - 未选中：展示当前画面协议预算（7/5/2/1 + 60B 字符帧）与预检问题列表（支持一键定位）
 * - 单选：按图元 kind 动态映射合法 RM 左下角原点几何参数、3B 短名、varKey、9 色板、UTF-8 计数
 * - 多选：批量修改颜色、线宽、图层、分组、动静态与删除
 */

export function RightInspector({
  activeFrame,
  budget,
  issues,
}: {
  activeFrame: MkuiFrame;
  budget: PacketBudgetReport;
  issues: PreflightIssue[];
}) {
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const previewTeam = useCanvasStore((s) => s.previewTeam);

  const updateGraphic = useDocumentStore((s) => s.updateGraphic);
  const updateGraphicsBatch = useDocumentStore((s) => s.updateGraphicsBatch);
  const deleteGraphics = useDocumentStore((s) => s.deleteGraphics);

  const selectedGraphics = activeFrame.graphics.filter((g) =>
    selectedIds.includes(g.id),
  );
  const single: MkuiGraphic | null =
    selectedGraphics.length === 1 ? selectedGraphics[0] : null;

  const groupOptions = activeFrame.groups.map((g) => ({
    value: g.id,
    label: g.name,
  }));

  const layerOptions = Array.from({ length: 10 }, (_, idx) => ({
    value: String(idx),
    label: `图层 ${idx}`,
  }));

  return (
    <aside className="flex w-[var(--mk-inspector-width)] shrink-0 flex-col border-l border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {/* 无选中：画面统计与预检 */}
        {selectedGraphics.length === 0 && (
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-semibold text-[var(--mk-text-primary)]">
                画面概览 · {activeFrame.name}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--mk-text-secondary)]">
                点击画布中的图元以编辑坐标、9 色枚举与 `varKey` 变量映射
              </p>
            </div>

            <div className="space-y-2 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--mk-text-primary)]">
                  串口分包预算 (0x0301)
                </span>
                <Badge tone={budget.bandwidthRatioAt10Hz > 0.85 ? "warn" : "ok"}>
                  {Math.round(budget.bandwidthRatioAt10Hz * 100)}% @ 10Hz
                </Badge>
              </div>
              <div className="mk-tabular grid grid-cols-2 gap-y-1 text-[11px] text-[var(--mk-text-secondary)]">
                <span>图元总数</span>
                <span className="text-right text-[var(--mk-text-primary)]">
                  {budget.totalGraphics} 个
                </span>
                <span>普通图形包 (7/5/2/1)</span>
                <span className="text-right text-[var(--mk-text-primary)]">
                  {budget.graphicPacketCount} 帧
                </span>
                <span>字符独占包 (60B)</span>
                <span className="text-right text-[var(--mk-text-primary)]">
                  {budget.charPacketCount} 帧
                </span>
                <span>全量单轮载荷</span>
                <span className="text-right text-[var(--mk-text-primary)]">
                  {budget.fullRefreshBytes} B
                </span>
                <span>动态刷新上限</span>
                <span className="text-right text-[var(--mk-accent-primary)]">
                  ~{budget.estimatedRefreshHz} Hz
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--mk-text-primary)]">
                  实时协议预检 ({issues.length})
                </span>
                {issues.length === 0 && (
                  <Badge tone="ok">
                    <CheckCircle2 className="h-3 w-3" />
                    全部合规
                  </Badge>
                )}
              </div>

              {issues.length === 0 ? (
                <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3 text-[11px] text-[var(--mk-text-secondary)]">
                  当前画面所有图元均符合 2027 裁判系统协议，且未侵入官方客户端遮挡禁区。
                </div>
              ) : (
                <div className="space-y-1.5">
                  {issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2"
                    >
                      <div className="flex items-start gap-1.5">
                        {issue.severity === "error" ? (
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mk-status-error)]" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mk-status-warn)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-[var(--mk-text-primary)]">
                            {issue.message}
                          </div>
                          {issue.detail && (
                            <div className="mt-0.5 text-[10px] text-[var(--mk-text-muted)]">
                              {issue.detail}
                            </div>
                          )}
                          {issue.graphicId && (
                            <button
                              type="button"
                              onClick={() => setSelectedIds([issue.graphicId!])}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--mk-accent-primary)] hover:underline cursor-pointer"
                            >
                              <LocateFixed className="h-3 w-3" />
                              定位图元
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 多选批量编辑 */}
        {selectedGraphics.length > 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--mk-text-primary)]">
                批量编辑（{selectedGraphics.length} 个图元）
              </span>
              <Button
                variant="danger"
                size="xs"
                onClick={() => {
                  deleteGraphics(selectedIds);
                  clearSelection();
                }}
              >
                <Trash2 className="h-3 w-3" />
                删除
              </Button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-[var(--mk-text-secondary)]">
                协议 9 色板（批量设置）
              </label>
              <ProtocolColorPicker
                value="mixed"
                team={previewTeam}
                onChange={(color) => updateGraphicsBatch(selectedIds, { color })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                  批量图层
                </label>
                <SimpleSelect
                  value={String(selectedGraphics[0].layer)}
                  onValueChange={(v) =>
                    updateGraphicsBatch(selectedIds, { layer: Number(v) as LayerIndex })
                  }
                  options={layerOptions}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                  批量线宽
                </label>
                <NumberStepper
                  value={selectedGraphics[0].lineWidth}
                  min={1}
                  max={1023}
                  unit="px"
                  onChange={(lineWidth) =>
                    updateGraphicsBatch(selectedIds, { lineWidth })
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                批量归属分组
              </label>
              <SimpleSelect
                value={selectedGraphics[0].groupId}
                onValueChange={(groupId) =>
                  updateGraphicsBatch(selectedIds, { groupId })
                }
                options={groupOptions}
              />
            </div>
          </div>
        )}

        {/* 单选精确检查器 */}
        {single && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge tone="accent">
                    {GRAPHIC_KIND_MAP[single.kind].label}
                  </Badge>
                  <span className="mk-tabular text-[11px] text-[var(--mk-text-muted)]">
                    #{single.figureName}
                  </span>
                </div>
              </div>
              <Button
                variant="danger"
                size="xs"
                onClick={() => {
                  deleteGraphics([single.id]);
                  clearSelection();
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            {/* 命名与变量绑定 */}
            <div className="space-y-2 border-b border-[var(--mk-border-subtle)] pb-3">
              <div>
                <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                  展示名称
                </label>
                <Input
                  value={single.displayName}
                  onChange={(e) =>
                    updateGraphic(single.id, { displayName: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                    协议短名 (≤3B)
                  </label>
                  <Input
                    value={single.figureName}
                    maxLength={3}
                    className="mk-tabular"
                    onChange={(e) =>
                      updateGraphic(single.id, { figureName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[var(--mk-text-secondary)]">
                    所属分组
                  </label>
                  <SimpleSelect
                    value={single.groupId}
                    onValueChange={(groupId) =>
                      updateGraphic(single.id, { groupId })
                    }
                    options={groupOptions}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-[11px] text-[var(--mk-text-secondary)]">
                  <span>固件变量键 (varKey)</span>
                  <span className="text-[10px] text-[var(--mk-text-muted)]">
                    C++ Map 映射
                  </span>
                </label>
                <Input
                  value={single.varKey ?? ""}
                  className="mk-tabular"
                  placeholder="如 supercap.pct"
                  onChange={(e) =>
                    updateGraphic(single.id, {
                      varKey: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </div>

            {/* 几何参数（RM 左下角原点） */}
            <div className="space-y-2 border-b border-[var(--mk-border-subtle)] pb-3">
              <div className="text-[11px] font-semibold text-[var(--mk-text-secondary)]">
                几何变换（RM 左下角原点 1920×1080）
              </div>

              {(single.kind === "line" || single.kind === "rect") && (
                <div className="grid grid-cols-2 gap-1.5">
                  <NumberStepper
                    label="X1"
                    value={single.startX}
                    min={0}
                    max={RM_CANVAS_WIDTH}
                    onChange={(startX) => updateGraphic(single.id, { startX })}
                  />
                  <NumberStepper
                    label="Y1"
                    value={single.startY}
                    min={0}
                    max={RM_CANVAS_HEIGHT}
                    onChange={(startY) => updateGraphic(single.id, { startY })}
                  />
                  <NumberStepper
                    label="X2"
                    value={single.endX}
                    min={0}
                    max={RM_CANVAS_WIDTH}
                    onChange={(endX) => updateGraphic(single.id, { endX })}
                  />
                  <NumberStepper
                    label="Y2"
                    value={single.endY}
                    min={0}
                    max={RM_CANVAS_HEIGHT}
                    onChange={(endY) => updateGraphic(single.id, { endY })}
                  />
                </div>
              )}

              {single.kind === "circle" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <NumberStepper
                    label="CX"
                    value={single.centerX}
                    min={0}
                    max={RM_CANVAS_WIDTH}
                    onChange={(centerX) => updateGraphic(single.id, { centerX })}
                  />
                  <NumberStepper
                    label="CY"
                    value={single.centerY}
                    min={0}
                    max={RM_CANVAS_HEIGHT}
                    onChange={(centerY) => updateGraphic(single.id, { centerY })}
                  />
                  <NumberStepper
                    label="R"
                    value={single.radius}
                    min={1}
                    max={RM_PROTOCOL_LIMITS.maxRadius}
                    unit="px"
                    className="col-span-2"
                    onChange={(radius) => updateGraphic(single.id, { radius })}
                  />
                </div>
              )}

              {(single.kind === "ellipse" || single.kind === "arc") && (
                <div className="grid grid-cols-2 gap-1.5">
                  <NumberStepper
                    label="CX"
                    value={single.centerX}
                    min={0}
                    max={RM_CANVAS_WIDTH}
                    onChange={(centerX) => updateGraphic(single.id, { centerX })}
                  />
                  <NumberStepper
                    label="CY"
                    value={single.centerY}
                    min={0}
                    max={RM_CANVAS_HEIGHT}
                    onChange={(centerY) => updateGraphic(single.id, { centerY })}
                  />
                  <NumberStepper
                    label="Rx"
                    value={single.rx}
                    min={1}
                    max={RM_PROTOCOL_LIMITS.maxSemiAxis}
                    onChange={(rx) => updateGraphic(single.id, { rx })}
                  />
                  <NumberStepper
                    label="Ry"
                    value={single.ry}
                    min={1}
                    max={RM_PROTOCOL_LIMITS.maxSemiAxis}
                    onChange={(ry) => updateGraphic(single.id, { ry })}
                  />
                  {single.kind === "arc" && (
                    <>
                      <NumberStepper
                        label="起始"
                        value={single.startAngle}
                        min={0}
                        max={360}
                        unit="°"
                        onChange={(startAngle) =>
                          updateGraphic(single.id, { startAngle })
                        }
                      />
                      <NumberStepper
                        label="终止"
                        value={single.endAngle}
                        min={0}
                        max={360}
                        unit="°"
                        onChange={(endAngle) =>
                          updateGraphic(single.id, { endAngle })
                        }
                      />
                    </>
                  )}
                </div>
              )}

              {(single.kind === "float" ||
                single.kind === "int" ||
                single.kind === "text") && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberStepper
                      label="X"
                      value={single.x}
                      min={0}
                      max={RM_CANVAS_WIDTH}
                      onChange={(x) => updateGraphic(single.id, { x })}
                    />
                    <NumberStepper
                      label="Y"
                      value={single.y}
                      min={0}
                      max={RM_CANVAS_HEIGHT}
                      onChange={(y) => updateGraphic(single.id, { y })}
                    />
                    <NumberStepper
                      label="字号"
                      value={single.fontSize}
                      min={1}
                      max={RM_PROTOCOL_LIMITS.maxFontSize}
                      unit="px"
                      className="col-span-2"
                      onChange={(fontSize) =>
                        updateGraphic(single.id, { fontSize })
                      }
                    />
                  </div>

                  {single.kind === "float" && (
                    <div className="space-y-1">
                      <NumberStepper
                        label="浮点值"
                        value={single.value}
                        step={0.1}
                        onChange={(value) => updateGraphic(single.id, { value })}
                      />
                      <div className="mk-tabular text-[10px] text-[var(--mk-text-muted)]">
                        协议传输 int32(val×1000) ={" "}
                        {Math.round(single.value * 1000)}
                      </div>
                    </div>
                  )}

                  {single.kind === "int" && (
                    <NumberStepper
                      label="整数值"
                      value={single.value}
                      step={1}
                      onChange={(value) => updateGraphic(single.id, { value })}
                    />
                  )}

                  {single.kind === "text" && (() => {
                    const bytes = getUtf8ByteLength(single.text);
                    const overflow = bytes > RM_PROTOCOL_LIMITS.maxTextUtf8Bytes;
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--mk-text-secondary)]">
                            字符内容
                          </span>
                          <span
                            className={`mk-tabular font-medium ${
                              overflow
                                ? "text-[var(--mk-status-error)]"
                                : "text-[var(--mk-text-muted)]"
                            }`}
                          >
                            UTF-8: {bytes} / 30 B
                          </span>
                        </div>
                        <Input
                          value={single.text}
                          onChange={(e) =>
                            updateGraphic(single.id, { text: e.target.value })
                          }
                        />
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--mk-bg-surface)]">
                          <div
                            className={`h-full transition-all ${
                              overflow
                                ? "bg-[var(--mk-status-error)]"
                                : "bg-[var(--mk-accent-primary)]"
                            }`}
                            style={{
                              width: `${Math.min(100, (bytes / 30) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 协议外观属性（严格 9 色隔离） */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-[var(--mk-text-secondary)]">
                裁判系统外观属性（9 色隔离）
              </div>
              <ProtocolColorPicker
                value={single.color}
                team={previewTeam}
                onChange={(color: RmColorId) =>
                  updateGraphic(single.id, { color })
                }
              />

              <div className="grid grid-cols-2 gap-2">
                <NumberStepper
                  label="线宽"
                  value={single.lineWidth}
                  min={1}
                  max={1023}
                  unit="px"
                  onChange={(lineWidth) =>
                    updateGraphic(single.id, { lineWidth })
                  }
                />
                <SimpleSelect
                  value={String(single.layer)}
                  onValueChange={(v) =>
                    updateGraphic(single.id, { layer: Number(v) as LayerIndex })
                  }
                  options={layerOptions}
                />
              </div>

              <div className="flex items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-2.5 py-2">
                <div>
                  <div className="font-medium text-[var(--mk-text-primary)]">
                    动态刷新图元
                  </div>
                  <div className="text-[10px] text-[var(--mk-text-muted)]">
                    开启后参与模拟器实时遥测与 Modify 发包
                  </div>
                </div>
                <Switch
                  checked={single.dynamic}
                  onCheckedChange={(dynamic) =>
                    updateGraphic(single.id, { dynamic })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
