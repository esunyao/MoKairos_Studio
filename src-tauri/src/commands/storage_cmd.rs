//! 跨平台最近工程索引持久化命令（存储于应用数据目录）

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::model::RecentProjectEntry;

fn recent_projects_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidArchive(format!("无法定位应用数据目录: {e}")))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("recent_projects.json"))
}

#[tauri::command]
pub fn recent_projects_load(app: AppHandle) -> AppResult<Vec<RecentProjectEntry>> {
    let path = recent_projects_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path)?;
    let list: Vec<RecentProjectEntry> = serde_json::from_str(&text).unwrap_or_default();
    Ok(list)
}

#[tauri::command]
pub fn recent_projects_save(
    app: AppHandle,
    entries: Vec<RecentProjectEntry>,
) -> AppResult<()> {
    let path = recent_projects_path(&app)?;
    let text = serde_json::to_string_pretty(&entries)?;
    fs::write(path, text.as_bytes())?;
    Ok(())
}
