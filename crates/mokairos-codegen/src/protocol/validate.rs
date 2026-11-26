//! Rust 侧权威 2027 协议预检（在导出或写入前执行）

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::model::{MkuiDocument, MkuiGraphic};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RustPreflightIssue {
    pub id: String,
    pub severity: String,
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub frame_id: Option<String>,
    pub graphic_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RustPreflightReport {
    pub passed: bool,
    pub error_count: usize,
    pub warning_count: usize,
    pub issues: Vec<RustPreflightIssue>,
}

pub fn preflight_document(doc: &MkuiDocument) -> RustPreflightReport {
    let mut issues = Vec::new();
    let mut seq = 1usize;

    for frame in &doc.frames {
        let mut seen_names: HashMap<&str, &str> = HashMap::new();
        let group_ids: HashSet<&str> = frame.groups.iter().map(|g| g.id.as_str()).collect();

        if frame.name.trim().is_empty() {
            issues.push(RustPreflightIssue {
                id: format!("rc_{seq}"),
                severity: "error".to_string(),
                code: "FRAME_NAME_EMPTY".to_string(),
                message: "画面名称不能为空".to_string(),
                detail: None,
                frame_id: Some(frame.id.clone()),
                graphic_id: None,
            });
            seq += 1;
        }

        for g in &frame.graphics {
            let fname = g.figure_name();
            let dname = g.display_name();

            if fname.is_empty() || fname.len() > 3 || fname.contains('\0') {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "error".to_string(),
                    code: "INVALID_FIGURE_NAME".to_string(),
                    message: format!("图元「{dname}」的协议短名 \"{fname}\" 非法"),
                    detail: Some(format!(
                        "figure_name 必须为 1~3 字节（当前 {} B）",
                        fname.len()
                    )),
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            } else if let Some(prev) = seen_names.insert(fname, dname) {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "error".to_string(),
                    code: "DUPLICATE_FIGURE_NAME".to_string(),
                    message: format!("协议短名 \"{fname}\" 在画面「{}」内重复", frame.name),
                    detail: Some(format!("与「{prev}」冲突")),
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            }

            if g.layer() > 9 {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "error".to_string(),
                    code: "LAYER_OUT_OF_RANGE".to_string(),
                    message: format!("图元「{dname}」图层 {} 越界 (0..9)", g.layer()),
                    detail: None,
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            }

            if g.color() > 8 {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "error".to_string(),
                    code: "COLOR_OUT_OF_RANGE".to_string(),
                    message: format!("图元「{dname}」颜色编号 {} 超出协议 9 色枚举", g.color()),
                    detail: None,
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            }

            if g.line_width() == 0 || g.line_width() > 1023 {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "error".to_string(),
                    code: "LINE_WIDTH_OUT_OF_RANGE".to_string(),
                    message: format!("图元「{dname}」线宽 {} 超出 1..1023 范围", g.line_width()),
                    detail: None,
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            }

            if !group_ids.contains(g.group_id()) {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "warn".to_string(),
                    code: "ORPHAN_GROUP".to_string(),
                    message: format!("图元「{dname}」引用了不存在的分组"),
                    detail: None,
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            }

            if let MkuiGraphic::Text { text, .. } = g
                && text.len() > 30
            {
                issues.push(RustPreflightIssue {
                    id: format!("rc_{seq}"),
                    severity: "error".to_string(),
                    code: "TEXT_UTF8_OVERFLOW".to_string(),
                    message: format!(
                        "文本图元「{dname}」UTF-8 字节数超限 ({} / 30 B)",
                        text.len()
                    ),
                    detail: Some("裁判系统字符帧 data[30] 上限为 30 字节".to_string()),
                    frame_id: Some(frame.id.clone()),
                    graphic_id: Some(g.id().to_string()),
                });
                seq += 1;
            }
        }
    }

    let error_count = issues.iter().filter(|i| i.severity == "error").count();
    let warning_count = issues.iter().filter(|i| i.severity == "warn").count();

    RustPreflightReport {
        passed: error_count == 0,
        error_count,
        warning_count,
        issues,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{MkuiFrame, MkuiGroup};

    #[test]
    fn catches_utf8_text_overflow_in_rust() {
        let doc = MkuiDocument {
            schema_version: 1,
            project_id: "p1".to_string(),
            name: "test".to_string(),
            description: "".to_string(),
            robot_role: "infantry_3".to_string(),
            active_frame_id: "f1".to_string(),
            frames: vec![MkuiFrame {
                id: "f1".to_string(),
                name: "Main".to_string(),
                groups: vec![MkuiGroup {
                    id: "g1".to_string(),
                    name: "G".to_string(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![MkuiGraphic::Text {
                    id: "t1".to_string(),
                    figure_name: "t01".to_string(),
                    display_name: "超长汉字".to_string(),
                    var_key: None,
                    group_id: "g1".to_string(),
                    layer: 0,
                    color: 1,
                    line_width: 2,
                    dynamic: true,
                    visible: true,
                    locked: false,
                    x: 100,
                    y: 500,
                    font_size: 20,
                    text: "十一个中文字肯定超过三十字节".to_string(),
                }],
            }],
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };

        let report = preflight_document(&doc);
        assert!(!report.passed);
        assert_eq!(report.error_count, 1);
        assert_eq!(report.issues[0].code, "TEXT_UTF8_OVERFLOW");
    }
}
