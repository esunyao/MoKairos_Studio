//! .mkui ZIP + MessagePack 原子打包器
//! 约定：常规保存时自动保留归档中已有的 history/ 与 assets/ 条目，避免覆盖丢失历史记录。

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use chrono::Utc;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::archive::unpack::validate_archive_entry_name;
use crate::archive::{DESIGN_ENTRY, HISTORY_INDEX_ENTRY, MANIFEST_ENTRY};
use crate::error::AppResult;
use crate::model::{
    CanvasSpec, ManifestStats, MkuiDocument, MkuiManifest, SavedMkuiReceipt, VersionIndex,
};

/// 统计文档中的帧、图元与字符数量
pub fn compute_document_stats(doc: &MkuiDocument) -> ManifestStats {
    let mut graphic_count = 0usize;
    let mut text_count = 0usize;
    for frame in &doc.frames {
        graphic_count += frame.graphics.len();
        text_count += frame.graphics.iter().filter(|g| g.is_text()).count();
    }
    ManifestStats {
        frame_count: doc.frames.len(),
        graphic_count,
        text_count,
    }
}

/// 生成与文档同步的 manifest.json 元信息
pub fn build_manifest(
    doc: &MkuiDocument,
    head_commit_id: Option<String>,
    commit_count: usize,
) -> MkuiManifest {
    let now = Utc::now().to_rfc3339();
    MkuiManifest {
        format: "mkui".to_string(),
        schema_version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        project_id: doc.project_id.clone(),
        name: doc.name.clone(),
        description: doc.description.clone(),
        robot_role: doc.robot_role.clone(),
        canvas: CanvasSpec {
            width: 1920,
            height: 1080,
            origin: "bottom-left".to_string(),
        },
        active_frame_id: doc.active_frame_id.clone(),
        head_commit_id,
        commit_count,
        stats: compute_document_stats(doc),
        created_at: if doc.created_at.is_empty() {
            now.clone()
        } else {
            doc.created_at.clone()
        },
        updated_at: now,
    }
}

/// 读取已有 .mkui 包中除核心主文件外的附属条目（如 history/ 与 assets/）
pub fn read_preserved_entries(path: &Path) -> AppResult<BTreeMap<String, Vec<u8>>> {
    let mut preserved = BTreeMap::new();
    if !path.exists() {
        return Ok(preserved);
    }

    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        validate_archive_entry_name(&name)?;
        if name == MANIFEST_ENTRY || name == DESIGN_ENTRY {
            continue;
        }
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf)?;
        preserved.insert(name, buf);
    }
    Ok(preserved)
}

/// 原子写入 ZIP 字节流到目标文件（Windows 下安全处理已存在目标的替换）
pub fn atomic_write_bytes(target_path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = target_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let file_name = target_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("archive.mkui");
    let tmp_path: PathBuf = target_path.with_file_name(format!(
        ".{file_name}.{}.tmp",
        uuid::Uuid::new_v4().simple()
    ));

    {
        let mut tmp_file = File::create(&tmp_path)?;
        tmp_file.write_all(bytes)?;
        tmp_file.sync_all()?;
    }

    if target_path.exists() {
        let backup_path = target_path.with_file_name(format!(
            ".{file_name}.{}.bak",
            uuid::Uuid::new_v4().simple()
        ));
        fs::rename(target_path, &backup_path)?;
        match fs::rename(&tmp_path, target_path) {
            Ok(()) => {
                let _ = fs::remove_file(&backup_path);
            }
            Err(err) => {
                let _ = fs::rename(&backup_path, target_path);
                let _ = fs::remove_file(&tmp_path);
                return Err(err.into());
            }
        }
    } else {
        if let Err(err) = fs::rename(&tmp_path, target_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(err.into());
        }
    }

    Ok(())
}

/// 将条目表打包为 Deflate ZIP 字节流
pub fn write_zip_entries_to_vec(entries: &BTreeMap<String, Vec<u8>>) -> AppResult<Vec<u8>> {
    let cursor = std::io::Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for (name, content) in entries {
        validate_archive_entry_name(name)?;
        writer.start_file(name, options)?;
        writer.write_all(content)?;
    }

    let cursor = writer.finish()?;
    Ok(cursor.into_inner())
}

/// 保存工作区文档到 .mkui，并保留或初始化版本历史
pub fn save_mkui_archive(
    path: &Path,
    doc: &MkuiDocument,
    pending_commits: Option<(VersionIndex, BTreeMap<String, MkuiDocument>)>,
) -> AppResult<SavedMkuiReceipt> {
    let mut entries = read_preserved_entries(path)?;

    // 解析现有版本索引或使用传入的待落盘历史（用于新建草稿首次保存）
    let existing_index: VersionIndex = if let Some(raw_index) = entries.get(HISTORY_INDEX_ENTRY) {
        rmp_serde::from_slice(raw_index)?
    } else {
        VersionIndex::default()
    };

    let active_index = if let Some((pending_index, pending_docs)) = pending_commits {
        if existing_index.commits.is_empty() && !pending_index.commits.is_empty() {
            for (commit_id, snap_doc) in pending_docs {
                let snap_bytes = rmp_serde::to_vec_named(&snap_doc)?;
                entries.insert(format!("history/commits/{commit_id}.msgpack"), snap_bytes);
            }
            let idx_bytes = rmp_serde::to_vec_named(&pending_index)?;
            entries.insert(HISTORY_INDEX_ENTRY.to_string(), idx_bytes);
            pending_index
        } else {
            existing_index
        }
    } else {
        if !entries.contains_key(HISTORY_INDEX_ENTRY) {
            let empty_bytes = rmp_serde::to_vec_named(&existing_index)?;
            entries.insert(HISTORY_INDEX_ENTRY.to_string(), empty_bytes);
        }
        existing_index
    };

    let msgpack_bytes = rmp_serde::to_vec_named(doc)?;
    let msgpack_len = msgpack_bytes.len();
    entries.insert(DESIGN_ENTRY.to_string(), msgpack_bytes);

    let manifest = build_manifest(
        doc,
        active_index.head_commit_id.clone(),
        active_index.commits.len(),
    );
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
    entries.insert(MANIFEST_ENTRY.to_string(), manifest_bytes);

    let zip_bytes = write_zip_entries_to_vec(&entries)?;
    let archive_size_bytes = zip_bytes.len() as u64;
    atomic_write_bytes(path, &zip_bytes)?;

    Ok(SavedMkuiReceipt {
        file_path: path.to_string_lossy().replace('\\', "/"),
        manifest,
        archive_size_bytes,
        msgpack_bytes: msgpack_len,
    })
}
