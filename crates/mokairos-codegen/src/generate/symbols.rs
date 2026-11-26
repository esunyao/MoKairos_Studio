//! 确定性 ASCII 符号合法化与唯一性分配

use std::collections::HashSet;

use sha2::{Digest, Sha256};

/// 将任意 UTF-8 显示名/ID 转换为合法的 UPPER_SNAKE_CASE 唯一后缀
pub fn allocate_unique_enum_suffix(
    raw_name: &str,
    stable_id: &str,
    used: &mut HashSet<String>,
) -> String {
    let mut base = String::new();
    let mut prev_underscore = false;
    for ch in raw_name.chars() {
        if ch.is_ascii_alphanumeric() {
            base.push(ch.to_ascii_uppercase());
            prev_underscore = false;
        } else if !prev_underscore && !base.is_empty() {
            base.push('_');
            prev_underscore = true;
        }
    }
    let trimmed = base.trim_matches('_');
    let mut candidate = if trimmed.is_empty() {
        let hash = short_hash(stable_id);
        format!("ITEM_{hash}")
    } else if trimmed.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        format!("N_{trimmed}")
    } else {
        trimmed.to_string()
    };

    if used.contains(&candidate) {
        let hash = short_hash(stable_id);
        candidate = format!("{candidate}_{hash}");
    }
    let mut seq = 2usize;
    let base_cand = candidate.clone();
    while used.contains(&candidate) {
        candidate = format!("{base_cand}_{seq}");
        seq += 1;
    }
    used.insert(candidate.clone());
    candidate
}

fn short_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    hex::encode(&digest[..3]).to_ascii_uppercase()
}
