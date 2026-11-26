//! `codegen/profile.toml` 数据模型定义

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CodegenMode {
    Mapping,
    #[default]
    Api,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TransportKind {
    #[default]
    Payload,
    Frame,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SymbolLang {
    #[default]
    C,
    Cpp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProfileTextEncoding {
    #[default]
    Utf8,
    Utf16le,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlowValueType {
    Int32,
    Float,
    Bool,
    Color,
    Text,
}

impl FlowValueType {
    pub fn c_type(self, prefix: &str) -> String {
        match self {
            Self::Int32 => "int32_t".to_string(),
            Self::Float => "float".to_string(),
            Self::Bool => "int".to_string(),
            Self::Color => format!("{prefix}_color_t"),
            Self::Text => "const char*".to_string(),
        }
    }
}

/// 指向用户已有代码符号或表达式的引用
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SymbolRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expr: Option<String>,
    #[serde(default)]
    pub lang: SymbolLang,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decl: Option<String>,
    #[serde(default)]
    pub optional: bool,
}

impl SymbolRef {
    pub fn is_empty(&self) -> bool {
        self.symbol.as_deref().unwrap_or("").trim().is_empty()
            && self.expr.as_deref().unwrap_or("").trim().is_empty()
    }
}

/// 用户在向导中声明的现有业务组件符号（供节点图和代码补全使用）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SymbolDecl {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(rename = "type")]
    pub value_type: FlowValueType,
    #[serde(rename = "ref")]
    pub target_ref: SymbolRef,
}

/// 字符串或 SymbolRef（用于 crc8 / crc16 / seq）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ModeOrRef {
    Mode(String),
    Ref(SymbolRef),
}

impl Default for ModeOrRef {
    fn default() -> Self {
        Self::Mode("builtin".to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportConfig {
    #[serde(default)]
    pub kind: TransportKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send: Option<SymbolRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send_ok: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub write: Option<SymbolRef>,
    #[serde(default = "default_builtin")]
    pub crc8: ModeOrRef,
    #[serde(default = "default_builtin")]
    pub crc16: ModeOrRef,
    #[serde(default = "default_seq_own")]
    pub seq: ModeOrRef,
    #[serde(default = "default_max_frame")]
    pub max_frame: usize,
}

impl Default for TransportConfig {
    fn default() -> Self {
        Self {
            kind: TransportKind::Payload,
            send: None,
            send_ok: None,
            write: None,
            crc8: default_builtin(),
            crc16: default_builtin(),
            seq: default_seq_own(),
            max_frame: default_max_frame(),
        }
    }
}

fn default_builtin() -> ModeOrRef {
    ModeOrRef::Mode("builtin".to_string())
}

fn default_seq_own() -> ModeOrRef {
    ModeOrRef::Mode("own".to_string())
}

fn default_max_frame() -> usize {
    128
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeConfig {
    #[serde(default = "default_min_interval_ms")]
    pub min_interval_ms: u32,
    #[serde(default)]
    pub clear_layers_on_start: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub robot_id: Option<SymbolRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub online: Option<SymbolRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub now_ms: Option<SymbolRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port_ready: Option<SymbolRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock: Option<SymbolRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unlock: Option<SymbolRef>,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            min_interval_ms: default_min_interval_ms(),
            clear_layers_on_start: false,
            robot_id: None,
            online: None,
            now_ms: None,
            port_ready: None,
            lock: None,
            unlock: None,
        }
    }
}

fn default_min_interval_ms() -> u32 {
    34
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BindRule {
    pub target: String,
    pub source: SymbolRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period_ms: Option<u32>,
    #[serde(default = "default_true")]
    pub on_change: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiEndpoint {
    pub target: String,
    pub name: String,
    #[serde(rename = "type")]
    pub value_type: FlowValueType,
    #[serde(default)]
    pub group: String,
    #[serde(default = "default_true")]
    pub public: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowNode {
    pub id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "ref")]
    pub node_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default)]
    pub params: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<[f64; 2]>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FlowEdge {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct FlowGraph {
    #[serde(default)]
    pub nodes: Vec<FlowNode>,
    #[serde(default)]
    pub edges: Vec<FlowEdge>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub layout: BTreeMap<String, [f64; 2]>,
}

/// 完整的生成配置 `codegen/profile.toml`
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CodegenProfile {
    #[serde(default = "default_schema")]
    pub schema: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    #[serde(default = "default_base")]
    pub base: String,
    #[serde(default)]
    pub mode: CodegenMode,
    #[serde(default = "default_prefix")]
    pub prefix: String,
    #[serde(default)]
    pub cpp_wrapper: bool,
    #[serde(default)]
    pub text_encoding: ProfileTextEncoding,
    #[serde(default)]
    pub frames: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_frame: Option<String>,
    #[serde(default)]
    pub custom_hooks: bool,
    #[serde(default)]
    pub symbols: Vec<SymbolDecl>,
    #[serde(default)]
    pub transport: TransportConfig,
    #[serde(default)]
    pub runtime: RuntimeConfig,
    #[serde(default)]
    pub bind: Vec<BindRule>,
    #[serde(default)]
    pub api: Vec<ApiEndpoint>,
    #[serde(default)]
    pub flows: BTreeMap<String, FlowGraph>,
}

impl Default for CodegenProfile {
    fn default() -> Self {
        toml::from_str(include_str!("../../profiles/generic-c.toml"))
            .expect("generic-c preset must parse")
    }
}

fn default_schema() -> u32 {
    1
}

fn default_base() -> String {
    "official".to_string()
}

fn default_prefix() -> String {
    "mk_hud".to_string()
}

fn default_true() -> bool {
    true
}
