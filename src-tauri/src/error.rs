//! 统一桌面端错误定义（支持 Tauri invoke 序列化返回）

use serde::Serialize;
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

    #[error("无效的 .mkui 工程归档: {0}")]
    InvalidArchive(String),

    #[error("归档安全校验未通过: {0}")]
    SecurityViolation(String),

    #[error("目标版本或资源不存在: {0}")]
    NotFound(String),
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
