import type {
  ApiEndpoint,
  BindRule,
  CodegenProfile,
  FlowGraph,
  ModeOrRef,
  SymbolDecl,
  SymbolRef,
} from "./types";

/**
 * CodegenProfile ↔ TOML 确定性序列化与轻量解析器
 * 保持与 Rust `serde` + `toml` 完全一致的字段布局。
 */

export const DEFAULT_GENERIC_C_TOML = `schema = 1
preset = "generic-c"
base = "official"
mode = "api"
prefix = "mk_hud"
cpp_wrapper = false
text_encoding = "utf8"
frames = []
custom_hooks = false

[transport]
kind = "payload"
max_frame = 128

[runtime]
min_interval_ms = 34
clear_layers_on_start = false
`;

export function createDefaultProfile(): CodegenProfile {
  return {
    schema: 1,
    preset: "generic-c",
    base: "official",
    mode: "api",
    prefix: "mk_hud",
    cpp_wrapper: false,
    text_encoding: "utf8",
    frames: [],
    custom_hooks: false,
    symbols: [],
    transport: {
      kind: "payload",
      crc8: "builtin",
      crc16: "builtin",
      seq: "own",
      max_frame: 128,
    },
    runtime: {
      min_interval_ms: 34,
      clear_layers_on_start: false,
    },
    bind: [],
    api: [],
    flows: {},
  };
}

function quoteStr(s: string): string {
  return JSON.stringify(s);
}

function formatSymbolRefInline(ref: SymbolRef): string {
  const parts: string[] = [];
  if (ref.symbol !== undefined && ref.symbol !== "") {
    parts.push(`symbol = ${quoteStr(ref.symbol)}`);
  } else if (ref.expr !== undefined) {
    parts.push(`expr = ${quoteStr(ref.expr)}`);
  }
  parts.push(`lang = ${quoteStr(ref.lang || "c")}`);
  if (ref.include && ref.include.trim() !== "") {
    parts.push(`include = ${quoteStr(ref.include.trim())}`);
  }
  if (ref.decl && ref.decl.trim() !== "") {
    parts.push(`decl = ${quoteStr(ref.decl.trim())}`);
  }
  if (ref.optional) {
    parts.push("optional = true");
  }
  return `{ ${parts.join(", ")} }`;
}

function formatModeOrRef(val: ModeOrRef | undefined, fallback: string): string {
  if (!val) return quoteStr(fallback);
  if (typeof val === "string") return quoteStr(val);
  return formatSymbolRefInline(val);
}

function toTomlValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  if (typeof val === "string") return quoteStr(val);
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "0";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (Array.isArray(val)) {
    return `[${val.map((item) => toTomlValue(item)).join(", ")}]`;
  }
  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k} = ${toTomlValue(v)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return '""';
}

export function serializeProfileToToml(profile: CodegenProfile): string {
  const lines: string[] = [];
  lines.push(`schema = ${profile.schema ?? 1}`);
  if (profile.preset) lines.push(`preset = ${quoteStr(profile.preset)}`);
  lines.push(`base = ${quoteStr(profile.base || "official")}`);
  lines.push(`mode = ${quoteStr(profile.mode)}`);
  lines.push(`prefix = ${quoteStr(profile.prefix)}`);
  lines.push(`cpp_wrapper = ${profile.cpp_wrapper ? "true" : "false"}`);
  lines.push(`text_encoding = ${quoteStr(profile.text_encoding || "utf8")}`);
  lines.push(`frames = [${(profile.frames ?? []).map(quoteStr).join(", ")}]`);
  if (profile.start_frame) {
    lines.push(`start_frame = ${quoteStr(profile.start_frame)}`);
  }
  lines.push(`custom_hooks = ${profile.custom_hooks ? "true" : "false"}`);
  lines.push("");

  for (const sym of profile.symbols ?? []) {
    lines.push("[[symbols]]");
    lines.push(`id = ${quoteStr(sym.id)}`);
    lines.push(`label = ${quoteStr(sym.label)}`);
    lines.push(`type = ${quoteStr(sym.type)}`);
    lines.push(`ref = ${formatSymbolRefInline(sym.ref)}`);
    lines.push("");
  }

  lines.push("[transport]");
  lines.push(`kind = ${quoteStr(profile.transport.kind)}`);
  if (profile.transport.kind === "payload") {
    if (profile.transport.send) {
      lines.push(`send = ${formatSymbolRefInline(profile.transport.send)}`);
    }
    if (profile.transport.send_ok) {
      lines.push(`send_ok = ${quoteStr(profile.transport.send_ok)}`);
    }
  } else {
    if (profile.transport.write) {
      lines.push(`write = ${formatSymbolRefInline(profile.transport.write)}`);
    }
    lines.push(`crc8 = ${formatModeOrRef(profile.transport.crc8, "builtin")}`);
    lines.push(`crc16 = ${formatModeOrRef(profile.transport.crc16, "builtin")}`);
    lines.push(`seq = ${formatModeOrRef(profile.transport.seq, "own")}`);
  }
  lines.push(`max_frame = ${profile.transport.max_frame ?? 128}`);
  lines.push("");

  lines.push("[runtime]");
  lines.push(`min_interval_ms = ${profile.runtime.min_interval_ms ?? 34}`);
  lines.push(`clear_layers_on_start = ${profile.runtime.clear_layers_on_start ? "true" : "false"}`);
  for (const key of ["robot_id", "online", "now_ms", "port_ready", "lock", "unlock"] as const) {
    const val = profile.runtime[key];
    if (val) {
      lines.push(`${key} = ${formatSymbolRefInline(val)}`);
    }
  }
  lines.push("");

  for (const b of profile.bind ?? []) {
    lines.push("[[bind]]");
    lines.push(`target = ${quoteStr(b.target)}`);
    lines.push(`source = ${formatSymbolRefInline(b.source)}`);
    if (b.flow) lines.push(`flow = ${quoteStr(b.flow)}`);
    if (b.period_ms !== undefined) lines.push(`period_ms = ${b.period_ms}`);
    lines.push(`on_change = ${b.on_change === false ? "false" : "true"}`);
    lines.push("");
  }

  for (const ep of profile.api ?? []) {
    lines.push("[[api]]");
    lines.push(`target = ${quoteStr(ep.target)}`);
    lines.push(`name = ${quoteStr(ep.name)}`);
    lines.push(`type = ${quoteStr(ep.type)}`);
    lines.push(`group = ${quoteStr(ep.group)}`);
    lines.push(`public = ${ep.public ? "true" : "false"}`);
    lines.push("");
  }

  for (const [flowId, graph] of Object.entries(profile.flows ?? {})) {
    lines.push(`[flows.${flowId}]`);
    const nodesToml = graph.nodes.map((n) => {
      const fields: string[] = [
        `id = ${quoteStr(n.id)}`,
        `kind = ${quoteStr(n.kind)}`,
      ];
      if (n.ref !== undefined) fields.push(`ref = ${quoteStr(n.ref)}`);
      if (n.label !== undefined) fields.push(`label = ${quoteStr(n.label)}`);
      fields.push(`params = ${toTomlValue(n.params ?? {})}`);
      if (n.position) fields.push(`position = [${n.position[0]}, ${n.position[1]}]`);
      return `{ ${fields.join(", ")} }`;
    });
    const edgesToml = graph.edges.map((e) => {
      const fields: string[] = [];
      if (e.id) fields.push(`id = ${quoteStr(e.id)}`);
      fields.push(`from = ${quoteStr(e.from)}`);
      fields.push(`to = ${quoteStr(e.to)}`);
      return `{ ${fields.join(", ")} }`;
    });
    lines.push(`nodes = [\n  ${nodesToml.join(",\n  ")}\n]`);
    lines.push(`edges = [\n  ${edgesToml.join(",\n  ")}\n]`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function cloneFlowGraph(graph: FlowGraph | undefined): FlowGraph {
  if (!graph) return { nodes: [], edges: [] };
  return JSON.parse(JSON.stringify(graph)) as FlowGraph;
}

export function normalizeSymbolRef(raw?: Partial<SymbolRef>): SymbolRef {
  return {
    symbol: raw?.symbol,
    expr: raw?.expr,
    lang: raw?.lang ?? "c",
    include: raw?.include,
    decl: raw?.decl,
    optional: raw?.optional,
  };
}

export function updateProfileSymbol(
  profile: CodegenProfile,
  nextSym: SymbolDecl,
  originalId?: string,
): CodegenProfile {
  const existingIdx = profile.symbols.findIndex((s) => s.id === (originalId ?? nextSym.id));
  const symbols = [...profile.symbols];
  if (existingIdx >= 0) symbols[existingIdx] = nextSym;
  else symbols.push(nextSym);
  return { ...profile, symbols };
}

export function upsertBindRule(profile: CodegenProfile, rule: BindRule): CodegenProfile {
  const idx = profile.bind.findIndex((b) => b.target === rule.target);
  const bind = [...profile.bind];
  if (idx >= 0) bind[idx] = rule;
  else bind.push(rule);
  return { ...profile, bind };
}

export function upsertApiEndpoint(profile: CodegenProfile, ep: ApiEndpoint): CodegenProfile {
  const idx = profile.api.findIndex((a) => a.name === ep.name);
  const api = [...profile.api];
  if (idx >= 0) api[idx] = ep;
  else api.push(ep);
  return { ...profile, api };
}
