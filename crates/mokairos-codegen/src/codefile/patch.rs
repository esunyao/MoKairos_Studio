//! 字节区间精准补丁工具（支持节点画布 ↔ code/*.c 双向同步）

use serde::{Deserialize, Serialize};

use crate::profile::FlowValueType;

use super::{ParsedCodeFile, parse_c_file};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeNodeParamSpec {
    pub name: String,
    #[serde(rename = "type")]
    pub value_type: FlowValueType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeNodeUpsertSpec {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_name: Option<String>,
    pub return_type: FlowValueType,
    pub params: Vec<CodeNodeParamSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doc_comment: Option<String>,
    /// 仅花括号内部的函数体语句（不含外层 `{}`）
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeNodeUpsertResult {
    pub content: String,
    pub parsed: ParsedCodeFile,
}

/// 生成标准 C 函数文本
pub fn format_c_function(prefix: &str, spec: &CodeNodeUpsertSpec) -> String {
    let mut out = String::new();
    if let Some(doc) = spec.doc_comment.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        for line in doc.lines() {
            out.push_str("// ");
            out.push_str(line.trim());
            out.push('\n');
        }
    }

    let ret_c = spec.return_type.c_type(prefix);
    let params_c = if spec.params.is_empty() {
        "void".to_string()
    } else {
        spec.params
            .iter()
            .map(|p| format!("{} {}", p.value_type.c_type(prefix), p.name))
            .collect::<Vec<_>>()
            .join(", ")
    };

    out.push_str(&format!("{ret_c} {}({params_c}) {{\n", spec.name));
    let body = spec.body.replace("\r\n", "\n");
    if body.trim().is_empty() {
        let default_ret = match spec.return_type {
            FlowValueType::Int32 => "0",
            FlowValueType::Float => "0.0f",
            FlowValueType::Bool => "0",
            FlowValueType::Color => &format!("{}_COLOR_WHITE", prefix.to_ascii_uppercase()),
            FlowValueType::Text => "\"\"",
        };
        out.push_str(&format!("    return {default_ret};\n"));
    } else {
        for line in body.trim_matches('\n').lines() {
            if line.trim().is_empty() {
                out.push('\n');
            } else if line.starts_with("    ") || line.starts_with('\t') {
                out.push_str(line);
                out.push('\n');
            } else {
                out.push_str("    ");
                out.push_str(line);
                out.push('\n');
            }
        }
    }
    out.push('}');
    out
}

/// 根据函数名替换已有函数块或追加新函数块，保持文件其余部分字节不变
pub fn upsert_function_block(
    path: &str,
    source: &str,
    prefix: &str,
    spec: &CodeNodeUpsertSpec,
) -> CodeNodeUpsertResult {
    let parsed_before = parse_c_file(path, source, prefix);
    let lookup_name = spec.original_name.as_deref().unwrap_or(&spec.name);
    let formatted = format_c_function(prefix, spec);

    let updated = if let Some(existing) = parsed_before
        .functions
        .iter()
        .find(|f| f.name == lookup_name || f.name == spec.name)
    {
        let mut s = String::with_capacity(source.len() + formatted.len());
        s.push_str(&source[..existing.start_byte]);
        s.push_str(&formatted);
        s.push_str(&source[existing.end_byte..]);
        s
    } else {
        let mut s = source.replace("\r\n", "\n");
        if !s.is_empty() && !s.ends_with('\n') {
            s.push('\n');
        }
        if !s.is_empty() && !s.ends_with("\n\n") {
            s.push('\n');
        }
        s.push_str(&formatted);
        s.push('\n');
        s
    };

    let parsed = parse_c_file(path, &updated, prefix);
    CodeNodeUpsertResult {
        content: updated,
        parsed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_preserves_surrounding_code() {
        let orig = "/* keep header */\nstatic int helper(int v) { return v; }\n\nint32_t calc_rpm(int32_t raw) {\n    return raw;\n}\n\n/* keep footer */\n";
        let res = upsert_function_block(
            "nodes.c",
            orig,
            "mk_hud",
            &CodeNodeUpsertSpec {
                name: "calc_rpm".into(),
                original_name: None,
                return_type: FlowValueType::Int32,
                params: vec![CodeNodeParamSpec {
                    name: "raw".into(),
                    value_type: FlowValueType::Int32,
                }],
                doc_comment: Some("计算转速".into()),
                body: "return raw * 2;".into(),
            },
        );
        assert!(res.content.contains("/* keep header */"));
        assert!(res.content.contains("/* keep footer */"));
        assert!(res.content.contains("return raw * 2;"));
        assert_eq!(res.parsed.functions.len(), 2);
    }
}
