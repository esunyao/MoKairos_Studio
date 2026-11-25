//! MoKairos Studio Tauri 宿主入口与命令注册

pub mod archive;
pub mod commands;
pub mod error;
pub mod model;
pub mod protocol;
pub mod versioning;

use commands::{project_cmd, protocol_cmd, storage_cmd, version_cmd};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            project_cmd::project_save_mkui,
            project_cmd::project_open_mkui,
            project_cmd::project_read_manifest,
            project_cmd::project_read_text_file,
            project_cmd::project_write_text_file,
            version_cmd::version_commit,
            version_cmd::version_list,
            version_cmd::version_load_snapshot,
            version_cmd::version_export_commit,
            protocol_cmd::protocol_preflight,
            storage_cmd::recent_projects_load,
            storage_cmd::recent_projects_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
