//! .mkui 与兼容文本工程读写命令

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::Deserialize;

use crate::archive::pack::save_mkui_archive;
use crate::archive::unpack::{open_mkui_archive, read_mkui_manifest};
use crate::error::AppResult;
use crate::model::{
    MkuiDocument, MkuiManifest, OpenedMkuiProject, SavedMkuiReceipt, VersionIndex,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingHistoryPayload {
    pub index: VersionIndex,
    pub snapshots: BTreeMap<String, MkuiDocument>,
}

/// 保存设计文档到 .mkui（ZIP + MessagePack），保留原有历史快照或写入草稿暂存历史
#[tauri::command]
pub fn project_save_mkui(
    file_path: String,
    document: MkuiDocument,
    pending_history: Option<PendingHistoryPayload>,
) -> AppResult<SavedMkuiReceipt> {
    let path = PathBuf::from(file_path);
    let pending = pending_history.map(|p| (p.index, p.snapshots));
    save_mkui_archive(&path, &document, pending)
}

/// 打开并校验 .mkui 工程
#[tauri::command]
pub fn project_open_mkui(file_path: String) -> AppResult<OpenedMkuiProject> {
    let path = PathBuf::from(file_path);
    open_mkui_archive(&path)
}

/// 仅快速读取 .mkui 内明文 manifest.json
#[tauri::command]
pub fn project_read_manifest(file_path: String) -> AppResult<MkuiManifest> {
    let path = PathBuf::from(file_path);
    read_mkui_manifest(&path)
}

/// 读取 UTF-8 文本文件（用于导入 .rmui / .json）
#[tauri::command]
pub fn project_read_text_file(file_path: String) -> AppResult<String> {
    let content = fs::read_to_string(file_path)?;
    Ok(content)
}

/// 写入 UTF-8 文本文件（用于兼容导出 .rmui / .json，强制 LF 换行）
#[tauri::command]
pub fn project_write_text_file(file_path: String, content: String) -> AppResult<()> {
    let path = PathBuf::from(file_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let normalized = content.replace("\r\n", "\n");
    fs::write(path, normalized.as_bytes())?;
    Ok(())
}
