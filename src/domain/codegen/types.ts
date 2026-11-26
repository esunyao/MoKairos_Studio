import type { MkuiDocument } from "@/domain/protocol/types";

/**
 * 代码生成前端领域模型（与 Rust mokairos-codegen serde 结构 1:1 对齐）
 */

export type CodegenMode = "mapping" | "api";
export type TransportKind = "payload" | "frame";
export type SymbolLang = "c" | "cpp";
export type ProfileTextEncoding = "utf8" | "utf16le";
export type FlowValueType = "int32" | "float" | "bool" | "color" | "text";

export interface SymbolRef {
  symbol?: string;
  expr?: string;
  lang: SymbolLang;
  include?: string;
  decl?: string;
  optional?: boolean;
}

export interface SymbolDecl {
  id: string;
  label: string;
  type: FlowValueType;
  ref: SymbolRef;
}

export type ModeOrRef = string | SymbolRef;

export interface TransportConfig {
  kind: TransportKind;
  send?: SymbolRef;
  send_ok?: string;
  write?: SymbolRef;
  crc8?: ModeOrRef;
  crc16?: ModeOrRef;
  seq?: ModeOrRef;
  max_frame?: number;
}

export interface RuntimeConfig {
  min_interval_ms?: number;
  clear_layers_on_start?: boolean;
  robot_id?: SymbolRef;
  online?: SymbolRef;
  now_ms?: SymbolRef;
  port_ready?: SymbolRef;
  lock?: SymbolRef;
  unlock?: SymbolRef;
}

export interface BindRule {
  target: string;
  source: SymbolRef;
  flow?: string;
  period_ms?: number;
  on_change?: boolean;
}

export interface ApiEndpoint {
  target: string;
  name: string;
  type: FlowValueType;
  group: string;
  public: boolean;
}

export interface FlowNode {
  id: string;
  kind: string;
  ref?: string;
  label?: string;
  params: Record<string, unknown>;
  position?: [number, number];
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  layout?: Record<string, [number, number]>;
}

export interface CodegenProfile {
  schema: number;
  preset?: string;
  base: string;
  mode: CodegenMode;
  prefix: string;
  cpp_wrapper: boolean;
  text_encoding: ProfileTextEncoding;
  frames: string[];
  start_frame?: string;
  custom_hooks: boolean;
  symbols: SymbolDecl[];
  transport: TransportConfig;
  runtime: RuntimeConfig;
  bind: BindRule[];
  api: ApiEndpoint[];
  flows: Record<string, FlowGraph>;
}

export interface CodegenBundle {
  profileToml: string;
  codeFiles: Record<string, string>;
  libOverrides: Record<string, string>;
}

export interface CodegenDiagnostic {
  severity: "error" | "warn";
  code: string;
  location: string;
  message: string;
  detail?: string;
  frameId?: string;
  graphicId?: string;
  flowId?: string;
  nodeId?: string;
  file?: string;
  line?: number;
}

export interface CodegenPresetInfo {
  id: string;
  name: string;
  description: string;
  mode: CodegenMode;
  transportKind: TransportKind;
  profileToml: string;
  profile: CodegenProfile;
}

export interface CodeParam {
  name: string;
  cType: string;
  portType?: FlowValueType;
}

export interface CodeFunctionInfo {
  name: string;
  returnType: string;
  portReturn?: FlowValueType;
  params: CodeParam[];
  docComment?: string;
  wireable: boolean;
  unsupportedReason?: string;
  startByte: number;
  endByte: number;
  bodyStartByte: number;
  bodyEndByte: number;
  startLine: number;
}

export type CodeBlock =
  | {
      kind: "function";
      startByte: number;
      endByte: number;
      function: CodeFunctionInfo;
    }
  | {
      kind: "declaration";
      startByte: number;
      endByte: number;
      preview: string;
    }
  | {
      kind: "verbatim";
      startByte: number;
      endByte: number;
    };

export interface ParsedCodeFile {
  path: string;
  blocks: CodeBlock[];
  functions: CodeFunctionInfo[];
  diagnostics: CodegenDiagnostic[];
}

export interface CodeNodeUpsertSpec {
  name: string;
  originalName?: string;
  returnType: FlowValueType;
  params: Array<{ name: string; type: FlowValueType }>;
  docComment?: string;
  body: string;
}

export interface CodeNodeUpsertResult {
  content: string;
  parsed: ParsedCodeFile;
}

export interface CodegenPreviewResult {
  prefix: string;
  files: Record<string, string>;
  outputList: string[];
  diagnostics: CodegenDiagnostic[];
}

export interface ExportCmakeResult {
  cmakePath: string;
  snippet: string;
}

export interface ExportSourcesResult {
  targetDir: string;
  writtenFiles: string[];
  customScaffoldPath?: string;
  customScaffoldCreated: boolean;
  diagnostics: CodegenDiagnostic[];
}

export interface DynamicTargetOption {
  target: string;
  label: string;
  frameName: string;
  graphicId: string;
  frameId: string;
  field: string;
  valueType: FlowValueType;
}

/** 列出当前设计文档中所有可连线的图元字段目标 */
export function collectGraphicTargetOptions(doc: MkuiDocument): DynamicTargetOption[] {
  const options: DynamicTargetOption[] = [];
  for (const frame of doc.frames) {
    for (const g of frame.graphics) {
      const key = g.varKey || g.figureName;
      const baseLabel = `${frame.name} / ${g.displayName} (${key})`;
      if (g.kind === "line" || g.kind === "rect") {
        options.push({
          target: `${key}.percent`,
          label: `${baseLabel} · 比例(percent)`,
          frameName: frame.name,
          graphicId: g.id,
          frameId: frame.id,
          field: "percent",
          valueType: "float",
        });
      }
      if (g.kind === "float") {
        options.push({
          target: `${key}.value`,
          label: `${baseLabel} · 浮点值(value)`,
          frameName: frame.name,
          graphicId: g.id,
          frameId: frame.id,
          field: "value",
          valueType: "float",
        });
      }
      if (g.kind === "int") {
        options.push({
          target: `${key}.value`,
          label: `${baseLabel} · 整数值(value)`,
          frameName: frame.name,
          graphicId: g.id,
          frameId: frame.id,
          field: "value",
          valueType: "int32",
        });
      }
      if (g.kind === "text") {
        options.push({
          target: `${key}.text`,
          label: `${baseLabel} · 文本(text)`,
          frameName: frame.name,
          graphicId: g.id,
          frameId: frame.id,
          field: "text",
          valueType: "text",
        });
      }
      options.push({
        target: `${key}.color`,
        label: `${baseLabel} · 颜色(color)`,
        frameName: frame.name,
        graphicId: g.id,
        frameId: frame.id,
        field: "color",
        valueType: "color",
      });
      options.push({
        target: `${key}.visible`,
        label: `${baseLabel} · 显隐(visible)`,
        frameName: frame.name,
        graphicId: g.id,
        frameId: frame.id,
        field: "visible",
        valueType: "bool",
      });
    }
  }
  return options;
}
