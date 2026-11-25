//! .mkui 内置快照版本控制引擎

use std::collections::BTreeMap;
use std::fs::File;
use std::path::Path;

use chrono::Utc;
use sha2::{Digest, Sha256};
use zip::ZipArchive;

use crate::archive::pack::{
    atomic_write_bytes, build_manifest, compute_document_stats, read_preserved_entries,
    write_zip_entries_to_vec,
};
use crate::archive::unpack::{read_entry_bytes, read_optional_entry_bytes};
use crate::archive::{DESIGN_ENTRY, HISTORY_COMMITS_PREFIX, HISTORY_INDEX_ENTRY, MANIFEST_ENTRY};
use crate::error::{AppError, AppResult};
use crate::model::{MkuiDocument, VersionCommitEntry, VersionIndex};

/// 提交当前设计文档为 .mkui 包内不可变历史快照（同时更新工作区 design.msgpack）
pub fn commit_version_to_archive(
    path: &Path,
    doc: &MkuiDocument,
    message: &str,
    version_tag: Option<String>,
    author: &str,
) -> AppResult<VersionIndex> {
    let mut entries = read_preserved_entries(path)?;
    let mut index: VersionIndex = if let Some(idx_bytes) = entries.get(HISTORY_INDEX_ENTRY) {
        rmp_serde::from_slice(idx_bytes)?
    } else {
        VersionIndex::default()
    };

    let doc_bytes = rmp_serde::to_vec_named(doc)?;
    let mut hasher = Sha256::new();
    hasher.update(&doc_bytes);
    let sha256 = hex::encode(hasher.finalize());

    let commit_id = format!(
        "c_{}_{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        &uuid::Uuid::new_v4().simple().to_string()[..6]
    );
    let stats = compute_document_stats(doc);
    let clean_tag = version_tag.and_then(|t| {
        let trimmed = t.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    let entry = VersionCommitEntry {
        commit_id: commit_id.clone(),
        parent_id: index.head_commit_id.clone(),
        version_tag: clean_tag,
        message: if message.trim().is_empty() {
            "保存版本快照".to_string()
        } else {
            message.trim().to_string()
        },
        author: if author.trim().is_empty() {
            "Designer".to_string()
        } else {
            author.trim().to_string()
        },
        created_at: Utc::now().to_rfc3339(),
        sha256,
        frame_count: stats.frame_count,
        graphic_count: stats.graphic_count,
        text_count: stats.text_count,
    };

    // 写入历史快照与最新工作区
    entries.insert(
        format!("{HISTORY_COMMITS_PREFIX}{commit_id}.msgpack"),
        doc_bytes.clone(),
    );
    entries.insert(DESIGN_ENTRY.to_string(), doc_bytes);

    index.head_commit_id = Some(commit_id);
    index.commits.push(entry);

    let index_bytes = rmp_serde::to_vec_named(&index)?;
    entries.insert(HISTORY_INDEX_ENTRY.to_string(), index_bytes);

    let manifest = build_manifest(doc, index.head_commit_id.clone(), index.commits.len());
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
    entries.insert(MANIFEST_ENTRY.to_string(), manifest_bytes);

    let zip_bytes = write_zip_entries_to_vec(&entries)?;
    atomic_write_bytes(path, &zip_bytes)?;
    Ok(index)
}

/// 读取 .mkui 内的提交列表索引
pub fn list_versions_in_archive(path: &Path) -> AppResult<VersionIndex> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    match read_optional_entry_bytes(&mut archive, HISTORY_INDEX_ENTRY)? {
        Some(bytes) => Ok(rmp_serde::from_slice(&bytes)?),
        None => Ok(VersionIndex::default()),
    }
}

/// 读取指定 commit_id 的完整设计文档快照
pub fn load_commit_snapshot(path: &Path, commit_id: &str) -> AppResult<MkuiDocument> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let entry_name = format!("{HISTORY_COMMITS_PREFIX}{commit_id}.msgpack");
    let bytes = read_entry_bytes(&mut archive, &entry_name).map_err(|err| match err {
        AppError::InvalidArchive(_) => AppError::NotFound(format!("未找到提交快照: {commit_id}")),
        other => other,
    })?;
    let doc: MkuiDocument = rmp_serde::from_slice(&bytes)?;
    Ok(doc)
}

/// 将指定历史版本导出为独立的 .mkui 文件（以该版本作为当前工作区并保留历史记录）
pub fn export_commit_to_mkui(
    source_path: &Path,
    target_path: &Path,
    commit_id: &str,
) -> AppResult<()> {
    let snapshot_doc = load_commit_snapshot(source_path, commit_id)?;
    let mut entries: BTreeMap<String, Vec<u8>> = BTreeMap::new();

    let doc_bytes = rmp_serde::to_vec_named(&snapshot_doc)?;
    let stats = compute_document_stats(&snapshot_doc);
    let mut hasher = Sha256::new();
    hasher.update(&doc_bytes);
    let sha256 = hex::encode(hasher.finalize());

    let exported_commit_id = commit_id.to_string();
    let index = VersionIndex {
        head_commit_id: Some(exported_commit_id.clone()),
        commits: vec![VersionCommitEntry {
            commit_id: exported_commit_id.clone(),
            parent_id: None,
            version_tag: Some("exported".to_string()),
            message: format!("从历史版本 {commit_id} 导出"),
            author: "MoKairos Studio".to_string(),
            created_at: Utc::now().to_rfc3339(),
            sha256,
            frame_count: stats.frame_count,
            graphic_count: stats.graphic_count,
            text_count: stats.text_count,
        }],
    };

    entries.insert(
        format!("{HISTORY_COMMITS_PREFIX}{exported_commit_id}.msgpack"),
        doc_bytes.clone(),
    );
    entries.insert(DESIGN_ENTRY.to_string(), doc_bytes);
    entries.insert(HISTORY_INDEX_ENTRY.to_string(), rmp_serde::to_vec_named(&index)?);

    let manifest = build_manifest(&snapshot_doc, Some(exported_commit_id), 1);
    entries.insert(MANIFEST_ENTRY.to_string(), serde_json::to_vec_pretty(&manifest)?);

    let zip_bytes = write_zip_entries_to_vec(&entries)?;
    atomic_write_bytes(target_path, &zip_bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::archive::pack::save_mkui_archive;
    use crate::archive::unpack::{open_mkui_archive, read_mkui_manifest};
    use crate::model::{MkuiFrame, MkuiGraphic, MkuiGroup};

    fn sample_doc(text: &str) -> MkuiDocument {
        MkuiDocument {
            schema_version: 1,
            project_id: "proj_test".to_string(),
            name: "测试步兵HUD".to_string(),
            description: "单元测试样例".to_string(),
            robot_role: "infantry_3".to_string(),
            active_frame_id: "frm_1".to_string(),
            frames: vec![MkuiFrame {
                id: "frm_1".to_string(),
                name: "Main_HUD".to_string(),
                groups: vec![MkuiGroup {
                    id: "grp_1".to_string(),
                    name: "Core".to_string(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![
                    MkuiGraphic::Arc {
                        id: "g_1".to_string(),
                        figure_name: "g01".to_string(),
                        display_name: "超电弧".to_string(),
                        var_key: Some("supercap.arc".to_string()),
                        group_id: "grp_1".to_string(),
                        layer: 2,
                        color: 6,
                        line_width: 6,
                        dynamic: true,
                        visible: true,
                        locked: false,
                        center_x: 670,
                        center_y: 540,
                        rx: 180,
                        ry: 180,
                        start_angle: 225,
                        end_angle: 310,
                    },
                    MkuiGraphic::Text {
                        id: "g_2".to_string(),
                        figure_name: "g02".to_string(),
                        display_name: "模式状态".to_string(),
                        var_key: Some("chassis.spin".to_string()),
                        group_id: "grp_1".to_string(),
                        layer: 3,
                        color: 1,
                        line_width: 2,
                        dynamic: true,
                        visible: true,
                        locked: false,
                        x: 120,
                        y: 800,
                        font_size: 20,
                        text: text.to_string(),
                    },
                ],
            }],
            created_at: "2026-11-25T00:00:00Z".to_string(),
            updated_at: "2026-11-25T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn roundtrip_msgpack_archive_and_preserve_history() {
        let dir = tempfile::tempdir().unwrap();
        let mkui_path = dir.path().join("infantry.mkui");

        let doc_v1 = sample_doc("SPIN: OFF");
        let saved_v1 = save_mkui_archive(&mkui_path, &doc_v1, None).unwrap();
        let json_len = serde_json::to_vec(&doc_v1).unwrap().len();
        assert!(saved_v1.msgpack_bytes < json_len);

        // 提交 v1 快照
        let idx1 =
            commit_version_to_archive(&mkui_path, &doc_v1, "初始版本", Some("v1.0".into()), "Esuny")
                .unwrap();
        assert_eq!(idx1.commits.len(), 1);
        let c1_id = idx1.head_commit_id.clone().unwrap();

        // 修改并提交 v2 快照
        let doc_v2 = sample_doc("SPIN: ON");
        let idx2 =
            commit_version_to_archive(&mkui_path, &doc_v2, "开启小陀螺状态", Some("v2.0".into()), "Esuny")
                .unwrap();
        assert_eq!(idx2.commits.len(), 2);

        // 常规保存不应丢失历史快照
        let doc_v3 = sample_doc("SPIN: BOOST");
        let receipt = save_mkui_archive(&mkui_path, &doc_v3, None).unwrap();
        assert_eq!(receipt.manifest.commit_count, 2);

        let opened = open_mkui_archive(&mkui_path).unwrap();
        assert_eq!(opened.document, doc_v3);
        assert_eq!(opened.history.commits.len(), 2);

        // 读取清单
        let manifest = read_mkui_manifest(&mkui_path).unwrap();
        assert_eq!(manifest.stats.graphic_count, 2);
        assert_eq!(manifest.stats.text_count, 1);

        // 恢复 v1 快照并导出独立包
        let restored = load_commit_snapshot(&mkui_path, &c1_id).unwrap();
        assert_eq!(restored, doc_v1);

        let export_path = dir.path().join("v1_export.mkui");
        export_commit_to_mkui(&mkui_path, &export_path, &c1_id).unwrap();
        let exported_opened = open_mkui_archive(&export_path).unwrap();
        assert_eq!(exported_opened.document, doc_v1);
    }

    #[test]
    fn reject_zip_slip_paths() {
        use crate::archive::unpack::validate_archive_entry_name;
        assert!(validate_archive_entry_name("../evil.msgpack").is_err());
        assert!(validate_archive_entry_name("/abs/path").is_err());
        assert!(validate_archive_entry_name("C:\\evil").is_err());
        assert!(validate_archive_entry_name("history/commits/c_1.msgpack").is_ok());
    }
}
