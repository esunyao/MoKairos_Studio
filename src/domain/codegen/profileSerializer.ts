import type {
  ApiEndpoint,
  BindRule,
  CodeFunctionInfo,
  CodegenDiagnostic,
  CodegenPresetInfo,
  CodegenProfile,
  CodeNodeUpsertResult,
  CodeNodeUpsertSpec,
  FlowGraph,
  FlowValueType,
  ModeOrRef,
  ParsedCodeFile,
  SymbolDecl,
  SymbolRef,
} from "./types";

/**
 * CodegenProfile ↔ TOML 确定性序列化、UTF-8 切片与浏览器预览期轻量校验/预设兜底
 */

const RESERVED_PREFIXES = new Set(["ui", "crc", "protocol", "frame", "referee"]);

const GENERIC_C_PRESET_TOML = `schema = 1
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

const UICRM_NEW_PRESET_TOML = `schema = 1
preset = "uicrm-new"
base = "official"
mode = "mapping"
prefix = "mk_hud"
cpp_wrapper = false
text_encoding = "utf8"
frames = []
custom_hooks = false

[transport]
kind = "payload"
send = { expr = "::g_referee->Transmit({cmd_id}, {data}, {len})", lang = "cpp", include = "referee.h" }
send_ok = "{ret} == ({len} + 9)"
max_frame = 128

[runtime]
min_interval_ms = 34
clear_layers_on_start = false
robot_id = { expr = "::g_referee_protocol->robot_status.robot_id", lang = "cpp", include = "seasons/2027/protocol.h" }
online = { expr = "::g_referee->IsOnline()", lang = "cpp" }
now_ms = { expr = "::bsp::GetHighresTickMilliSec()", lang = "cpp", include = "bsp_os.h", optional = true }
port_ready = { expr = "", lang = "cpp", optional = true }
lock = { expr = "taskENTER_CRITICAL()", lang = "c", include = "FreeRTOS.h", optional = true }
unlock = { expr = "taskEXIT_CRITICAL()", lang = "c", include = "task.h", optional = true }
`;

const UICRM_LEGACY_PRESET_TOML = `schema = 1
preset = "uicrm-legacy"
base = "official"
mode = "mapping"
prefix = "mk_hud"
cpp_wrapper = false
text_encoding = "utf8"
frames = []
custom_hooks = false

[transport]
kind = "frame"
write = { expr = "::g_referee_uart->Write({buf}, {len})", lang = "cpp", include = "bsp_uart.h" }
crc8 = { expr = "append_crc8_check_sum({buf}, {len})", lang = "c", include = "crc_check.h" }
crc16 = { expr = "append_crc16_check_sum({buf}, {len})", lang = "c", include = "crc_check.h" }
seq = "own"
max_frame = 128

[runtime]
min_interval_ms = 34
clear_layers_on_start = false
robot_id = { expr = "::g_referee->game_robot_status.robot_id", lang = "cpp", include = "boards/drivers/include/protocol.h" }
online = { expr = "::g_referee->IsOnline()", lang = "cpp" }
now_ms = { expr = "::bsp::GetHighresTickMilliSec()", lang = "cpp", include = "bsp_os.h", optional = true }
port_ready = { expr = "", lang = "cpp", optional = true }
lock = { expr = "taskENTER_CRITICAL()", lang = "c", include = "FreeRTOS.h", optional = true }
unlock = { expr = "taskEXIT_CRITICAL()", lang = "c", include = "task.h", optional = true }
`;

export const DEFAULT_GENERIC_C_TOML = GENERIC_C_PRESET_TOML;

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
    flows: { main: { nodes: [], edges: [] } },
  };
}

export const BUILTIN_PRESETS_FALLBACK: CodegenPresetInfo[] = [
  {
    id: "generic-c",
    name: "通用纯 C（API 模式）",
    description: "零外部符号依赖，生成 port_t 回调表与自定义公开接口，适合任何 C/C++ 固件接入。",
    mode: "api",
    transportKind: "payload",
    profileToml: GENERIC_C_PRESET_TOML,
    profile: createDefaultProfile(),
  },
  {
    id: "uicrm-new",
    name: "UICRM 新裁判栈（Payload 直通）",
    description: "Mapping 模式直接调用 ::referee::Referee::Transmit(0x0301, data, len)，不抢占外层帧与 seq。",
    mode: "mapping",
    transportKind: "payload",
    profileToml: UICRM_NEW_PRESET_TOML,
    profile: {
      schema: 1,
      preset: "uicrm-new",
      base: "official",
      mode: "mapping",
      prefix: "mk_hud",
      cpp_wrapper: false,
      text_encoding: "utf8",
      frames: [],
      custom_hooks: false,
      symbols: [],
      transport: {
        kind: "payload",
        send: { expr: "::g_referee->Transmit({cmd_id}, {data}, {len})", lang: "cpp", include: "referee.h" },
        send_ok: "{ret} == ({len} + 9)",
        max_frame: 128,
      },
      runtime: {
        min_interval_ms: 34,
        clear_layers_on_start: false,
        robot_id: { expr: "::g_referee_protocol->robot_status.robot_id", lang: "cpp", include: "seasons/2027/protocol.h" },
        online: { expr: "::g_referee->IsOnline()", lang: "cpp" },
        now_ms: { expr: "::bsp::GetHighresTickMilliSec()", lang: "cpp", include: "bsp_os.h", optional: true },
        port_ready: { expr: "", lang: "cpp", optional: true },
        lock: { expr: "taskENTER_CRITICAL()", lang: "c", include: "FreeRTOS.h", optional: true },
        unlock: { expr: "taskEXIT_CRITICAL()", lang: "c", include: "task.h", optional: true },
      },
      bind: [],
      api: [],
      flows: { main: { nodes: [], edges: [] } },
    },
  },
  {
    id: "uicrm-legacy",
    name: "UICRM 旧栈 / 自写串口（Frame 自封）",
    description: "Mapping 模式自行拼装 0xA5 帧，复用队伍已有 UART::Write 与 append_crc8/16_check_sum。",
    mode: "mapping",
    transportKind: "frame",
    profileToml: UICRM_LEGACY_PRESET_TOML,
    profile: {
      schema: 1,
      preset: "uicrm-legacy",
      base: "official",
      mode: "mapping",
      prefix: "mk_hud",
      cpp_wrapper: false,
      text_encoding: "utf8",
      frames: [],
      custom_hooks: false,
      symbols: [],
      transport: {
        kind: "frame",
        write: { expr: "::g_referee_uart->Write({buf}, {len})", lang: "cpp", include: "bsp_uart.h" },
        crc8: { expr: "append_crc8_check_sum({buf}, {len})", lang: "c", include: "crc_check.h" },
        crc16: { expr: "append_crc16_check_sum({buf}, {len})", lang: "c", include: "crc_check.h" },
        seq: "own",
        max_frame: 128,
      },
      runtime: {
        min_interval_ms: 34,
        clear_layers_on_start: false,
        robot_id: { expr: "::g_referee->game_robot_status.robot_id", lang: "cpp", include: "boards/drivers/include/protocol.h" },
        online: { expr: "::g_referee->IsOnline()", lang: "cpp" },
        now_ms: { expr: "::bsp::GetHighresTickMilliSec()", lang: "cpp", include: "bsp_os.h", optional: true },
        port_ready: { expr: "", lang: "cpp", optional: true },
        lock: { expr: "taskENTER_CRITICAL()", lang: "c", include: "FreeRTOS.h", optional: true },
        unlock: { expr: "taskEXIT_CRITICAL()", lang: "c", include: "task.h", optional: true },
      },
      bind: [],
      api: [],
      flows: { main: { nodes: [], edges: [] } },
    },
  },
];

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

function formatTomlKey(k: string): string {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : quoteStr(k);
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
      .map(([k, v]) => `${formatTomlKey(k)} = ${toTomlValue(v)}`);
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
    lines.push(`[flows.${formatTomlKey(flowId)}]`);
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

/** 按 UTF-8 字节偏移安全切片（兼容含中文注释的 C/C++ 文件与 Rust AST byte offset） */
export function sliceUtf8Bytes(text: string, startByte: number, endByte: number): string {
  const bytes = new TextEncoder().encode(text);
  const start = Math.max(0, Math.min(startByte, bytes.length));
  const end = Math.max(start, Math.min(endByte, bytes.length));
  return new TextDecoder().decode(bytes.subarray(start, end));
}

function mapCTypeToPort(raw: string, prefix: string): FlowValueType | undefined {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean === "float" || clean === "double") return "float";
  if (clean === "int" || clean === "bool" || clean === "_Bool") return "bool";
  if (clean === "int32_t" || clean === "uint16_t" || clean === "int16_t" || clean === "uint8_t") {
    return "int32";
  }
  if (clean === `${prefix}_color_t` || clean === "mk_color_t") return "color";
  if (clean === "const char *" || clean === "const char*" || clean === "char *") return "text";
  return undefined;
}

function portTypeToCType(t: FlowValueType, prefix: string): string {
  switch (t) {
    case "int32":
      return "int32_t";
    case "float":
      return "float";
    case "bool":
      return "int";
    case "color":
      return `${prefix}_color_t`;
    case "text":
      return "const char*";
  }
}

/** 浏览器预览兜底：解析顶层 C 函数签名（桌面端使用 Rust codefile 解析） */
export function parseCFileFallback(
  path: string,
  content: string,
  prefix: string,
): ParsedCodeFile {
  const encoder = new TextEncoder();
  const fnRe =
    /(?:^|\n)[ \t]*([a-zA-Z_][\w\s*]*?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;{}]*)\)\s*\{/g;
  const functions: CodeFunctionInfo[] = [];
  let match: RegExpExecArray | null;

  while ((match = fnRe.exec(content)) !== null) {
    const rawRet = match[1].trim();
    const name = match[2];
    const rawParams = match[3].trim();
    if (["if", "for", "while", "switch", "else"].includes(name)) continue;

    const fullPrefixStr = content.slice(0, match.index + match[0].length - 1);
    const startByte = encoder.encode(content.slice(0, match.index)).length;
    const bodyStartChar = match.index + match[0].length - 1;
    let depth = 0;
    let bodyEndChar = bodyStartChar;
    for (let i = bodyStartChar; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          bodyEndChar = i + 1;
          break;
        }
      }
    }
    const bodyStartByte = encoder.encode(fullPrefixStr).length;
    const bodyEndByte = encoder.encode(content.slice(0, bodyEndChar)).length;
    const startLine = fullPrefixStr.split("\n").length;

    const params =
      rawParams === "" || rawParams === "void"
        ? []
        : rawParams.split(",").map((part, idx) => {
            const cleaned = part.trim();
            const m = /^(.*?)\b([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(cleaned);
            const cType = m ? m[1].trim() : cleaned;
            const pName = m ? m[2] : `p${idx}`;
            return {
              name: pName,
              cType,
              portType: mapCTypeToPort(cType, prefix),
            };
          });
    const portReturn = mapCTypeToPort(rawRet, prefix);
    const wireable = Boolean(portReturn && params.every((p) => Boolean(p.portType)));

    functions.push({
      name,
      returnType: rawRet,
      portReturn,
      params,
      wireable,
      unsupportedReason: wireable ? undefined : "仅支持标量/颜色/const char* 参数与返回值",
      startByte,
      endByte: bodyEndByte,
      bodyStartByte,
      bodyEndByte,
      startLine,
    });
  }

  return { path, blocks: [], functions, diagnostics: [] };
}

/** 浏览器预览兜底：向 C 代码文件写入/更新节点函数（桌面端使用 Rust AST 局部替换） */
export function upsertCodeNodeFallback(
  path: string,
  content: string,
  prefix: string,
  spec: CodeNodeUpsertSpec,
): CodeNodeUpsertResult {
  const ret = portTypeToCType(spec.returnType, prefix);
  const sigParams =
    spec.params.length === 0
      ? "void"
      : spec.params.map((p) => `${portTypeToCType(p.type, prefix)} ${p.name}`).join(", ");
  const indentedBody = spec.body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : `    ${line.replace(/^\s{4}/, "")}`))
    .join("\n");
  const doc = spec.docComment ? `// ${spec.docComment}\n` : "";
  const fnBlock = `${doc}${ret} ${spec.name}(${sigParams}) {\n${indentedBody}\n}\n`;

  const parsedBefore = parseCFileFallback(path, content, prefix);
  const targetName = spec.originalName || spec.name;
  const existing = parsedBefore.functions.find((f) => f.name === targetName);

  let nextContent: string;
  if (existing) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    const before = new TextDecoder().decode(bytes.subarray(0, existing.startByte));
    const after = new TextDecoder().decode(bytes.subarray(existing.endByte));
    nextContent = `${before.replace(/\n*$/, "\n\n")}${fnBlock}${after}`;
  } else {
    const trimmed = content.trimEnd();
    nextContent = trimmed ? `${trimmed}\n\n${fnBlock}` : fnBlock;
  }

  return {
    content: nextContent,
    parsed: parseCFileFallback(path, nextContent, prefix),
  };
}

/** 浏览器预览兜底：轻量配置校验（提示缺失 prefix 或 mapping 必填符号） */
export function validateProfileLightweight(profile: CodegenProfile): CodegenDiagnostic[] {
  const diags: CodegenDiagnostic[] = [];
  const p = profile.prefix.trim();
  if (!p) {
    diags.push({
      severity: "error",
      code: "PROFILE_INVALID_PREFIX",
      location: "codegen/profile.toml",
      message: "全局符号前缀 prefix 不能为空",
    });
  } else if (!/^[a-z][a-z0-9_]{0,23}$/.test(p) || p.startsWith("ui_") || RESERVED_PREFIXES.has(p)) {
    diags.push({
      severity: "error",
      code: "PROFILE_INVALID_PREFIX",
      location: "codegen/profile.toml",
      message: `非法符号前缀 "${p}"（需为小写字母开头且禁止 ui_ / 保留前缀）`,
    });
  }

  if (profile.mode === "mapping") {
    if (profile.transport.kind === "payload") {
      if (!profile.transport.send?.expr?.trim() && !profile.transport.send?.symbol?.trim()) {
        diags.push({
          severity: "error",
          code: "PROFILE_MISSING_TRANSPORT",
          location: "transport.send",
          message: "Mapping + Payload 模式必须填写 transport.send",
        });
      }
    } else if (!profile.transport.write?.expr?.trim() && !profile.transport.write?.symbol?.trim()) {
      diags.push({
        severity: "error",
        code: "PROFILE_MISSING_TRANSPORT",
        location: "transport.write",
        message: "Mapping + Frame 模式必须填写 transport.write",
      });
    }
    if (!profile.runtime.robot_id?.expr?.trim() && !profile.runtime.robot_id?.symbol?.trim()) {
      diags.push({
        severity: "error",
        code: "PROFILE_MISSING_ROBOT_ID",
        location: "runtime.robot_id",
        message: "Mapping 模式必须填写 runtime.robot_id",
      });
    }
  }
  return diags;
}
