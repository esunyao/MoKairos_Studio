import { useEffect, useState } from "react";
import { Check, ChevronDown, Cpu, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SimpleSelect, Switch } from "@/components/ui/Controls";
import { Badge, Input } from "@/components/ui/Primitives";
import { cn } from "@/components/ui/cn";
import { toast } from "@/components/ui/toast";
import type {
  CodegenProfile,
  FlowValueType,
  ModeOrRef,
  ProfileTextEncoding,
  SymbolDecl,
  SymbolLang,
  SymbolRef,
} from "@/domain/codegen/types";
import { useCodegenStore } from "@/stores/useCodegenStore";
import { useDocumentStore } from "@/stores/useDocumentStore";

/**
 * 配置向导子页：官方预设（轮椅）、模式/通道配置、用户符号目录与 Runtime/Transport SymbolRef 映射
 */

function SymbolRefEditor({
  title,
  hint,
  value,
  placeholderExpr,
  allowOptional,
  onChange,
}: {
  title: string;
  hint?: string;
  value?: SymbolRef;
  placeholderExpr: string;
  allowOptional?: boolean;
  onChange: (next: SymbolRef | undefined) => void;
}) {
  const [modeState, setModeState] = useState<"expr" | "symbol">(() =>
    value?.symbol && !value?.expr ? "symbol" : "expr",
  );
  const [langState, setLangState] = useState<SymbolLang>(() => value?.lang ?? "cpp");

  useEffect(() => {
    if (value?.symbol && !value.expr) {
      setModeState("symbol");
    } else if (value?.expr) {
      setModeState("expr");
    }
    if (value?.lang) {
      setLangState(value.lang);
    }
  }, [value?.symbol, value?.expr, value?.lang]);

  const cur: SymbolRef = value ?? {
    expr: modeState === "expr" ? "" : undefined,
    symbol: modeState === "symbol" ? "" : undefined,
    lang: langState,
    optional: allowOptional,
  };
  const useSymbolMode = modeState === "symbol";

  const update = (patch: Partial<SymbolRef>) => {
    const merged: SymbolRef = { ...cur, ...patch };
    if (
      allowOptional &&
      !merged.symbol?.trim() &&
      !merged.expr?.trim() &&
      !merged.include?.trim() &&
      !merged.decl?.trim()
    ) {
      onChange(undefined);
      return;
    }
    onChange(merged);
  };

  return (
    <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/70 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-[var(--mk-text-primary)]">{title}</div>
          {hint && <div className="text-[11px] text-[var(--mk-text-muted)]">{hint}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const nextLang: SymbolLang = langState === "cpp" ? "c" : "cpp";
              setLangState(nextLang);
              if (value || !allowOptional) {
                update({ lang: nextLang });
              }
            }}
            className="rounded px-2 py-0.5 text-[11px] font-mono border border-[var(--mk-border-strong)] bg-[var(--mk-bg-panel)] text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)] cursor-pointer"
          >
            {langState === "cpp" ? "C++" : "C"}
          </button>
          <button
            type="button"
            onClick={() => {
              const nextMode = useSymbolMode ? "expr" : "symbol";
              setModeState(nextMode);
              if (value || !allowOptional) {
                update(
                  nextMode === "expr"
                    ? { expr: cur.symbol ?? cur.expr ?? "", symbol: undefined }
                    : { symbol: cur.expr ?? cur.symbol ?? "", expr: undefined },
                );
              }
            }}
            className="rounded px-2 py-0.5 text-[11px] border border-[var(--mk-border-subtle)] text-[var(--mk-text-secondary)] hover:text-[var(--mk-text-primary)] cursor-pointer"
          >
            {useSymbolMode ? "切换为 expr" : "切换为 symbol"}
          </button>
        </div>
      </div>

      <Input
        value={useSymbolMode ? (cur.symbol ?? "") : (cur.expr ?? "")}
        placeholder={useSymbolMode ? "填写已有函数或变量名（如 ::g_var）" : placeholderExpr}
        onChange={(e) =>
          useSymbolMode
            ? update({ symbol: e.target.value, expr: undefined, lang: langState })
            : update({ expr: e.target.value, symbol: undefined, lang: langState })
        }
        className="font-mono text-[11px]"
      />

      <div className="grid grid-cols-2 gap-2">
        <Input
          value={cur.include ?? ""}
          placeholder="include 路径，如 seasons/2027/protocol.h"
          onChange={(e) => update({ include: e.target.value || undefined })}
          className="font-mono text-[11px]"
        />
        <Input
          value={cur.decl ?? ""}
          placeholder="可选前向声明 decl（免 include 时填写）"
          onChange={(e) => update({ decl: e.target.value || undefined })}
          className="font-mono text-[11px]"
        />
      </div>
    </div>
  );
}

export function WizardTab() {
  const doc = useDocumentStore((s) => s.doc);
  const profile = useCodegenStore((s) => s.profile);
  const builtinPresets = useCodegenStore((s) => s.builtinPresets);
  const applyPreset = useCodegenStore((s) => s.applyPreset);
  const updateProfile = useCodegenStore((s) => s.updateProfile);

  const [newSymId, setNewSymId] = useState("");
  const [newSymLabel, setNewSymLabel] = useState("");
  const [newSymType, setNewSymType] = useState<FlowValueType>("float");
  const [newSymExpr, setNewSymExpr] = useState("");
  const [newSymInc, setNewSymInc] = useState("");
  const [newSymLang, setNewSymLang] = useState<SymbolLang>("cpp");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleAddSymbol = () => {
    const id = newSymId.trim();
    if (!id || !newSymExpr.trim()) {
      toast.warn("请填写符号 ID 与 C/C++ 访问表达式");
      return;
    }
    const decl: SymbolDecl = {
      id,
      label: newSymLabel.trim() || id,
      type: newSymType,
      ref: {
        expr: newSymExpr.trim(),
        lang: newSymLang,
        include: newSymInc.trim() || undefined,
      },
    };
    updateProfile((prev) => ({
      ...prev,
      symbols: [...prev.symbols.filter((s) => s.id !== id), decl],
    }));
    setNewSymId("");
    setNewSymLabel("");
    setNewSymExpr("");
    setNewSymInc("");
    toast.success(`已添加到组件符号目录：${id}`);
  };

  const setTransportModeRef = (
    field: "crc8" | "crc16" | "seq",
    modeOrRef: ModeOrRef,
  ) => {
    updateProfile((prev) => ({
      ...prev,
      transport: {
        ...prev.transport,
        [field]: modeOrRef,
      },
    }));
  };

  return (
    <div className="h-full w-full flex-1 overflow-y-auto p-5 pb-16 space-y-6">
      {/* 第 1 步：官方轮椅预设 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--mk-text-primary)] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--mk-accent-primary)]" />
              1. 选择官方架构预设（快速起步）
            </h3>
            <p className="text-xs text-[var(--mk-text-secondary)]">
              应用预设后可在此基础上替换为贵队已有的通信对象与变量，或前往「代码与基底」页自定义底层模板。
            </p>
          </div>
          {profile.preset && <Badge tone="accent">当前预设: {profile.preset}</Badge>}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {builtinPresets.map((preset) => {
            const active = profile.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  applyPreset(preset);
                  toast.success(`已套用预设「${preset.name}」`);
                }}
                className={cn(
                  "flex flex-col justify-between rounded-[var(--mk-radius-md)] border p-3.5 text-left transition-all cursor-pointer",
                  active
                    ? "border-[var(--mk-accent-primary)] bg-[var(--mk-accent-primary-tint)]"
                    : "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] hover:border-[var(--mk-border-strong)]",
                )}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--mk-text-primary)]">
                      {preset.name}
                    </span>
                    {active && <Check className="h-4 w-4 text-[var(--mk-accent-primary)]" />}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--mk-text-secondary)]">
                    {preset.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <Badge tone="neutral">{preset.mode}</Badge>
                  <Badge tone="neutral">{preset.transportKind}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 第 2 步：生成模式与全局开关 */}
      <section className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--mk-text-primary)] flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[var(--mk-accent-primary)]" />
          2. 架构模式、命名空间前缀与协议选项
        </h3>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mk-text-secondary)]">接入模式 (mode)</label>
            <SimpleSelect
              value={profile.mode}
              onValueChange={(val) =>
                updateProfile((p) => ({ ...p, mode: val as CodegenProfile["mode"] }))
              }
              options={[
                { value: "mapping", label: "mapping（硬编码复用现有模块）" },
                { value: "api", label: "api（纯数据 + 回调接口）" },
              ]}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mk-text-secondary)]">封帧通道 (transport.kind)</label>
            <SimpleSelect
              value={profile.transport.kind}
              onValueChange={(val) =>
                updateProfile((p) => ({
                  ...p,
                  transport: { ...p.transport, kind: val as CodegenProfile["transport"]["kind"] },
                }))
              }
              options={[
                { value: "payload", label: "payload（调用用户 Transmit）" },
                { value: "frame", label: "frame（自封 0xA5 帧调 Write）" },
              ]}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mk-text-secondary)]">全局符号前缀 (禁用 ui_)</label>
            <Input
              value={profile.prefix}
              onChange={(e) =>
                updateProfile((p) => ({ ...p, prefix: e.target.value.trim() }))
              }
              className="font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-[var(--mk-text-secondary)]">最小发包间隔 (ms)</label>
            <Input
              type="number"
              min={1}
              value={profile.runtime.min_interval_ms ?? 34}
              onChange={(e) =>
                updateProfile((p) => ({
                  ...p,
                  runtime: {
                    ...p.runtime,
                    min_interval_ms: Math.max(1, Number(e.target.value) || 34),
                  },
                }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-1">
          <label className="flex items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-3 py-2 text-xs">
            <span className="text-[var(--mk-text-secondary)]">额外生成 C++20 薄封装 (.hpp)</span>
            <Switch
              checked={profile.cpp_wrapper}
              onCheckedChange={(checked) =>
                updateProfile((p) => ({ ...p, cpp_wrapper: checked }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-3 py-2 text-xs">
            <span className="text-[var(--mk-text-secondary)]">上线前先发 0x0100 清图层</span>
            <Switch
              checked={Boolean(profile.runtime.clear_layers_on_start)}
              onCheckedChange={(checked) =>
                updateProfile((p) => ({
                  ...p,
                  runtime: { ...p.runtime, clear_layers_on_start: checked },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-3 py-2 text-xs">
            <span className="text-[var(--mk-text-secondary)]">启用 custom/ 业务钩子回调</span>
            <Switch
              checked={profile.custom_hooks}
              onCheckedChange={(checked) =>
                updateProfile((p) => ({ ...p, custom_hooks: checked }))
              }
            />
          </label>
        </div>
      </section>

      {/* 第 3 步：上位机与运行时映射（Mapping 模式展示） */}
      {profile.mode === "mapping" ? (
        <section className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--mk-text-primary)]">
            3. 复用已有上位机通信与运行时符号（Mapping 模式）
          </h3>
          <p className="text-xs text-[var(--mk-text-secondary)]">
            填写工程中已存在的发送器、机器人 ID 与在线判定表达式；C++ 符号自动生成 extern "C" 垫片，不污染纯 C 核心文件。
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {profile.transport.kind === "payload" ? (
              <div className="space-y-2">
                <SymbolRefEditor
                  title="transport.send（必填）"
                  hint="可用占位符：{cmd_id}、{data}、{len}"
                  value={profile.transport.send}
                  placeholderExpr="::g_referee->Transmit({cmd_id}, {data}, {len})"
                  onChange={(next) =>
                    updateProfile((p) => ({
                      ...p,
                      transport: { ...p.transport, send: next },
                    }))
                  }
                />
                <div className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)]/70 p-3 space-y-1.5">
                  <div className="text-xs font-medium text-[var(--mk-text-primary)]">
                    transport.send_ok 写完判定表达式
                  </div>
                  <Input
                    value={profile.transport.send_ok ?? "{ret} == {len}"}
                    onChange={(e) =>
                      updateProfile((p) => ({
                        ...p,
                        transport: { ...p.transport, send_ok: e.target.value },
                      }))
                    }
                    className="font-mono text-[11px]"
                    placeholder="{ret} == ({len} + 9)"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <SymbolRefEditor
                  title="transport.write（必填）"
                  hint="可用占位符：{buf}、{len}"
                  value={profile.transport.write}
                  placeholderExpr="::g_referee_uart->Write({buf}, {len})"
                  onChange={(next) =>
                    updateProfile((p) => ({
                      ...p,
                      transport: { ...p.transport, write: next },
                    }))
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span>CRC8 模式</span>
                      <button
                        type="button"
                        className="text-[var(--mk-accent-primary)] cursor-pointer"
                        onClick={() =>
                          setTransportModeRef(
                            "crc8",
                            typeof profile.transport.crc8 === "string"
                              ? { expr: "append_crc8_check_sum({buf}, {len})", lang: "c", include: "crc_check.h" }
                              : "builtin",
                          )
                        }
                      >
                        {typeof profile.transport.crc8 === "string" ? "切为外部符号" : "切为内置"}
                      </button>
                    </div>
                    {typeof profile.transport.crc8 !== "string" && (
                      <SymbolRefEditor
                        title="外部 CRC8 实现"
                        hint="可用占位符：{buf}、{len}"
                        value={profile.transport.crc8}
                        placeholderExpr="append_crc8_check_sum({buf}, {len})"
                        onChange={(next) =>
                          setTransportModeRef("crc8", next ?? "builtin")
                        }
                      />
                    )}
                  </div>
                  <div className="rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span>CRC16 模式</span>
                      <button
                        type="button"
                        className="text-[var(--mk-accent-primary)] cursor-pointer"
                        onClick={() =>
                          setTransportModeRef(
                            "crc16",
                            typeof profile.transport.crc16 === "string"
                              ? { expr: "append_crc16_check_sum({buf}, {len})", lang: "c", include: "crc_check.h" }
                              : "builtin",
                          )
                        }
                      >
                        {typeof profile.transport.crc16 === "string" ? "切为外部符号" : "切为内置"}
                      </button>
                    </div>
                    {typeof profile.transport.crc16 !== "string" && (
                      <SymbolRefEditor
                        title="外部 CRC16 实现"
                        hint="可用占位符：{buf}、{len}"
                        value={profile.transport.crc16}
                        placeholderExpr="append_crc16_check_sum({buf}, {len})"
                        onChange={(next) =>
                          setTransportModeRef("crc16", next ?? "builtin")
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <SymbolRefEditor
                title="runtime.robot_id（必填）"
                hint="返回本机 robot_id (uint16_t)"
                value={profile.runtime.robot_id}
                placeholderExpr="::g_referee_protocol->robot_status.robot_id"
                onChange={(next) =>
                  updateProfile((p) => ({
                    ...p,
                    runtime: { ...p.runtime, robot_id: next },
                  }))
                }
              />
              <SymbolRefEditor
                title="runtime.online（可选）"
                hint="留空时默认 robot_id != 0 即在线"
                value={profile.runtime.online}
                placeholderExpr="::g_referee->IsOnline()"
                allowOptional
                onChange={(next) =>
                  updateProfile((p) => ({
                    ...p,
                    runtime: { ...p.runtime, online: next },
                  }))
                }
              />
              <SymbolRefEditor
                title="runtime.now_ms（可选）"
                hint="映射后额外生成无参 poll_auto()"
                value={profile.runtime.now_ms}
                placeholderExpr="::bsp::GetHighresTickMilliSec()"
                allowOptional
                onChange={(next) =>
                  updateProfile((p) => ({
                    ...p,
                    runtime: { ...p.runtime, now_ms: next },
                  }))
                }
              />
            </div>
          </div>

          {/* 已有业务组件符号目录 */}
          <div className="pt-3 border-t border-[var(--mk-border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-[var(--mk-text-primary)]">
                已有业务组件符号目录（供「节点编排」作为数据源使用）
              </div>
              <Badge tone="neutral">{profile.symbols.length} 个已声明</Badge>
            </div>

            {profile.symbols.length > 0 && (
              <div className="space-y-1.5">
                {profile.symbols.map((sym) => (
                  <div
                    key={sym.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--mk-radius-sm)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] px-3 py-1.5 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <Badge tone="accent">{sym.type}</Badge>
                      <span className="font-mono font-semibold text-[var(--mk-text-primary)]">
                        {sym.id}
                      </span>
                      <span className="truncate font-mono text-[11px] text-[var(--mk-text-secondary)]">
                        {sym.ref.expr || sym.ref.symbol}
                      </span>
                      {sym.ref.include && (
                        <span className="text-[10px] text-[var(--mk-text-muted)]">
                          #{sym.ref.include}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        updateProfile((p) => ({
                          ...p,
                          symbols: p.symbols.filter((s) => s.id !== sym.id),
                        }))
                      }
                      aria-label="删除符号"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--mk-status-error)]" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 md:grid-cols-6 rounded-[var(--mk-radius-sm)] border border-dashed border-[var(--mk-border-strong)] p-2.5">
              <Input
                value={newSymId}
                onChange={(e) => setNewSymId(e.target.value)}
                placeholder="ID 如 bat_pct"
                className="font-mono text-[11px]"
              />
              <Input
                value={newSymLabel}
                onChange={(e) => setNewSymLabel(e.target.value)}
                placeholder="显示名 如 电池电量"
                className="text-[11px]"
              />
              <SimpleSelect
                value={newSymType}
                onValueChange={(v) => setNewSymType(v as FlowValueType)}
                options={[
                  { value: "float", label: "float" },
                  { value: "int32", label: "int32" },
                  { value: "bool", label: "bool" },
                  { value: "color", label: "color" },
                  { value: "text", label: "text" },
                ]}
              />
              <Input
                value={newSymExpr}
                onChange={(e) => setNewSymExpr(e.target.value)}
                placeholder="表达式 ::g_bat->Get()"
                className="font-mono text-[11px] md:col-span-2"
              />
              <div className="flex items-center gap-1.5">
                <Input
                  value={newSymInc}
                  onChange={(e) => setNewSymInc(e.target.value)}
                  placeholder="include"
                  className="font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => setNewSymLang((l) => (l === "cpp" ? "c" : "cpp"))}
                  className="shrink-0 rounded border border-[var(--mk-border-subtle)] px-1.5 py-1 text-[10px] font-mono cursor-pointer"
                >
                  {newSymLang}
                </button>
                <Button variant="primary" size="sm" onClick={handleAddSymbol}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)] p-4 space-y-2">
          <h3 className="text-sm font-semibold text-[var(--mk-text-primary)]">
            3. 纯数据 / API 模式已启用
          </h3>
          <p className="text-xs text-[var(--mk-text-secondary)]">
            生成代码不依赖任何用户头文件或全局变量，初始化时通过 <code>{profile.prefix}_port_t</code> 注入通信回调，并在「节点编排」页定义对外公开接口函数（支持单接口扇出更新多个图元）。
          </p>
        </section>
      )}

      {/* 第 4 步：高级运行时、帧与编码选项（折叠面板） */}
      <section className="rounded-[var(--mk-radius-md)] border border-[var(--mk-border-subtle)] bg-[var(--mk-bg-panel)]">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-[var(--mk-text-primary)] cursor-pointer hover:bg-[var(--mk-bg-surface)]/50 rounded-[var(--mk-radius-md)]"
        >
          <span>4. 高级运行时钩子、文字编码与导出画面过滤</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--mk-text-muted)] transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </button>

        {advancedOpen && (
          <div className="border-t border-[var(--mk-border-subtle)] p-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">文字编码 (text_encoding)</label>
                <SimpleSelect
                  value={profile.text_encoding}
                  onValueChange={(val) =>
                    updateProfile((p) => ({ ...p, text_encoding: val as ProfileTextEncoding }))
                  }
                  options={[
                    { value: "utf8", label: "UTF-8（推荐，兼容 2027 裁判系统）" },
                    { value: "utf16le", label: "UTF-16LE（宽字符）" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">最大单帧字节 (max_frame)</label>
                <Input
                  type="number"
                  min={32}
                  max={256}
                  value={profile.transport.max_frame ?? 128}
                  onChange={(e) =>
                    updateProfile((p) => ({
                      ...p,
                      transport: {
                        ...p.transport,
                        max_frame: Math.max(32, Math.min(256, Number(e.target.value) || 128)),
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[var(--mk-text-secondary)]">启动默认画面 (start_frame)</label>
                <SimpleSelect
                  value={profile.start_frame ?? "__auto__"}
                  onValueChange={(val) =>
                    updateProfile((p) => ({
                      ...p,
                      start_frame: val === "__auto__" ? undefined : val,
                    }))
                  }
                  options={[
                    { value: "__auto__", label: "默认首个画面" },
                    ...doc.frames.map((f) => ({ value: f.name, label: f.name })),
                  ]}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] text-[var(--mk-text-secondary)]">
                导出画面过滤（不勾选任何项表示导出全部 {doc.frames.length} 个画面）：
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.frames.map((f) => {
                  const selected = profile.frames.includes(f.name);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() =>
                        updateProfile((p) => ({
                          ...p,
                          frames: selected
                            ? p.frames.filter((name) => name !== f.name)
                            : [...p.frames, f.name],
                        }))
                      }
                      className={cn(
                        "rounded-[var(--mk-radius-sm)] border px-2.5 py-1 text-xs cursor-pointer transition-colors",
                        selected
                          ? "border-[var(--mk-accent-primary)] bg-[var(--mk-accent-primary-tint)] text-[var(--mk-accent-primary)] font-medium"
                          : "border-[var(--mk-border-subtle)] bg-[var(--mk-bg-surface)] text-[var(--mk-text-secondary)]",
                      )}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {profile.mode === "mapping" && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <SymbolRefEditor
                  title="runtime.port_ready（可选）"
                  hint="返回非 0 允许发送，0 则延迟本轮"
                  value={profile.runtime.port_ready}
                  placeholderExpr="BOARD_UART2.gState == HAL_UART_STATE_READY"
                  allowOptional
                  onChange={(next) =>
                    updateProfile((p) => ({ ...p, runtime: { ...p.runtime, port_ready: next } }))
                  }
                />
                <SymbolRefEditor
                  title="runtime.lock（可选临界区加锁）"
                  hint="例如 FreeRTOS taskENTER_CRITICAL()"
                  value={profile.runtime.lock}
                  placeholderExpr="taskENTER_CRITICAL()"
                  allowOptional
                  onChange={(next) =>
                    updateProfile((p) => ({ ...p, runtime: { ...p.runtime, lock: next } }))
                  }
                />
                <SymbolRefEditor
                  title="runtime.unlock（可选临界区解锁）"
                  hint="例如 FreeRTOS taskEXIT_CRITICAL()"
                  value={profile.runtime.unlock}
                  placeholderExpr="taskEXIT_CRITICAL()"
                  allowOptional
                  onChange={(next) =>
                    updateProfile((p) => ({ ...p, runtime: { ...p.runtime, unlock: next } }))
                  }
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
