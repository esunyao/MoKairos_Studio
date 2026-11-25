//! 裁判系统协议校验命令

use crate::model::MkuiDocument;
use crate::protocol::validate::{RustPreflightReport, preflight_document};

#[tauri::command]
pub fn protocol_preflight(document: MkuiDocument) -> RustPreflightReport {
    preflight_document(&document)
}
