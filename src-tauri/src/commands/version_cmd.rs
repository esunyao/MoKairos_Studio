//! .mkui 包内版本控制命令

use std::path::PathBuf;

use crate::error::AppResult;
use crate::model::{MkuiDocument, VersionIndex};
use crate::versioning::snapshot::{
    commit_version_to_archive, export_commit_to_mkui, list_versions_in_archive,
    load_commit_snapshot,
};

#[tauri::command]
pub fn version_commit(
    file_path: String,
    document: MkuiDocument,
    message: String,
    version_tag: Option<String>,
    author: Option<String>,
) -> AppResult<VersionIndex> {
    let path = PathBuf::from(file_path);
    commit_version_to_archive(
        &path,
        &document,
        &message,
        version_tag,
        author.as_deref().unwrap_or("Designer"),
    )
}

#[tauri::command]
pub fn version_list(file_path: String) -> AppResult<VersionIndex> {
    let path = PathBuf::from(file_path);
    list_versions_in_archive(&path)
}

#[tauri::command]
pub fn version_load_snapshot(file_path: String, commit_id: String) -> AppResult<MkuiDocument> {
    let path = PathBuf::from(file_path);
    load_commit_snapshot(&path, &commit_id)
}

#[tauri::command]
pub fn version_export_commit(
    source_path: String,
    target_path: String,
    commit_id: String,
) -> AppResult<()> {
    export_commit_to_mkui(&PathBuf::from(source_path), &PathBuf::from(target_path), &commit_id)
}
