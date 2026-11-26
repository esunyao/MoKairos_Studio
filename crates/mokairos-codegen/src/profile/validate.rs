//! `codegen/profile.toml` 规则、命名、Namespace 与编译陷阱校验器

use std::collections::HashSet;

use crate::error::Diagnostic;
use crate::model::{MkuiDocument, MkuiGraphic};

use super::{
    CodegenMode, CodegenProfile, ModeOrRef, SymbolLang, SymbolRef, TransportKind,
};

const RESERVED_PREFIXES: &[&str] = &["ui", "crc", "protocol", "frame", "referee"];
const AMBIGUOUS_INCLUDES: &[&str] = &["protocol.h", "crc.h"];

/// 校验 ASCII C 标识符 `^[a-zA-Z_][a-zA-Z0-9_]*$`
pub fn is_valid_c_ident(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// 校验 C/C++ 限定名（可带前导 `::`）
pub fn is_valid_cpp_qualified(s: &str) -> bool {
    let body = s.strip_prefix("::").unwrap_or(s);
    if body.is_empty() {
        return false;
    }
    body.split("::").all(is_valid_c_ident)
}

/// 校验 prefix 合法性
pub fn is_valid_prefix(prefix: &str) -> bool {
    if prefix.is_empty() || prefix.len() > 24 {
        return false;
    }
    let mut chars = prefix.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }
    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return false;
    }
    if prefix.starts_with("ui_") || RESERVED_PREFIXES.contains(&prefix) {
        return false;
    }
    true
}

/// 解析 `<figureName|varKey>.<field>` 目标字符串
pub fn resolve_graphic_target<'a>(
    doc: &'a MkuiDocument,
    target: &'a str,
) -> Option<(&'a MkuiGraphic, &'a str)> {
    let (key, field) = target.rsplit_once('.')?;
    if key.is_empty() || field.is_empty() {
        return None;
    }
    for frame in &doc.frames {
        for g in &frame.graphics {
            if g.var_key() == Some(key) || g.figure_name() == key {
                return Some((g, field));
            }
        }
    }
    None
}

pub fn validate_field_for_graphic(graphic: &MkuiGraphic, field: &str) -> bool {
    match field {
        "color" | "visible" => true,
        "value" => matches!(graphic, MkuiGraphic::Float { .. } | MkuiGraphic::Int { .. }),
        "percent" => matches!(graphic, MkuiGraphic::Line { .. } | MkuiGraphic::Rect { .. }),
        "text" => matches!(graphic, MkuiGraphic::Text { .. }),
        "x" | "y" => true,
        "end_x" | "end_y" => matches!(
            graphic,
            MkuiGraphic::Line { .. }
                | MkuiGraphic::Rect { .. }
                | MkuiGraphic::Ellipse { .. }
                | MkuiGraphic::Arc { .. }
        ),
        "radius" => matches!(graphic, MkuiGraphic::Circle { .. }),
        "start_angle" | "end_angle" => matches!(graphic, MkuiGraphic::Arc { .. }),
        "width" => true,
        _ => false,
    }
}

fn check_placeholders(
    expr: &str,
    required: &[&str],
    allowed: &[&str],
    loc: &str,
    diags: &mut Vec<Diagnostic>,
) {
    if expr.contains(';') {
        diags.push(Diagnostic::error(
            "PROFILE_EXPR_SEMICOLON",
            loc,
            "表达式中禁止包含分号 `;`",
        ));
        return;
    }

    let mut found = Vec::new();
    let bytes = expr.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            let Some(rel_end) = expr[i + 1..].find('}') else {
                diags.push(Diagnostic::error(
                    "PROFILE_EXPR_BRACE",
                    loc,
                    "表达式存在未闭合的 `{`",
                ));
                return;
            };
            let ph = &expr[i + 1..i + 1 + rel_end];
            if !allowed.contains(&ph) {
                diags.push(Diagnostic::error(
                    "PROFILE_EXPR_UNKNOWN_PLACEHOLDER",
                    loc,
                    format!("表达式包含未允许的占位符 `{{{ph}}}`"),
                ));
            }
            found.push(ph.to_string());
            i += rel_end + 2;
        } else if bytes[i] == b'}' {
            diags.push(Diagnostic::error(
                "PROFILE_EXPR_BRACE",
                loc,
                "表达式存在多余的 `}`",
            ));
            return;
        } else {
            i += 1;
        }
    }

    for &req in required {
        if !found.iter().any(|f| f == req) {
            diags.push(Diagnostic::error(
                "PROFILE_EXPR_MISSING_PLACEHOLDER",
                loc,
                format!("表达式缺少必需占位符 `{{{req}}}`"),
            ));
        }
    }
}

fn validate_symbol_ref(
    sym_ref: &SymbolRef,
    loc: &str,
    required_section: bool,
    required_placeholders: &[&str],
    allowed_placeholders: &[&str],
    diags: &mut Vec<Diagnostic>,
) {
    let has_sym = sym_ref
        .symbol
        .as_deref()
        .is_some_and(|s| !s.trim().is_empty());
    let has_expr = sym_ref
        .expr
        .as_deref()
        .is_some_and(|s| !s.trim().is_empty());

    if has_sym && has_expr {
        diags.push(Diagnostic::error(
            "PROFILE_SYMBOL_CONFLICT",
            loc,
            "symbol 与 expr 只能二选一填写",
        ));
        return;
    }

    if !has_sym && !has_expr {
        if required_section && !sym_ref.optional {
            diags.push(Diagnostic::error(
                "PROFILE_SYMBOL_REQUIRED",
                loc,
                "此项为必填符号引用，请填写 symbol 或 expr",
            ));
        }
        return;
    }

    if let Some(inc) = sym_ref.include.as_deref() {
        let trimmed = inc.trim();
        if !trimmed.is_empty() && AMBIGUOUS_INCLUDES.contains(&trimmed) {
            diags.push(Diagnostic::warn(
                "WARN_AMBIGUOUS_INCLUDE",
                loc,
                format!(
                    "头文件名 `{trimmed}` 容易与其他模块重名，建议填写唯一相对路径（如 `seasons/2027/protocol.h`）"
                ),
            ));
        }
    }

    if let Some(sym) = sym_ref.symbol.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if sym.contains("using namespace") {
            diags.push(Diagnostic::error(
                "PROFILE_FORBID_USING_NAMESPACE",
                loc,
                "禁止使用 `using namespace`",
            ));
        }
        match sym_ref.lang {
            SymbolLang::C => {
                if sym.contains("::") {
                    diags.push(Diagnostic::error(
                        "PROFILE_C_NAMESPACE",
                        loc,
                        "lang = \"c\" 时不允许出现 C++ 作用域运算符 `::`",
                    ));
                } else if !is_valid_c_ident(sym) {
                    diags.push(Diagnostic::error(
                        "PROFILE_INVALID_SYMBOL",
                        loc,
                        format!("非法 C 标识符: `{sym}`"),
                    ));
                }
            }
            SymbolLang::Cpp => {
                if !is_valid_cpp_qualified(sym) {
                    diags.push(Diagnostic::error(
                        "PROFILE_INVALID_SYMBOL",
                        loc,
                        format!("非法 C++ 限定符名: `{sym}`"),
                    ));
                } else if sym.contains("::") && !sym.starts_with("::") {
                    diags.push(Diagnostic::warn(
                        "WARN_CPP_UNQUALIFIED",
                        loc,
                        format!("C++ 限定名 `{sym}` 建议以全局 `::{sym}` 开头，避免命名空间遮蔽"),
                    ));
                }
            }
        }
    }

    if let Some(expr) = sym_ref.expr.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if expr.contains("using namespace") {
            diags.push(Diagnostic::error(
                "PROFILE_FORBID_USING_NAMESPACE",
                loc,
                "表达式禁止包含 `using namespace`",
            ));
        }
        if sym_ref.lang == SymbolLang::C && expr.contains("::") {
            diags.push(Diagnostic::error(
                "PROFILE_C_NAMESPACE",
                loc,
                "lang = \"c\" 时表达式不允许出现 `::`",
            ));
        }
        check_placeholders(expr, required_placeholders, allowed_placeholders, loc, diags);
    }
}

/// 解析 profile.toml 文本为 CodegenProfile（供前端打开 .mkui 时 100% 无损回显）
pub fn parse_profile_toml(profile_toml: &str) -> crate::error::AppResult<CodegenProfile> {
    Ok(toml::from_str(profile_toml)?)
}

/// 解析 profile.toml 文本并联合文档与代码文件执行全量校验
pub fn validate_profile_toml_and_code(
    profile_toml: &str,
    doc: &MkuiDocument,
    code_files: &std::collections::BTreeMap<String, String>,
) -> Vec<Diagnostic> {
    let profile: CodegenProfile = match toml::from_str(profile_toml) {
        Ok(p) => p,
        Err(err) => {
            return vec![Diagnostic::error(
                "PROFILE_TOML_SYNTAX",
                "codegen/profile.toml",
                format!("TOML 解析失败: {err}"),
            )];
        }
    };
    let mut diags = validate_profile(&profile, doc);
    for (path, content) in code_files {
        let parsed = crate::codefile::parse_c_file(
            path,
            &crate::archive::pack::normalize_lf(content),
            &profile.prefix,
        );
        diags.extend(parsed.diagnostics);
    }
    diags
}

/// 校验完整 `CodegenProfile` 与设计文档之间的兼容性与陷阱
pub fn validate_profile(profile: &CodegenProfile, doc: &MkuiDocument) -> Vec<Diagnostic> {
    let mut diags = Vec::new();

    if profile.schema > 1 {
        diags.push(Diagnostic::error(
            "PROFILE_UNSUPPORTED_SCHEMA",
            "codegen/profile.toml:schema",
            format!(
                "配置版本 schema = {} 高于当前工具支持上限 (1)，请升级 mokairos-ui",
                profile.schema
            ),
        ));
    }

    if !is_valid_prefix(&profile.prefix) {
        diags.push(Diagnostic::error(
            "PROFILE_INVALID_PREFIX",
            "codegen/profile.toml:prefix",
            format!(
                "前缀 `{}` 非法：须匹配 ^[a-z][a-z0-9_]{{0,23}}$，且不得以 ui_ 开头或为保留词",
                profile.prefix
            ),
        ));
    }

    // 画面筛选检查
    if !profile.frames.is_empty() {
        let valid_ids: HashSet<&str> = doc.frames.iter().map(|f| f.id.as_str()).collect();
        let valid_names: HashSet<&str> = doc.frames.iter().map(|f| f.name.as_str()).collect();
        for f in &profile.frames {
            if !valid_ids.contains(f.as_str()) && !valid_names.contains(f.as_str()) {
                diags.push(Diagnostic::error(
                    "PROFILE_UNKNOWN_FRAME",
                    "codegen/profile.toml:frames",
                    format!("配置引用的画面 `{f}` 在当前设计中不存在"),
                ));
            }
        }
    }

    if profile.runtime.min_interval_ms < 34 {
        diags.push(Diagnostic::warn(
            "WARN_RATE_LIMIT",
            "codegen/profile.toml:runtime.min_interval_ms",
            format!(
                "最小发包间隔 {} ms 高于裁判系统 30 Hz 安全推荐上限（建议 >= 34 ms）",
                profile.runtime.min_interval_ms
            ),
        ));
    }

    // 非 ASCII 文本提示
    if profile.text_encoding == super::ProfileTextEncoding::Utf8 {
        for frame in &doc.frames {
            for g in &frame.graphics {
                if let MkuiGraphic::Text { id, text, display_name, .. } = g
                    && !text.is_ascii()
                {
                    let mut d = Diagnostic::warn(
                        "WARN_UTF8_NON_ASCII",
                        format!("frame[{}]/graphic[{}]", frame.name, g.figure_name()),
                        format!(
                            "文本图元「{display_name}」含非 ASCII 字符，当前以 UTF-8 编码，上车前请核对选手端字符集"
                        ),
                    );
                    d.frame_id = Some(frame.id.clone());
                    d.graphic_id = Some(id.clone());
                    diags.push(d);
                }
            }
        }
    }

    // Mapping 模式下检查 transport 与 runtime
    if profile.mode == CodegenMode::Mapping {
        match profile.transport.kind {
            TransportKind::Payload => {
                if let Some(send) = &profile.transport.send {
                    validate_symbol_ref(
                        send,
                        "codegen/profile.toml:transport.send",
                        true,
                        &["cmd_id", "data", "len"],
                        &["cmd_id", "data", "len"],
                        &mut diags,
                    );
                } else {
                    diags.push(Diagnostic::error(
                        "PROFILE_MISSING_SEND",
                        "codegen/profile.toml:transport.send",
                        "mapping + payload 模式必须配置 transport.send",
                    ));
                }
                if let Some(ok_expr) = &profile.transport.send_ok {
                    check_placeholders(
                        ok_expr,
                        &["ret"],
                        &["ret", "len"],
                        "codegen/profile.toml:transport.send_ok",
                        &mut diags,
                    );
                }
            }
            TransportKind::Frame => {
                if profile.transport.max_frame < 120 {
                    diags.push(Diagnostic::error(
                        "PROFILE_MAX_FRAME_TOO_SMALL",
                        "codegen/profile.toml:transport.max_frame",
                        "frame 模式 max_frame 至少需 120 字节以容纳 7 图帧",
                    ));
                }
                if let Some(write) = &profile.transport.write {
                    validate_symbol_ref(
                        write,
                        "codegen/profile.toml:transport.write",
                        true,
                        &["buf", "len"],
                        &["buf", "len"],
                        &mut diags,
                    );
                } else {
                    diags.push(Diagnostic::error(
                        "PROFILE_MISSING_WRITE",
                        "codegen/profile.toml:transport.write",
                        "mapping + frame 模式必须配置 transport.write",
                    ));
                }
                for (field, val) in [
                    ("crc8", &profile.transport.crc8),
                    ("crc16", &profile.transport.crc16),
                ] {
                    match val {
                        ModeOrRef::Mode(m) if m == "builtin" => {}
                        ModeOrRef::Mode(m) => {
                            diags.push(Diagnostic::error(
                                "PROFILE_INVALID_CRC_MODE",
                                format!("codegen/profile.toml:transport.{field}"),
                                format!("未知模式 `{m}`，应为 \"builtin\" 或 SymbolRef"),
                            ));
                        }
                        ModeOrRef::Ref(r) => validate_symbol_ref(
                            r,
                            &format!("codegen/profile.toml:transport.{field}"),
                            true,
                            &["buf", "len"],
                            &["buf", "len"],
                            &mut diags,
                        ),
                    }
                }
                match &profile.transport.seq {
                    ModeOrRef::Mode(m) if m == "own" => {
                        diags.push(Diagnostic::warn(
                            "WARN_SHARED_UART_SEQ",
                            "codegen/profile.toml:transport.seq",
                            "frame 模式使用独立 seq，请确保同一裁判串口仅有本 UI 模块或单一发送所有者",
                        ));
                    }
                    ModeOrRef::Mode(m) => {
                        diags.push(Diagnostic::error(
                            "PROFILE_INVALID_SEQ_MODE",
                            "codegen/profile.toml:transport.seq",
                            format!("未知 seq 模式 `{m}`，应为 \"own\" 或 SymbolRef"),
                        ));
                    }
                    ModeOrRef::Ref(r) => validate_symbol_ref(
                        r,
                        "codegen/profile.toml:transport.seq",
                        true,
                        &[],
                        &[],
                        &mut diags,
                    ),
                }
            }
        }

        if let Some(rid) = &profile.runtime.robot_id {
            validate_symbol_ref(
                rid,
                "codegen/profile.toml:runtime.robot_id",
                true,
                &[],
                &[],
                &mut diags,
            );
        } else {
            diags.push(Diagnostic::error(
                "PROFILE_MISSING_ROBOT_ID",
                "codegen/profile.toml:runtime.robot_id",
                "mapping 模式必须配置 runtime.robot_id",
            ));
        }

        for (name, opt_ref) in [
            ("online", &profile.runtime.online),
            ("now_ms", &profile.runtime.now_ms),
            ("port_ready", &profile.runtime.port_ready),
            ("lock", &profile.runtime.lock),
            ("unlock", &profile.runtime.unlock),
        ] {
            if let Some(r) = opt_ref {
                validate_symbol_ref(
                    r,
                    &format!("codegen/profile.toml:runtime.{name}"),
                    false,
                    &[],
                    &[],
                    &mut diags,
                );
            }
        }
    }

    // 用户符号目录检查
    let mut seen_sym_ids = HashSet::new();
    for sym in &profile.symbols {
        if !is_valid_c_ident(&sym.id) {
            diags.push(Diagnostic::error(
                "PROFILE_INVALID_SYMBOL_ID",
                format!("codegen/profile.toml:symbols[{}]", sym.id),
                format!("符号目录 ID `{}` 须为合法 C 标识符", sym.id),
            ));
        }
        if !seen_sym_ids.insert(sym.id.as_str()) {
            diags.push(Diagnostic::error(
                "PROFILE_DUPLICATE_SYMBOL_ID",
                format!("codegen/profile.toml:symbols[{}]", sym.id),
                format!("符号目录 ID `{}` 重复", sym.id),
            ));
        }
        validate_symbol_ref(
            &sym.target_ref,
            &format!("codegen/profile.toml:symbols[{}]", sym.id),
            true,
            &[],
            &[],
            &mut diags,
        );
    }

    // 绑定与 API 目标校验
    for (idx, b) in profile.bind.iter().enumerate() {
        let loc = format!("codegen/profile.toml:bind[{idx}]");
        if let Some((g, field)) = resolve_graphic_target(doc, &b.target) {
            if !validate_field_for_graphic(g, field) {
                diags.push(Diagnostic::error(
                    "PROFILE_INVALID_TARGET_FIELD",
                    &loc,
                    format!("图元 `{}` 不支持字段 `{field}`", g.figure_name()),
                ));
            }
        } else {
            diags.push(Diagnostic::error(
                "PROFILE_UNKNOWN_TARGET",
                &loc,
                format!("找不到绑定目标 `{}` 对应的图元", b.target),
            ));
        }
        validate_symbol_ref(&b.source, &loc, true, &[], &[], &mut diags);
    }

    let mut seen_api_names = HashSet::new();
    for (idx, ep) in profile.api.iter().enumerate() {
        let loc = format!("codegen/profile.toml:api[{idx}]");
        if !is_valid_c_ident(&ep.name) {
            diags.push(Diagnostic::error(
                "PROFILE_INVALID_API_NAME",
                &loc,
                format!("API 函数名 `{}` 非法", ep.name),
            ));
        } else if !seen_api_names.insert(ep.name.as_str()) {
            diags.push(Diagnostic::error(
                "PROFILE_DUPLICATE_API_NAME",
                &loc,
                format!("API 函数名 `{}` 重复", ep.name),
            ));
        }
        if let Some((g, field)) = resolve_graphic_target(doc, &ep.target) {
            if !validate_field_for_graphic(g, field) {
                diags.push(Diagnostic::error(
                    "PROFILE_INVALID_TARGET_FIELD",
                    &loc,
                    format!("图元 `{}` 不支持字段 `{field}`", g.figure_name()),
                ));
            }
        } else {
            diags.push(Diagnostic::error(
                "PROFILE_UNKNOWN_TARGET",
                &loc,
                format!("找不到 API 目标 `{}` 对应的图元", ep.target),
            ));
        }
    }

    diags
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{MkuiFrame, MkuiGroup};

    fn empty_doc() -> MkuiDocument {
        MkuiDocument {
            schema_version: 1,
            project_id: "p1".into(),
            name: "test".into(),
            description: "".into(),
            robot_role: "infantry_3".into(),
            active_frame_id: "f1".into(),
            frames: vec![MkuiFrame {
                id: "f1".into(),
                name: "Main".into(),
                groups: vec![MkuiGroup {
                    id: "g1".into(),
                    name: "Core".into(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![],
            }],
            created_at: "".into(),
            updated_at: "".into(),
        }
    }

    #[test]
    fn builtin_presets_pass_validation() {
        let doc = empty_doc();
        for preset in super::super::builtin_presets() {
            let diags = validate_profile(&preset.profile, &doc);
            let errors: Vec<_> = diags.iter().filter(|d| d.is_error()).collect();
            assert!(
                errors.is_empty(),
                "preset {} should have no errors, got: {:?}",
                preset.id,
                errors
            );
        }
    }

    #[test]
    fn rejects_reserved_prefix_and_missing_placeholder() {
        let doc = empty_doc();
        let mut p = super::super::get_preset("uicrm-new").unwrap().profile;
        p.prefix = "ui_test".into();
        p.transport.send.as_mut().unwrap().expr = Some("::g_referee->Transmit({cmd_id})".into());
        let diags = validate_profile(&p, &doc);
        assert!(diags.iter().any(|d| d.code == "PROFILE_INVALID_PREFIX"));
        assert!(diags
            .iter()
            .any(|d| d.code == "PROFILE_EXPR_MISSING_PLACEHOLDER"));
    }
}
