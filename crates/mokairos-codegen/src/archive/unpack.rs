//! .mkui 安全解包与快速清单读取器
//! 包含路径穿越校验（防 Zip Slip）、codegen/* 单条目 1 MB 与全包单条目 50 MB 限制

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use zip::ZipArchive;

use crate::archive::{
    CODEGEN_CODE_PREFIX, CODEGEN_LIB_PREFIX, CODEGEN_PREFIX, CODEGEN_PROFILE_ENTRY,
    DESIGN_ENTRY, HISTORY_INDEX_ENTRY, MANIFEST_ENTRY, MAX_CODEGEN_ENTRY_BYTES,
};
use crate::error::{AppError, AppResult};
use crate::model::{
    CodegenBundle, MkuiDocument, MkuiManifest, OpenedMkuiProject, VersionIndex,
};

const MAX_ENTRY_BYTES: u64 = 50 * 1024 * 1024;

/// 严格校验归档内条目路径安全性，杜绝 .. / 盘符 / 绝对路径
pub fn validate_archive_entry_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name.starts_with('/') || name.starts_with('\\') {
        return Err(AppError::SecurityViolation(format!(
            "非法归档条目路径: {name}"
        )));
    }
    if name.contains(':') || name.contains('\\') {
        return Err(AppError::SecurityViolation(format!(
            "归档条目包含非法分隔符或盘符: {name}"
        )));
    }
    for seg in name.split('/') {
        if seg == ".." || seg == "." || seg.is_empty() {
            return Err(AppError::SecurityViolation(format!(
                "归档条目包含路径穿越段: {name}"
            )));
        }
    }
    Ok(())
}

/// 从打开的 ZipArchive 中安全读取指定条目字节
pub fn read_entry_bytes(archive: &mut ZipArchive<File>, entry_name: &str) -> AppResult<Vec<u8>> {
    read_optional_entry_bytes(archive, entry_name)?.ok_or_else(|| {
        AppError::InvalidArchive(format!("缺少必要归档条目: {entry_name}"))
    })
}

/// 从打开的 ZipArchive 中安全读取可选条目字节（缺失时返回 Ok(None)）
pub fn read_optional_entry_bytes(
    archive: &mut ZipArchive<File>,
    entry_name: &str,
) -> AppResult<Option<Vec<u8>>> {
    validate_archive_entry_name(entry_name)?;
    let entry = match archive.by_name(entry_name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(other) => return Err(AppError::Zip(other)),
    };

    let limit = if entry_name.starts_with(CODEGEN_PREFIX) {
        MAX_CODEGEN_ENTRY_BYTES as u64
    } else {
        MAX_ENTRY_BYTES
    };

    if entry.size() > limit {
        return Err(AppError::SecurityViolation(format!(
            "归档条目 {entry_name} 体积超出限制 ({} bytes)",
            entry.size()
        )));
    }

    let mut limited = entry.take(limit + 1);
    let mut buf = Vec::new();
    limited.read_to_end(&mut buf)?;
    if buf.len() as u64 > limit {
        return Err(AppError::SecurityViolation(format!(
            "归档条目 {entry_name} 解压实际体积超出安全上限"
        )));
    }
    Ok(Some(buf))
}

/// 读取归档中全部 `codegen/*` 条目并组装为 CodegenBundle
pub fn read_codegen_bundle(archive: &mut ZipArchive<File>) -> AppResult<Option<CodegenBundle>> {
    let mut names = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if name.starts_with(CODEGEN_PREFIX) {
            validate_archive_entry_name(&name)?;
            names.push(name);
        }
    }

    if names.is_empty() {
        return Ok(None);
    }

    let mut profile_toml = String::new();
    let mut code_files = BTreeMap::new();
    let mut lib_overrides = BTreeMap::new();

    for name in names {
        let Some(bytes) = read_optional_entry_bytes(archive, &name)? else {
            continue;
        };
        let text = String::from_utf8(bytes).map_err(|e| {
            AppError::InvalidArchive(format!("codegen 条目 {name} 不是有效 UTF-8: {e}"))
        })?;
        if name == CODEGEN_PROFILE_ENTRY {
            profile_toml = text;
        } else if let Some(rel) = name.strip_prefix(CODEGEN_CODE_PREFIX) {
            code_files.insert(rel.to_string(), text);
        } else if let Some(rel) = name.strip_prefix(CODEGEN_LIB_PREFIX) {
            lib_overrides.insert(rel.to_string(), text);
        }
    }

    Ok(Some(CodegenBundle {
        profile_toml,
        code_files,
        lib_overrides,
    }))
}

/// 仅读取 .mkui 内明文 manifest.json（用于工程大厅快速列表预览）
pub fn read_mkui_manifest(path: &Path) -> AppResult<MkuiManifest> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    let bytes = read_entry_bytes(&mut archive, MANIFEST_ENTRY)?;
    let manifest: MkuiManifest = serde_json::from_slice(&bytes)?;
    if manifest.format != "mkui" {
        return Err(AppError::InvalidArchive(format!(
            "不支持的归档格式标识: {}",
            manifest.format
        )));
    }
    Ok(manifest)
}

/// 完整打开 .mkui 工程（校验清单、解码 design.msgpack、history/index.msgpack 与可选 codegen/*）
pub fn open_mkui_archive(path: &Path) -> AppResult<OpenedMkuiProject> {
    let meta = fs::metadata(path)?;
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;

    // 全包条目路径预检
    for i in 0..archive.len() {
        let entry = archive.by_index(i)?;
        if !entry.is_dir() {
            validate_archive_entry_name(entry.name())?;
        }
    }

    let manifest_bytes = read_entry_bytes(&mut archive, MANIFEST_ENTRY)?;
    let manifest: MkuiManifest = serde_json::from_slice(&manifest_bytes)?;
    if manifest.format != "mkui" {
        return Err(AppError::InvalidArchive(format!(
            "不支持的归档格式: {}",
            manifest.format
        )));
    }

    let design_bytes = read_entry_bytes(&mut archive, DESIGN_ENTRY)?;
    let document: MkuiDocument = rmp_serde::from_slice(&design_bytes)?;

    let history: VersionIndex = match read_optional_entry_bytes(&mut archive, HISTORY_INDEX_ENTRY)? {
        Some(idx_bytes) => rmp_serde::from_slice(&idx_bytes)?,
        None => VersionIndex::default(),
    };

    let codegen = read_codegen_bundle(&mut archive)?;

    Ok(OpenedMkuiProject {
        file_path: path.to_string_lossy().replace('\\', "/"),
        manifest,
        document,
        history,
        archive_size_bytes: meta.len(),
        codegen,
    })
}
