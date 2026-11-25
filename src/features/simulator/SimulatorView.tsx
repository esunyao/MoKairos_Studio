import { useMemo, useState } from "react";
import {
  Cable,
  Play,
  RotateCcw,
  Send,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { TeamToggle } from "@/components/protocol/TeamToggle";
import { Button } from "@/components/ui/Button";
import { SimpleSelect, Slider } from "@/components/ui/Controls";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Badge, Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import {
  AdaptiveGlassSlot,
  LiquidGlassSurface,
} from "@/components/ui/liquid-glass";
import {
  ROBOT_ROLES_2027,
  deriveRobotAndClientIds,
  type RobotRole2027,
} from "@/domain/protocol/constants";
import {
  encodeFramePackets,
  formatHexBytes,
  type EncodedProtocolPacket,
} from "@/domain/protocol/crcAndFrame";
import { useDocumentDiagnostics } from "@/hooks/useDocumentDiagnostics";
import { CanvasStage } from "@/features/editor/CanvasStage";
import { useCanvasStore } from "@/stores/useCanvasStore";
import { useDocumentStore } from "@/stores/useDocumentStore";
import { useSimulatorStore, type SimulatorMode } from "@/stores/useSimulatorStore";

/**
 * HUD 双向模拟器视图
 * - Local Mock（本地模拟）：完整实时驱动所有动态图元并输出真实 0x0301 协议帧与 CRC16 校验日志
 * - From Robot / To Referee：展示 2027 ID 推导与串口配置占位说明
 */

export function SimulatorView() {
  const { activeFrame, budget } = useDocumentDiagnostics();
  const doc = useDocumentStore((s) => s.doc);
  const updateMeta = useDocumentStore((s) => s.updateMeta);
  const previewTeam = useCanvasStore((s) => s.previewTeam);
  const setPreviewTeam = useCanvasStore((s) => s.setPreviewTeam);

  const mode = useSimulatorStore((s) => s.mode);
  const setMode = useSimulatorStore((s) => s.setMode);
  const running = useSimulatorStore((s) => s.running);
  const setRunning = useSimulatorStore((s) => s.setRunning);
  const refreshHz = useSimulatorStore((s) => s.refreshHz);
  const setRefreshHz = useSimulatorStore((s) => s.setRefreshHz);
  const overrides = useSimulatorStore((s) => s.overrides);
  const setGraphicOverride = useSimulatorStore((s) => s.setGraphicOverride);
  const resetOverrides = useSimulatorStore((s) => s.resetOverrides);
  const packetLogs = useSimulatorStore((s) => s.packetLogs);
  const appendPacketLogs = useSimulatorStore((s) => s.appendPacketLogs);
  const clearPacketLogs = useSimulatorStore((s) => s.clearPacketLogs);

  const [selectedPacket, setSelectedPacket] =
    useState<EncodedProtocolPacket | null>(null);
  const [seqCounter, setSeqCounter] = useState(1);

  const ids = useMemo(
    () => deriveRobotAndClientIds(doc.robotRole, previewTeam),
    [doc.robotRole, previewTeam],
  );

  const dynamicGraphics = useMemo(
    () => activeFrame.graphics.filter((g) => g.dynamic),
    [activeFrame.graphics],
  );

  const activeBytes =
    budget.dynamicRefreshBytes > 0
      ? budget.dynamicRefreshBytes
      : budget.fullRefreshBytes;
  const estBandwidth = activeBytes * refreshHz;
  const bandwidthPct = Math.min(
    100,
    Math.round((estBandwidth / ids.bandwidthLimit) * 100),
  );

  const emitBurst = (operate: 1 | 2) => {
    const simulatedFrame = {
      ...activeFrame,
      graphics: activeFrame.graphics.map((g) => {
        const ov = overrides[g.id];
        if (!ov) return g;
        if (g.kind === "arc") {
          return {
            ...g,
            startAngle: ov.startAngle ?? g.startAngle,
            endAngle: ov.endAngle ?? g.endAngle,
          };
        }
        if (g.kind === "float" || g.kind === "int") {
          return { ...g, value: ov.value ?? g.value };
        }
        if (g.kind === "text") {
          return { ...g, text: ov.text ?? g.text };
        }
        return g;
      }),
    };

    const packets = encodeFramePackets({
      frame: simulatedFrame,
      senderId: ids.robotId,
      receiverId: ids.clientId ?? 0,
      operate,
      onlyDynamic: operate === 2,
      startSeq: seqCounter,
      direction: mode === "from_robot" ? "RX" : "TX",
    });

    if (packets.length > 0) {
      appendPacketLogs(packets);
      setSeqCounter((n) => (n + packets.length) & 0xff);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* 左侧主区：只读视口 + 底部协议日志抽屉 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1">
          <CanvasStage
            frame={activeFrame}
            editable={false}
            simOverrides={overrides}
          />
          <div className="pointer-events-none absolute top-3 left-3 z-20">
            <LiquidGlassSurface
              cornerRadius={999}
              elastic={true}
              contentClassName="flex items-center gap-2 px-3 py-1 text-[11px]"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  running ? "bg-[var(--mk-status-ok)]" : "bg-[var(--mk-text-muted)]"
                }`}
              />
              <AdaptiveGlassSlot as="span" className="inline-flex items-center">
                <span className="font-medium text-[var(--mk-text-primary)]">
                  只读模拟视口
                </span>
              </AdaptiveGlassSlot>
              <AdaptiveGlassSlot as="span" className="inline-flex items-center">
                <span className="mk-tabular text-[var(--mk-text-secondary)]">
                  ID: {ids.robotId} →{" "}
                  {ids.clientId ? `0x${ids.clientId.toString(16).toUpperCase()}` : "无选手端"}
                </span>
              </AdaptiveGlassSlot>
            </LiquidGlassSurface>
          </div>
        </div>

        {/* 底部协议帧检视抽屉 */}
        <div className="flex h-48 shrink-0 flex-col border-t border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--mk-border-subtle)] px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[var(--mk-accent-primary)]" />
              <span className="font-semibold text-[var(--mk-text-primary)]">
                0x0301 协议帧日志与 CRC16 检视
              </span>
              <Badge tone="neutral" className="mk-tabular">
                {packetLogs.length} / 500
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  clearPacketLogs();
                  setSelectedPacket(null);
                }}
              >
                <Trash2 className="h-3 w-3" />
                清空
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <table className="mk-tabular w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-[var(--mk-bg-surface)] text-[var(--mk-text-muted)]">
                  <tr>
                    <th className="px-3 py-1 font-medium">Time</th>
                    <th className="px-2 py-1 font-medium">Dir</th>
                    <th className="px-2 py-1 font-medium">Cmd / Sub</th>
                    <th className="px-2 py-1 font-medium">Sender → Client</th>
                    <th className="px-2 py-1 font-medium">Size</th>
                    <th className="px-2 py-1 font-medium">CRC</th>
                    <th className="px-2 py-1 font-medium">摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {packetLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-[var(--mk-text-muted)]"
                      >
                        调节右侧遥测滑块或点击「发送整帧突发」即可实时生成 0x0301 报文
                      </td>
                    </tr>
                  ) : (
                    packetLogs.map((pkt) => (
                      <tr
                        key={pkt.id}
                        onClick={() => setSelectedPacket(pkt)}
                        className={cn(
                          "border-t border-[var(--mk-border-subtle)]/60 transition-colors cursor-pointer",
                          selectedPacket?.id === pkt.id
                            ? "bg-[var(--mk-accent-primary-tint)]"
                            : "hover:bg-[var(--mk-bg-surface-hover)]",
                        )}
                      >
                        <td className="px-3 py-1 text-[var(--mk-text-secondary)]">
                          {pkt.timestamp}
                        </td>
                        <td className="px-2 py-1">
                          <Badge tone={pkt.direction === "TX" ? "accent" : "ok"}>
                            {pkt.direction}
                          </Badge>
                        </td>
                        <td className="px-2 py-1 text-[var(--mk-text-primary)]">
                          0x0301 / 0x{pkt.subCmdId.toString(16).toUpperCase().padStart(4, "0")}
                        </td>
                        <td className="px-2 py-1 text-[var(--mk-text-secondary)]">
                          {pkt.senderId} →{" "}
                          {pkt.receiverId
                            ? `0x${pkt.receiverId.toString(16).toUpperCase()}`
                            : "N/A"}
                        </td>
                        <td className="px-2 py-1">{pkt.totalBytes} B</td>
                        <td className="px-2 py-1">
                          <span
                            className={
                              pkt.crcValid
                                ? "text-[var(--mk-status-ok)]"
                                : "text-[var(--mk-status-error)]"
                            }
                          >
                            {pkt.crcValid ? "OK" : "ERR"}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-1 text-[var(--mk-text-secondary)]">
                          {pkt.summary}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {selectedPacket && (
              <div className="w-72 shrink-0 overflow-y-auto border-l border-[var(--mk-border-subtle)] bg-[var(--mk-bg-code)] p-2.5 text-[11px]">
                <div className="mb-1 flex items-center justify-between font-semibold text-[var(--mk-text-primary)]">
                  <span>原始帧字节 ({selectedPacket.totalBytes} B)</span>
                  <button
                    type="button"
                    onClick={() => setSelectedPacket(null)}
                    className="text-[var(--mk-text-muted)] hover:text-[var(--mk-text-primary)] cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
                <pre className="mk-tabular break-all whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--mk-accent-primary)]">
                  {formatHexBytes(selectedPacket.rawBytes)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧模拟控制面板 */}
      <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-xs">
          {/* 模式切换 */}
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-[var(--mk-text-primary)]">
              模拟器控制台
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-0.5 text-[11px]">
              {[
                { id: "local_mock" as SimulatorMode, label: "本地模拟" },
                { id: "from_robot" as SimulatorMode, label: "机器人上行" },
                { id: "to_referee" as SimulatorMode, label: "下发裁判" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "rounded-[4px] py-1 font-medium transition-colors cursor-pointer",
                    mode === m.id
                      ? "bg-[var(--mk-bg-panel)] text-[var(--mk-accent-primary)] shadow-sm"
                      : "text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)]",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {mode !== "local_mock" && (
            <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-status-warn)]/40 bg-[var(--mk-status-warn-tint)] p-2.5 text-[11px] text-[var(--mk-text-primary)]">
              <div className="flex items-center gap-1.5 font-semibold">
                <Cable className="h-3.5 w-3.5 text-[var(--mk-status-warn)]" />
                物理串口联调占位说明
              </div>
              <p className="mt-1 leading-relaxed text-[var(--mk-text-secondary)]">
                当前版本聚焦本地编辑与模拟验证；真实串口收发驱动将在后续迭代接入 Rust `serialport`。下方身份推导与帧编码仍可真实测试。
              </p>
            </div>
          )}

          {/* 身份与链路预算 */}
          <div className="space-y-2.5 rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--mk-text-primary)]">
                2027 链路身份推导
              </span>
              <TeamToggle
                team={previewTeam}
                onChange={setPreviewTeam}
                layoutId="sim-team-pill"
              />
            </div>

            <SimpleSelect
              value={doc.robotRole}
              onValueChange={(v) => updateMeta({ robotRole: v as RobotRole2027 })}
              options={ROBOT_ROLES_2027.map((r) => ({
                value: r.role,
                label: r.label,
              }))}
            />

            <div className="mk-tabular flex items-center justify-between text-[11px] text-[var(--mk-text-secondary)]">
              <span>
                发送 {ids.robotId} → 接收{" "}
                {ids.clientId ? `0x${ids.clientId.toString(16).toUpperCase()}` : "无"}
              </span>
              <span>上限 {ids.bandwidthLimit} B/s</span>
            </div>

            <div className="space-y-1">
              <div className="mk-tabular flex justify-between text-[11px]">
                <span className="text-[var(--mk-text-secondary)]">
                  模拟频率 {refreshHz} Hz · {estBandwidth} B/s
                </span>
                <span
                  className={
                    bandwidthPct > 85
                      ? "text-[var(--mk-status-warn)]"
                      : "text-[var(--mk-accent-primary)]"
                  }
                >
                  {bandwidthPct}%
                </span>
              </div>
              <Slider
                value={[refreshHz]}
                min={1}
                max={30}
                step={1}
                onValueChange={([hz]) => setRefreshHz(hz ?? 10)}
              />
            </div>
          </div>

          {/* 动态遥测变量控制列表 */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--mk-text-primary)]">
                动态变量遥测 ({dynamicGraphics.length})
              </span>
              <button
                type="button"
                onClick={resetOverrides}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)] cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                重置
              </button>
            </div>

            {dynamicGraphics.length === 0 ? (
              <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-3 text-[11px] text-[var(--mk-text-secondary)]">
                当前画面暂无标记为「动态刷新」的图元。请在编辑页右侧检查器开启对应图元的动态刷新开关。
              </div>
            ) : (
              <div className="space-y-2">
                {dynamicGraphics.map((g) => {
                  const ov = overrides[g.id];
                  return (
                    <div
                      key={g.id}
                      className="space-y-1.5 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[var(--mk-text-primary)]">
                          {g.displayName}
                        </span>
                        <span className="mk-tabular text-[10px] text-[var(--mk-accent-primary)]">
                          {g.varKey || `#${g.figureName}`}
                        </span>
                      </div>

                      {g.kind === "arc" && (
                        <div className="space-y-1">
                          <div className="mk-tabular flex justify-between text-[10px] text-[var(--mk-text-muted)]">
                            <span>终止角</span>
                            <span>{ov?.endAngle ?? g.endAngle}°</span>
                          </div>
                          <Slider
                            value={[ov?.endAngle ?? g.endAngle]}
                            min={0}
                            max={360}
                            step={1}
                            onValueChange={([deg]) => {
                              setGraphicOverride(g.id, { endAngle: deg ?? g.endAngle });
                              if (running) emitBurst(2);
                            }}
                          />
                        </div>
                      )}

                      {(g.kind === "float" || g.kind === "int") && (
                        <NumberStepper
                          label="值"
                          value={ov?.value ?? g.value}
                          step={g.kind === "float" ? 0.5 : 1}
                          onChange={(val) => {
                            setGraphicOverride(g.id, { value: val });
                            if (running) emitBurst(2);
                          }}
                        />
                      )}

                      {g.kind === "text" && (
                        <Input
                          value={ov?.text ?? g.text}
                          onChange={(e) => {
                            setGraphicOverride(g.id, { text: e.target.value });
                            if (running) emitBurst(2);
                          }}
                        />
                      )}

                      {g.kind === "line" && (
                        <div className="space-y-1">
                          <div className="mk-tabular flex justify-between text-[10px] text-[var(--mk-text-muted)]">
                            <span>终点 X</span>
                            <span>{ov?.endX ?? g.endX}</span>
                          </div>
                          <Slider
                            value={[ov?.endX ?? g.endX]}
                            min={Math.max(0, g.startX - 200)}
                            max={Math.min(1920, g.startX + 200)}
                            step={2}
                            onValueChange={([x]) => {
                              setGraphicOverride(g.id, { endX: x ?? g.endX });
                              if (running) emitBurst(2);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 底部触发按钮 */}
        <div className="flex gap-2 border-t border-[var(--mk-border-subtle)] p-3">
          <Button
            variant={running ? "secondary" : "primary"}
            size="md"
            onClick={() => setRunning(!running)}
          >
            {running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? "暂停监听" : "启动监听"}
          </Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => emitBurst(1)}
          >
            <Send className="h-3.5 w-3.5" />
            发送整帧突发
          </Button>
        </div>
      </aside>
    </div>
  );
}
