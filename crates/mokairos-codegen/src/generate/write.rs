//! 确定性写盘器（UTF-8 无 BOM + LF 换行、内容相同保留 mtime、原子替换、孤儿清理与自定义目录保护）

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::archive::pack::normalize_lf;
use crate::error::AppResult;

/// 对单个文件内容计算确定性 SHA256
pub fn compute_bundle_hash(
    doc_bytes: &[u8],
    profile_toml: &str,
    code_files: &BTreeMap<String, String>,
    lib_overrides: &BTreeMap<String, String>,
    frames_filter: &[String],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(env!("CARGO_PKG_VERSION").as_bytes());
    hasher.update(b"\0");
    hasher.update(doc_bytes);
    hasher.update(b"\0");
    hasher.update(normalize_lf(profile_toml).as_bytes());
    for (k, v) in code_files {
        hasher.update(b"\0code:");
        hasher.update(k.as_bytes());
        hasher.update(b"\0");
        hasher.update(normalize_lf(v).as_bytes());
    }
    for (k, v) in lib_overrides {
        hasher.update(b"\0lib:");
        hasher.update(k.as_bytes());
        hasher.update(b"\0");
        hasher.update(normalize_lf(v).as_bytes());
    }
    for f in frames_filter {
        hasher.update(b"\0frame:");
        hasher.update(f.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// 原子写入文本（仅当内容变化时写盘，否则保留原 mtime 以避免下游重编译）
pub fn write_if_changed(target: &Path, content: &str) -> AppResult<bool> {
    let normalized = ensure_trailing_lf(&normalize_lf(content));
    let bytes = normalized.as_bytes();
    if let Ok(existing) = fs::read(target)
        && existing == bytes
    {
        return Ok(false);
    }
    atomic_write_file(target, bytes)?;
    Ok(true)
}

/// 始终更新 stamp 文件（写入输入哈希并刷新 mtime，使 Ninja/Make 二次构建保持 no-op）
pub fn write_stamp_file(target: &Path, stamp_content: &str) -> AppResult<()> {
    let normalized = ensure_trailing_lf(&normalize_lf(stamp_content));
    atomic_write_file(target, normalized.as_bytes())
}

fn ensure_trailing_lf(s: &str) -> String {
    if s.ends_with('\n') {
        s.to_string()
    } else {
        format!("{s}\n")
    }
}

fn atomic_write_file(target: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = target.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent)?;
    }
    let file_name = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("generated.txt");
    let tmp = target.with_file_name(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4().simple()));
    {
        let mut f = File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if target.exists() {
        let bak =
            target.with_file_name(format!(".{file_name}.{}.bak", uuid::Uuid::new_v4().simple()));
        fs::rename(target, &bak)?;
        match fs::rename(&tmp, target) {
            Ok(()) => {
                let _ = fs::remove_file(&bak);
            }
            Err(err) => {
                let _ = fs::rename(&bak, target);
                let _ = fs::remove_file(&tmp);
                return Err(err.into());
            }
        }
    } else if let Err(err) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(err.into());
    }
    Ok(())
}

/// 将生成文件集合写入目标目录，并清理清单外孤儿文件（保留可选 stamp）
pub fn sync_output_dir(
    out_dir: &Path,
    files: &BTreeMap<String, String>,
    stamp_file: Option<(&Path, &str)>,
) -> AppResult<Vec<PathBuf>> {
    fs::create_dir_all(out_dir)?;
    let mut written = Vec::new();
    let mut keep_rel: BTreeSet<String> = files.keys().cloned().collect();

    if let Some((sp, _)) = stamp_file {
        if let Ok(rel) = sp.strip_prefix(out_dir) {
            keep_rel.insert(rel.to_string_lossy().replace('\\', "/"));
        }
    }

    for (rel, content) in files {
        let dest = out_dir.join(rel);
        if write_if_changed(&dest, content)? {
            written.push(dest);
        }
    }

    cleanup_orphans(out_dir, out_dir, &keep_rel)?;

    if let Some((sp, stamp_content)) = stamp_file {
        write_stamp_file(sp, stamp_content)?;
    }

    Ok(written)
}

fn cleanup_orphans(root: &Path, dir: &Path, keep_rel: &BTreeSet<String>) -> AppResult<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            cleanup_orphans(root, &path, keep_rel)?;
            if fs::read_dir(&path)?.next().is_none() {
                let _ = fs::remove_dir(&path);
            }
        } else {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            if !keep_rel.contains(&rel) {
                fs::remove_file(&path)?;
            }
        }
    }
    Ok(())
}
