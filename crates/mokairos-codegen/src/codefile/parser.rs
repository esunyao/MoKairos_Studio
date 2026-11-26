//! 纯 Rust 无损顶层 C 文件分块解析器
//! 铁律：所有块切片 `[start_byte..end_byte]` 按顺序拼接后必须与原文逐字节一致。

use serde::{Deserialize, Serialize};

use crate::error::Diagnostic;
use crate::profile::{FlowValueType, is_valid_c_ident};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodeParam {
    pub name: String,
    pub c_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port_type: Option<FlowValueType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodeFunctionInfo {
    pub name: String,
    pub return_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port_return: Option<FlowValueType>,
    pub params: Vec<CodeParam>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doc_comment: Option<String>,
    pub wireable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unsupported_reason: Option<String>,
    pub start_byte: usize,
    pub end_byte: usize,
    pub body_start_byte: usize,
    pub body_end_byte: usize,
    pub start_line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CodeBlock {
    #[serde(rename_all = "camelCase")]
    Function {
        start_byte: usize,
        end_byte: usize,
        function: CodeFunctionInfo,
    },
    #[serde(rename_all = "camelCase")]
    Declaration {
        start_byte: usize,
        end_byte: usize,
        preview: String,
    },
    #[serde(rename_all = "camelCase")]
    Verbatim {
        start_byte: usize,
        end_byte: usize,
    },
}

impl CodeBlock {
    pub fn start_byte(&self) -> usize {
        match self {
            Self::Function { start_byte, .. }
            | Self::Declaration { start_byte, .. }
            | Self::Verbatim { start_byte, .. } => *start_byte,
        }
    }

    pub fn end_byte(&self) -> usize {
        match self {
            Self::Function { end_byte, .. }
            | Self::Declaration { end_byte, .. }
            | Self::Verbatim { end_byte, .. } => *end_byte,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedCodeFile {
    pub path: String,
    pub blocks: Vec<CodeBlock>,
    pub functions: Vec<CodeFunctionInfo>,
    pub diagnostics: Vec<Diagnostic>,
}

/// 把 C 类型字符串映射到节点图端口类型（不支持连线时返回 None）
pub fn map_c_type_to_port(raw: &str, prefix: &str) -> Option<FlowValueType> {
    let norm = normalize_c_type(raw);
    let color_t = format!("{prefix}_color_t");
    if norm == "int32_t" {
        Some(FlowValueType::Int32)
    } else if norm == "float" {
        Some(FlowValueType::Float)
    } else if norm == "int" || norm == "bool" || norm == "_Bool" {
        Some(FlowValueType::Bool)
    } else if norm == color_t {
        Some(FlowValueType::Color)
    } else if norm == "const char *" || norm == "const char*" {
        Some(FlowValueType::Text)
    } else {
        None
    }
}

fn normalize_c_type(raw: &str) -> String {
    let mut out = String::new();
    let mut prev_space = false;
    for ch in raw.trim().chars() {
        if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(ch);
            prev_space = false;
        }
    }
    out.replace(" *", "*").trim().to_string()
}

fn byte_to_line(src: &str, byte_idx: usize) -> usize {
    src[..byte_idx.min(src.len())]
        .bytes()
        .filter(|&b| b == b'\n')
        .count()
        + 1
}

/// 解析单个 C/H 文件为无损有序块列表与函数目录
pub fn parse_c_file(path: &str, source: &str, prefix: &str) -> ParsedCodeFile {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut blocks: Vec<CodeBlock> = Vec::new();
    let mut functions: Vec<CodeFunctionInfo> = Vec::new();
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    let mut cursor = 0usize;
    if source.starts_with('\u{FEFF}') {
        // 保留 UTF-8 BOM 为前导 Verbatim
        cursor = 3;
        blocks.push(CodeBlock::Verbatim {
            start_byte: 0,
            end_byte: 3,
        });
    }

    let mut pp_depth = 0usize;

    while cursor < len {
        // 跳过纯空白区间 -> Verbatim
        let ws_start = cursor;
        while cursor < len && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor > ws_start {
            push_verbatim(&mut blocks, ws_start, cursor);
            continue;
        }

        // 行注释
        if starts_with_bytes(bytes, cursor, b"//") {
            let end = scan_line_comment(bytes, cursor);
            push_verbatim(&mut blocks, cursor, end);
            cursor = end;
            continue;
        }

        // 块注释
        if starts_with_bytes(bytes, cursor, b"/*") {
            match scan_block_comment(bytes, cursor) {
                Some(end) => {
                    push_verbatim(&mut blocks, cursor, end);
                    cursor = end;
                }
                None => {
                    push_verbatim(&mut blocks, cursor, len);
                    let mut d = Diagnostic::warn(
                        "CODEFILE_UNCLOSED_COMMENT",
                        format!("{path}:{}", byte_to_line(source, cursor)),
                        "块注释 `/*` 未闭合，已作为 Verbatim 保留",
                    );
                    d.file = Some(path.to_string());
                    d.line = Some(byte_to_line(source, cursor));
                    diagnostics.push(d);
                    break;
                }
            }
            continue;
        }

        // 预处理指令
        if bytes[cursor] == b'#' {
            let (end, delta_pp) = scan_preprocessor_line(bytes, cursor);
            pp_depth = (pp_depth as isize + delta_pp).max(0) as usize;
            push_verbatim(&mut blocks, cursor, end);
            cursor = end;
            continue;
        }

        // 如果在 #if/#ifdef 条件编译块内部，整行保留为 Verbatim
        if pp_depth > 0 {
            let end = scan_until_newline(bytes, cursor);
            push_verbatim(&mut blocks, cursor, end);
            cursor = end;
            continue;
        }

        // 扫描顶层语句/声明/函数定义
        let item_start = cursor;
        let mut brace_depth = 0usize;
        let mut paren_depth = 0usize;
        let mut first_brace_at: Option<usize> = None;
        let mut found_end: Option<(usize, bool)> = None; // (end_byte, is_brace_terminated)
        let mut scan_err: Option<&str> = None;

        while cursor < len {
            let b = bytes[cursor];
            if starts_with_bytes(bytes, cursor, b"//") {
                cursor = scan_line_comment(bytes, cursor);
                continue;
            }
            if starts_with_bytes(bytes, cursor, b"/*") {
                if let Some(end) = scan_block_comment(bytes, cursor) {
                    cursor = end;
                    continue;
                } else {
                    scan_err = Some("未闭合的块注释");
                    cursor = len;
                    break;
                }
            }
            if b == b'"' {
                if let Some(end) = scan_quoted(bytes, cursor, b'"') {
                    cursor = end;
                    continue;
                } else {
                    scan_err = Some("未闭合的字符串字面量");
                    cursor = len;
                    break;
                }
            }
            if b == b'\'' {
                if let Some(end) = scan_quoted(bytes, cursor, b'\'') {
                    cursor = end;
                    continue;
                } else {
                    scan_err = Some("未闭合的字符字面量");
                    cursor = len;
                    break;
                }
            }
            if b == b'(' {
                paren_depth += 1;
            } else if b == b')' {
                paren_depth = paren_depth.saturating_sub(1);
            } else if b == b'{' {
                if brace_depth == 0 && first_brace_at.is_none() {
                    first_brace_at = Some(cursor);
                }
                brace_depth += 1;
            } else if b == b'}' {
                if brace_depth == 0 {
                    scan_err = Some("多余的右大括号 `}`");
                    cursor += 1;
                    break;
                }
                brace_depth -= 1;
                if brace_depth == 0 {
                    // 检查是否为函数体结尾：若前面头不含 `=` 且不以 typedef/struct/enum/union 开头
                    if let Some(brace_idx) = first_brace_at {
                        let header = &source[item_start..brace_idx];
                        if is_function_header(header) {
                            found_end = Some((cursor + 1, true));
                            cursor += 1;
                            break;
                        }
                    }
                }
            } else if b == b';' && brace_depth == 0 && paren_depth == 0 {
                found_end = Some((cursor + 1, false));
                cursor += 1;
                break;
            }
            cursor += 1;
        }

        if let Some(err_msg) = scan_err {
            push_verbatim(&mut blocks, item_start, cursor);
            let mut d = Diagnostic::warn(
                "CODEFILE_SYNTAX_FALLBACK",
                format!("{path}:{}", byte_to_line(source, item_start)),
                format!("{err_msg}，已退化为 Verbatim 块保留原文"),
            );
            d.file = Some(path.to_string());
            d.line = Some(byte_to_line(source, item_start));
            diagnostics.push(d);
            continue;
        }

        let Some((end_byte, is_func_brace)) = found_end else {
            // 到 EOF 仍未结束（如未写完的语句）
            push_verbatim(&mut blocks, item_start, len);
            let mut d = Diagnostic::warn(
                "CODEFILE_INCOMPLETE_ITEM",
                format!("{path}:{}", byte_to_line(source, item_start)),
                "文件末尾存在未完整结束的代码片段，已作为 Verbatim 保留",
            );
            d.file = Some(path.to_string());
            d.line = Some(byte_to_line(source, item_start));
            diagnostics.push(d);
            break;
        };

        if is_func_brace {
            let brace_idx = first_brace_at.unwrap();
            let header = &source[item_start..brace_idx];
            if let Some(mut func) =
                parse_function_signature(source, item_start, brace_idx, end_byte, header, prefix)
            {
                // 尝试合并紧邻的前导注释（从末尾的 Verbatim 块中回溯）
                let doc = attach_leading_doc_comment(&mut blocks, source, &mut func);
                func.doc_comment = doc;
                functions.push(func.clone());
                blocks.push(CodeBlock::Function {
                    start_byte: func.start_byte,
                    end_byte: func.end_byte,
                    function: func,
                });
                continue;
            }
        }

        let preview = source[item_start..end_byte]
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .chars()
            .take(80)
            .collect();
        blocks.push(CodeBlock::Declaration {
            start_byte: item_start,
            end_byte,
            preview,
        });
    }

    ParsedCodeFile {
        path: path.to_string(),
        blocks,
        functions,
        diagnostics,
    }
}

fn push_verbatim(blocks: &mut Vec<CodeBlock>, start: usize, end: usize) {
    if start >= end {
        return;
    }
    if let Some(CodeBlock::Verbatim { end_byte, .. }) = blocks.last_mut()
        && *end_byte == start
    {
        *end_byte = end;
        return;
    }
    blocks.push(CodeBlock::Verbatim {
        start_byte: start,
        end_byte: end,
    });
}

fn starts_with_bytes(bytes: &[u8], idx: usize, pat: &[u8]) -> bool {
    idx + pat.len() <= bytes.len() && &bytes[idx..idx + pat.len()] == pat
}

fn scan_line_comment(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && bytes[i] != b'\n' {
        i += 1;
    }
    i
}

fn scan_until_newline(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            return i + 1;
        }
        i += 1;
    }
    i
}

fn scan_block_comment(bytes: &[u8], mut i: usize) -> Option<usize> {
    i += 2;
    while i + 1 < bytes.len() {
        if bytes[i] == b'*' && bytes[i + 1] == b'/' {
            return Some(i + 2);
        }
        i += 1;
    }
    None
}

fn scan_quoted(bytes: &[u8], mut i: usize, quote: u8) -> Option<usize> {
    i += 1;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i = (i + 2).min(bytes.len());
            continue;
        }
        if bytes[i] == quote {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

fn scan_preprocessor_line(bytes: &[u8], start: usize) -> (usize, isize) {
    let mut i = start;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            // 检查是否以 `\`（或 `\r\`）续行
            let prev = if i > start && bytes[i - 1] == b'\r' {
                i.saturating_sub(2)
            } else {
                i.saturating_sub(1)
            };
            if i > start && bytes[prev] == b'\\' {
                i += 1;
                continue;
            }
            i += 1;
            break;
        }
        i += 1;
    }
    let line_str = String::from_utf8_lossy(&bytes[start..i]);
    let trimmed = line_str.trim_start_matches('#').trim_start();
    let delta = if trimmed.starts_with("if") {
        1
    } else if trimmed.starts_with("endif") {
        -1
    } else {
        0
    };
    (i, delta)
}

fn strip_comments_preserving_ws(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if starts_with_bytes(bytes, i, b"//") {
            i = scan_line_comment(bytes, i);
            out.push(' ');
        } else if starts_with_bytes(bytes, i, b"/*") {
            i = scan_block_comment(bytes, i).unwrap_or(bytes.len());
            out.push(' ');
        } else {
            let ch = s[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

fn is_function_header(raw_header: &str) -> bool {
    let cleaned = strip_comments_preserving_ws(raw_header);
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed.contains('=') {
        return false;
    }
    if trimmed.starts_with("typedef")
        && trimmed
            .as_bytes()
            .get(7)
            .is_some_and(|b| b.is_ascii_whitespace())
    {
        return false;
    }
    trimmed.contains('(') && trimmed.ends_with(')')
}

fn parse_function_signature(
    source: &str,
    start_byte: usize,
    brace_idx: usize,
    end_byte: usize,
    raw_header: &str,
    prefix: &str,
) -> Option<CodeFunctionInfo> {
    let cleaned = strip_comments_preserving_ws(raw_header);
    let trimmed = cleaned.trim();
    let open_paren = trimmed.find('(')?;
    let close_paren = trimmed.rfind(')')?;
    if close_paren <= open_paren {
        return None;
    }

    let before_paren = trimmed[..open_paren].trim();
    let params_str = trimmed[open_paren + 1..close_paren].trim();

    // 提取函数名（最后一个标识符）与返回类型
    let name_start = before_paren
        .rfind(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .map(|idx| idx + 1)
        .unwrap_or(0);
    let name = before_paren[name_start..].trim().to_string();
    if !is_valid_c_ident(&name) {
        return None;
    }
    let return_type = normalize_c_type(&before_paren[..name_start]);
    if return_type.is_empty() {
        return None;
    }

    let port_return = map_c_type_to_port(&return_type, prefix);
    let mut params = Vec::new();
    let mut unsupported_reason: Option<String> = None;

    if port_return.is_none() {
        unsupported_reason = Some(format!("不支持的返回类型 `{return_type}`"));
    }

    if !params_str.is_empty() && params_str != "void" {
        for raw_param in params_str.split(',') {
            let p = raw_param.trim();
            if p.is_empty() || p == "..." {
                unsupported_reason = Some("包含变长参数或空参数".to_string());
                continue;
            }
            let p_name_start = p
                .rfind(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                .map(|idx| idx + 1)
                .unwrap_or(0);
            let p_name = p[p_name_start..].trim().to_string();
            let p_type = normalize_c_type(&p[..p_name_start]);
            if p_type.is_empty() || !is_valid_c_ident(&p_name) {
                unsupported_reason = Some(format!("无法识别的参数签名 `{p}`"));
                params.push(CodeParam {
                    name: p.to_string(),
                    c_type: p.to_string(),
                    port_type: None,
                });
                continue;
            }
            let port_type = map_c_type_to_port(&p_type, prefix);
            if port_type.is_none() && unsupported_reason.is_none() {
                unsupported_reason = Some(format!("参数 `{p_name}` 类型 `{p_type}` 不支持连线"));
            }
            params.push(CodeParam {
                name: p_name,
                c_type: p_type,
                port_type,
            });
        }
    }

    let wireable = unsupported_reason.is_none();
    let start_line = byte_to_line(source, start_byte);

    Some(CodeFunctionInfo {
        name,
        return_type,
        port_return,
        params,
        doc_comment: None,
        wireable,
        unsupported_reason,
        start_byte,
        end_byte,
        body_start_byte: brace_idx,
        body_end_byte: end_byte,
        start_line,
    })
}

/// 若函数块前紧贴着注释行，将其并入该函数块并提取 doc_comment，保持块区间连续无重叠
fn attach_leading_doc_comment(
    blocks: &mut Vec<CodeBlock>,
    source: &str,
    func: &mut CodeFunctionInfo,
) -> Option<String> {
    let Some(CodeBlock::Verbatim { start_byte, end_byte }) = blocks.last_mut() else {
        return None;
    };
    if *end_byte != func.start_byte {
        return None;
    }

    let slice = &source[*start_byte..*end_byte];
    // 仅吸纳紧贴着函数起始行的连续注释行（允许行尾换行+缩进空白，不允许跨空行）
    let mut scan_pos = slice.len();
    // 回退函数同一行的前导空格/制表符
    while scan_pos > 0 && matches!(slice.as_bytes()[scan_pos - 1], b' ' | b'\t') {
        scan_pos -= 1;
    }

    let mut doc_start_rel: Option<usize> = None;
    loop {
        if scan_pos == 0 {
            break;
        }
        // 回退一个换行
        let mut line_end = scan_pos;
        if line_end > 0 && slice.as_bytes()[line_end - 1] == b'\n' {
            line_end -= 1;
            if line_end > 0 && slice.as_bytes()[line_end - 1] == b'\r' {
                line_end -= 1;
            }
        } else {
            break;
        }
        let line_start = slice[..line_end]
            .rfind('\n')
            .map(|i| i + 1)
            .unwrap_or(0);
        let line = slice[line_start..line_end].trim();
        if line.starts_with("//") {
            doc_start_rel = Some(line_start);
            scan_pos = line_start;
            continue;
        }
        if line.ends_with("*/") {
            if let Some(open_idx) = slice[..line_end].rfind("/*") {
                let block_line_start = slice[..open_idx]
                    .rfind('\n')
                    .map(|i| i + 1)
                    .unwrap_or(0);
                if slice[block_line_start..open_idx].trim().is_empty() {
                    doc_start_rel = Some(block_line_start);
                    scan_pos = block_line_start;
                    continue;
                }
            }
        }
        break;
    }

    let rel = doc_start_rel?;
    let abs_doc_start = *start_byte + rel;
    let comment_text = source[abs_doc_start..func.start_byte]
        .lines()
        .map(|l| {
            l.trim()
                .trim_start_matches("///")
                .trim_start_matches("//")
                .trim_start_matches("/*")
                .trim_end_matches("*/")
                .trim()
        })
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    if abs_doc_start == *start_byte {
        blocks.pop();
    } else {
        *end_byte = abs_doc_start;
    }
    func.start_byte = abs_doc_start;
    func.start_line = byte_to_line(source, abs_doc_start);

    if comment_text.is_empty() {
        None
    } else {
        Some(comment_text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_roundtrip(src: &str) {
        let parsed = parse_c_file("nodes.c", src, "mk_hud");
        let reconstructed: String = parsed
            .blocks
            .iter()
            .map(|b| &src[b.start_byte()..b.end_byte()])
            .collect();
        assert_eq!(reconstructed, src, "roundtrip mismatch");
    }

    #[test]
    fn roundtrip_lossless_across_edge_cases() {
        let samples = [
            "",
            "\u{FEFF}// UTF-8 BOM + 中文注释\r\nint32_t foo(float x) {\r\n\treturn (int32_t)(x * 100.0f);\r\n}\r\n",
            "#include <stdint.h>\n#define MK_X 1\n#if 0\nvoid hidden_fn(void) {}\n#endif\n\n/* 块注释 { } */\nstatic const char* msg = \"hello { world /*\";\n\n// 文档注释\nmk_hud_color_t pick_color(float pct, int armed) {\n    if (armed && pct > 0.5f) {\n        return MK_HUD_COLOR_GREEN;\n    }\n    return MK_HUD_COLOR_PINK;\n}\n",
            "void broken_fn(int a {\n    /* unclosed",
            "typedef struct { int a; } my_t;\nfloat valid_fn(int32_t v) { return (float)v; }\n",
        ];

        for s in samples {
            assert_roundtrip(s);
        }

        let parsed = parse_c_file("nodes.c", samples[2], "mk_hud");
        assert_eq!(parsed.functions.len(), 1);
        let fn_info = &parsed.functions[0];
        assert_eq!(fn_info.name, "pick_color");
        assert!(fn_info.wireable);
        assert_eq!(fn_info.port_return, Some(FlowValueType::Color));
        assert_eq!(fn_info.params.len(), 2);
        assert_eq!(fn_info.params[0].port_type, Some(FlowValueType::Float));
        assert_eq!(fn_info.params[1].port_type, Some(FlowValueType::Bool));
        assert_eq!(fn_info.doc_comment.as_deref(), Some("文档注释"));
    }

    #[test]
    fn non_wireable_function_is_preserved_and_flagged() {
        let src = "struct S { int x; };\nstruct S make_s(int a) { struct S s = {a}; return s; }\n";
        assert_roundtrip(src);
        let parsed = parse_c_file("nodes.c", src, "mk_hud");
        assert_eq!(parsed.functions.len(), 1);
        assert!(!parsed.functions[0].wireable);
        assert!(parsed.functions[0].unsupported_reason.is_some());
    }
}
