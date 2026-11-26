//! 统一错误与结构化诊断定义（兼顾 CLI 编译器格式、JSON 输出与 Tauri IPC）

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("文件读写失败: {0}")]
    Io(#[from] std::io::Error),

    #[error("ZIP 归档处理失败: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("MessagePack 编解码失败: {0}")]
    MsgPackEncode(#[from] rmp_serde::encode::Error),

    #[error("MessagePack 解析失败: {0}")]
    MsgPackDecode(#[from] rmp_serde::decode::Error),

    #[error("JSON 处理失败: {0}")]
    Json(#[from] serde_json::Error),

    #[error("TOML 解析失败: {0}")]
    TomlDecode(#[from] toml::de::Error),

    #[error("TOML 序列化失败: {0}")]
    TomlEncode(#[from] toml::ser::Error),

    #[error("模板渲染失败: {0}")]
    Template(#[from] minijinja::Error),

    #[error("无效的 .mkui 工程归档: {0}")]
    InvalidArchive(String),

    #[error("归档安全校验未通过: {0}")]
    SecurityViolation(String),

    #[error("目标版本或资源不存在: {0}")]
    NotFound(String),

    #[error("生成配置校验失败: {0}")]
    Profile(String),

    #[error("代码生成失败: {0}")]
    Codegen(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// 结构化诊断信息（同时服务 CLI 报错与 Studio 一键跳转）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: String, // "error" | "warn"
    pub code: String,
    pub location: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frame_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub graphic_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
}

impl Diagnostic {
    pub fn error(code: impl Into<String>, location: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            severity: "error".to_string(),
            code: code.into(),
            location: location.into(),
            message: message.into(),
            detail: None,
            frame_id: None,
            graphic_id: None,
            flow_id: None,
            node_id: None,
            file: None,
            line: None,
        }
    }

    pub fn warn(code: impl Into<String>, location: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            severity: "warn".to_string(),
            code: code.into(),
            location: location.into(),
            message: message.into(),
            detail: None,
            frame_id: None,
            graphic_id: None,
            flow_id: None,
            node_id: None,
            file: None,
            line: None,
        }
    }

    pub fn is_error(&self) -> bool {
        self.severity == "error"
    }

    /// 格式化为类编译器 stderr 输出行
    pub fn format_cli(&self, source_label: &str) -> String {
        let sev = if self.is_error() { "error" } else { "warning" };
        if self.location.is_empty() {
            format!("{source_label}: {sev}: [{}] {}", self.code, self.message)
        } else {
            format!(
                "{source_label}:{}: {sev}: [{}] {}",
                self.location, self.code, self.message
            )
        }
    }
}
