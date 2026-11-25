//! .mkui 压缩包清单、版本提交记录与最近工程索引模型

use serde::{Deserialize, Serialize};

use super::MkuiDocument;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSpec {
    pub width: u32,
    pub height: u32,
    pub origin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManifestStats {
    pub frame_count: usize,
    pub graphic_count: usize,
    pub text_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MkuiManifest {
    pub format: String,
    pub schema_version: u32,
    pub app_version: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub robot_role: String,
    pub canvas: CanvasSpec,
    pub active_frame_id: String,
    pub head_commit_id: Option<String>,
    pub commit_count: usize,
    pub stats: ManifestStats,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionCommitEntry {
    pub commit_id: String,
    pub parent_id: Option<String>,
    pub version_tag: Option<String>,
    pub message: String,
    pub author: String,
    pub created_at: String,
    pub sha256: String,
    pub frame_count: usize,
    pub graphic_count: usize,
    pub text_count: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VersionIndex {
    pub head_commit_id: Option<String>,
    pub commits: Vec<VersionCommitEntry>,
}

/// 打开 .mkui 工程时返回给前端的完整结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedMkuiProject {
    pub file_path: String,
    pub manifest: MkuiManifest,
    pub document: MkuiDocument,
    pub history: VersionIndex,
    pub archive_size_bytes: u64,
}

/// 保存 .mkui 工程后的统计回执
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMkuiReceipt {
    pub file_path: String,
    pub manifest: MkuiManifest,
    pub archive_size_bytes: u64,
    pub msgpack_bytes: usize,
}

/// 最近工程缓存记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProjectEntry {
    pub project_id: String,
    pub name: String,
    pub file_path: String,
    pub robot_role: String,
    pub frame_count: usize,
    pub graphic_count: usize,
    pub head_commit_id: Option<String>,
    pub commit_count: usize,
    pub updated_at: String,
}
