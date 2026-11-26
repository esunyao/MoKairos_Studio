//! MiniJinja 代码渲染与多级基底模板覆写引擎

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use minijinja::{Environment, context};
use serde::Serialize;

use crate::archive::pack::normalize_lf;
use crate::codefile::{CodeFunctionInfo, parse_c_file};
use crate::error::{AppError, AppResult, Diagnostic};
use crate::flow::{compile_flows, emit_setter_call};
use crate::model::{CodegenBundle, MkuiDocument, MkuiFrame, MkuiGraphic};
use crate::protocol::encode::{
    TextEncoding, encode_figure_with_encoding, encode_text_bytes,
};
use crate::protocol::validate::preflight_document;
use crate::profile::{
    CodegenMode, CodegenProfile, FlowValueType, ModeOrRef, ProfileTextEncoding, SymbolLang,
    SymbolRef, TransportKind, resolve_graphic_target, validate_profile,
};

use super::symbols::allocate_unique_enum_suffix;
use super::write::{compute_bundle_hash, sync_output_dir, write_if_changed};

pub const TEMPLATE_NAMES: &[&str] = &[
    "public_header.h.j2",
    "cpp_wrapper.hpp.j2",
    "layout.h.j2",
    "layout.c.j2",
    "runtime.c.j2",
    "gen.c.j2",
    "bind.cpp.j2",
    "custom_scaffold.c.j2",
];

/// 返回全部官方内置基底 lib 模板（UTF-8 + LF）
pub fn builtin_base_templates() -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    map.insert(
        "public_header.h.j2".into(),
        normalize_lf(include_str!("../../templates/official/public_header.h.j2")),
    );
    map.insert(
        "cpp_wrapper.hpp.j2".into(),
        normalize_lf(include_str!("../../templates/official/cpp_wrapper.hpp.j2")),
    );
    map.insert(
        "layout.h.j2".into(),
        normalize_lf(include_str!("../../templates/official/layout.h.j2")),
    );
    map.insert(
        "layout.c.j2".into(),
        normalize_lf(include_str!("../../templates/official/layout.c.j2")),
    );
    map.insert(
        "runtime.c.j2".into(),
        normalize_lf(include_str!("../../templates/official/runtime.c.j2")),
    );
    map.insert(
        "gen.c.j2".into(),
        normalize_lf(include_str!("../../templates/official/gen.c.j2")),
    );
    map.insert(
        "bind.cpp.j2".into(),
        normalize_lf(include_str!("../../templates/official/bind.cpp.j2")),
    );
    map.insert(
        "custom_scaffold.c.j2".into(),
        normalize_lf(include_str!("../../templates/official/custom_scaffold.c.j2")),
    );
    map
}

/// 合并三层基底模板：CMake/CLI `base_lib_dir` > `.mkui codegen/lib/` > 官方内置
pub fn load_effective_templates(
    bundle_overrides: &BTreeMap<String, String>,
    base_lib_dir: Option<&Path>,
) -> AppResult<BTreeMap<String, String>> {
    let mut effective = builtin_base_templates();
    for (name, content) in bundle_overrides {
        effective.insert(name.clone(), normalize_lf(content));
    }
    if let Some(dir) = base_lib_dir {
        if !dir.exists() {
            return Err(AppError::NotFound(format!(
                "指定的基底 lib 目录不存在: {}",
                dir.display()
            )));
        }
        for name in TEMPLATE_NAMES {
            let p = dir.join(name);
            if p.exists() {
                let raw = fs::read_to_string(&p)?;
                effective.insert((*name).to_string(), normalize_lf(&raw));
            }
        }
    }
    Ok(effective)
}

#[derive(Debug, Clone, Default)]
pub struct GenerateOptions {
    pub mkui_name: String,
    pub profile_override: Option<String>,
    pub base_lib_dir: Option<PathBuf>,
    pub frames_override: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProject {
    pub prefix: String,
    pub files: BTreeMap<String, String>,
    pub output_list: Vec<String>,
    pub stamp_rel_path: String,
    pub input_hash: String,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
struct FrameRenderItem {
    enum_name: String,
    pack_offset: usize,
    pack_count: usize,
    graphic_offset: usize,
    graphic_count: usize,
    layer_mask: u16,
}

#[derive(Debug, Clone, Serialize)]
struct GraphicRenderItem {
    enum_name: String,
    figure_name: String,
    kind: String,
    kind_code: u8,
    group_index: u8,
    dynamic_int: u8,
    base_bytes_hex: String,
    bar_sx: i32,
    bar_sy: i32,
    bar_ex: i32,
    bar_ey: i32,
    text_slot: i32,
}

#[derive(Debug, Clone, Serialize)]
struct TextRenderItem {
    bytes_hex: String,
    byte_len: usize,
}

#[derive(Debug, Clone, Serialize)]
struct PackRenderItem {
    sub_cmd_hex: String,
    is_text_int: u8,
    count: usize,
    graphics_list: String,
}

#[derive(Debug, Clone, Serialize)]
struct CppShimItem {
    signature: String,
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct CodeFileItem {
    path: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct SimpleBindItem {
    period_ms: u32,
    setter_call: String,
}

#[derive(Debug, Clone, Serialize)]
struct ApiEndpointItem {
    name: String,
    group: String,
    c_param_sig: String,
    body_call: String,
}

#[derive(Debug, Clone, Serialize)]
struct ApiFlowFnItem {
    name: String,
    group: String,
    public: bool,
    c_param_sig: String,
    body_lines: Vec<String>,
}

fn graphic_kind_meta(g: &MkuiGraphic) -> (&'static str, u8, i32, i32, i32, i32) {
    match g {
        MkuiGraphic::Line {
            start_x,
            start_y,
            end_x,
            end_y,
            ..
        } => ("line", 0, *start_x, *start_y, *end_x, *end_y),
        MkuiGraphic::Rect {
            start_x,
            start_y,
            end_x,
            end_y,
            ..
        } => ("rect", 1, *start_x, *start_y, *end_x, *end_y),
        MkuiGraphic::Circle { .. } => ("circle", 2, 0, 0, 0, 0),
        MkuiGraphic::Ellipse { .. } => ("ellipse", 3, 0, 0, 0, 0),
        MkuiGraphic::Arc { .. } => ("arc", 4, 0, 0, 0, 0),
        MkuiGraphic::Float { .. } => ("float", 5, 0, 0, 0, 0),
        MkuiGraphic::Int { .. } => ("int", 6, 0, 0, 0, 0),
        MkuiGraphic::Text { .. } => ("text", 7, 0, 0, 0, 0),
    }
}

fn format_c_hex_bytes(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("0x{b:02X}u"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn format_symbol_expr(sym_ref: &SymbolRef, placeholders: &[(&str, &str)]) -> String {
    if let Some(expr) = sym_ref.expr.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let mut s = expr.to_string();
        for &(k, v) in placeholders {
            s = s.replace(&format!("{{{k}}}"), v);
        }
        s
    } else if let Some(sym) = sym_ref.symbol.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if placeholders.is_empty() {
            sym.to_string()
        } else {
            let args = placeholders.iter().map(|(_, v)| *v).collect::<Vec<_>>().join(", ");
            format!("{sym}({args})")
        }
    } else {
        "0".to_string()
    }
}

fn register_symbol_include(
    sym_ref: &SymbolRef,
    c_includes: &mut BTreeSet<String>,
    c_decls: &mut Vec<String>,
    cpp_includes: &mut BTreeSet<String>,
    cpp_decls: &mut Vec<String>,
) {
    let inc = sym_ref.include.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let decl = sym_ref.decl.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match sym_ref.lang {
        SymbolLang::C => {
            if let Some(i) = inc {
                c_includes.insert(i.to_string());
            }
            if let Some(d) = decl
                && !c_decls.contains(&d.to_string())
            {
                c_decls.push(d.to_string());
            }
        }
        SymbolLang::Cpp => {
            if let Some(i) = inc {
                cpp_includes.insert(i.to_string());
            }
            if let Some(d) = decl
                && !cpp_decls.contains(&d.to_string())
            {
                cpp_decls.push(d.to_string());
            }
        }
    }
}

fn select_frames<'a>(
    doc: &'a MkuiDocument,
    profile: &CodegenProfile,
    frames_override: Option<&[String]>,
) -> Vec<&'a MkuiFrame> {
    let filter: &[String] = frames_override.unwrap_or(&profile.frames);
    if filter.is_empty() {
        return doc.frames.iter().collect();
    }
    doc.frames
        .iter()
        .filter(|f| filter.iter().any(|k| k == &f.id || k == &f.name))
        .collect()
}

/// 渲染完整 C/C++ 项目文件（Studio 预览、CLI 生成与直接导出共用此入口）
pub fn render_project(
    doc: &MkuiDocument,
    bundle: &CodegenBundle,
    options: &GenerateOptions,
) -> AppResult<GeneratedProject> {
    let profile_text = options
        .profile_override
        .as_deref()
        .unwrap_or(&bundle.profile_toml);
    let effective_profile_str = if profile_text.trim().is_empty() {
        crate::profile::default_profile_toml()
    } else {
        profile_text.to_string()
    };

    let profile: CodegenProfile = toml::from_str(&effective_profile_str)?;
    let prefix = profile.prefix.clone();
    let prefix_upper = prefix.to_ascii_uppercase();

    // 1. 收集协议预检 + 配置校验诊断
    let mut diagnostics: Vec<Diagnostic> = Vec::new();
    let preflight = preflight_document(doc);
    for issue in preflight.issues {
        let mut d = if issue.severity == "error" {
            Diagnostic::error(issue.code, "", issue.message)
        } else {
            Diagnostic::warn(issue.code, "", issue.message)
        };
        d.detail = issue.detail;
        d.frame_id = issue.frame_id.clone();
        d.graphic_id = issue.graphic_id.clone();
        if let Some(fid) = &issue.frame_id {
            d.location = format!("frame[{fid}]");
        }
        diagnostics.push(d);
    }
    diagnostics.extend(validate_profile(&profile, doc));

    // 2. 解析 codegen/code/* 用户代码文件并抽取可连线函数
    let mut code_headers = Vec::new();
    let mut code_sources = Vec::new();
    let mut all_code_functions: Vec<CodeFunctionInfo> = Vec::new();

    for (rel_path, content) in &bundle.code_files {
        let norm_content = normalize_lf(content);
        let parsed = parse_c_file(rel_path, &norm_content, &prefix);
        diagnostics.extend(parsed.diagnostics);
        all_code_functions.extend(parsed.functions);
        if rel_path.ends_with(".h") || rel_path.ends_with(".hpp") {
            code_headers.push(CodeFileItem {
                path: rel_path.clone(),
                content: norm_content,
            });
        } else {
            code_sources.push(CodeFileItem {
                path: rel_path.clone(),
                content: norm_content,
            });
        }
    }

    // 3. 构建画面、图元与按组分包表
    let selected_frames = select_frames(doc, &profile, options.frames_override.as_deref());
    let text_encoding = match profile.text_encoding {
        ProfileTextEncoding::Utf8 => TextEncoding::Utf8,
        ProfileTextEncoding::Utf16le => TextEncoding::Utf16Le,
    };

    let mut used_frame_enums = HashSet::new();
    let mut used_graphic_enums = HashSet::new();
    let mut frame_items = Vec::new();
    let mut graphic_items = Vec::new();
    let mut text_items = Vec::new();
    let mut pack_items = Vec::new();

    // graphic.id -> (index, enum_name)
    let mut graphic_index_map: HashMap<String, usize> = HashMap::new();
    let mut graphic_enum_map: HashMap<String, String> = HashMap::new();

    for frame in &selected_frames {
        let f_suffix = allocate_unique_enum_suffix(&frame.name, &frame.id, &mut used_frame_enums);
        let f_enum = format!("{prefix_upper}_FRAME_{f_suffix}");

        let graphic_offset = graphic_items.len();
        let pack_offset = pack_items.len();
        let mut layer_mask: u16 = 0;

        // 按组顺序分配本画面内的图元与组下标
        let mut group_order: Vec<String> = frame.groups.iter().map(|g| g.id.clone()).collect();
        let mut group_idx_map: HashMap<String, usize> = group_order
            .iter()
            .enumerate()
            .map(|(i, id)| (id.clone(), i))
            .collect();

        for g in &frame.graphics {
            if !group_idx_map.contains_key(g.group_id()) {
                let idx = group_order.len();
                group_order.push(g.group_id().to_string());
                group_idx_map.insert(g.group_id().to_string(), idx);
            }
        }

        for g in &frame.graphics {
            let g_idx = graphic_items.len();
            let g_suffix = allocate_unique_enum_suffix(
                g.var_key().unwrap_or_else(|| g.figure_name()),
                g.id(),
                &mut used_graphic_enums,
            );
            let g_enum = format!("{prefix_upper}_G_{g_suffix}");

            graphic_index_map.insert(g.id().to_string(), g_idx);
            graphic_enum_map.insert(g.id().to_string(), g_enum.clone());

            let layer = g.layer();
            if layer < 10 {
                layer_mask |= 1u16 << layer;
            }

            let (kind, kind_code, bar_sx, bar_sy, bar_ex, bar_ey) = graphic_kind_meta(g);
            let base_bytes = encode_figure_with_encoding(g, 0, text_encoding);

            let text_slot = if let MkuiGraphic::Text { text, .. } = g {
                let slot_idx = text_items.len();
                let (encoded, byte_len) = encode_text_bytes(text, text_encoding);
                text_items.push(TextRenderItem {
                    bytes_hex: format_c_hex_bytes(&encoded),
                    byte_len,
                });
                slot_idx as i32
            } else {
                -1
            };

            let grp_idx = (*group_idx_map.get(g.group_id()).unwrap_or(&0)).min(255) as u8;
            graphic_items.push(GraphicRenderItem {
                enum_name: g_enum,
                figure_name: g.figure_name().to_string(),
                kind: kind.to_string(),
                kind_code,
                group_index: grp_idx,
                dynamic_int: if g.dynamic() { 1 } else { 0 },
                base_bytes_hex: format_c_hex_bytes(&base_bytes),
                bar_sx,
                bar_sy,
                bar_ex,
                bar_ey,
                text_slot,
            });
        }

        // 按组打包成初始化/删除包索引
        // 先定位本画面内按组排列的图元索引
        let mut by_group: BTreeMap<usize, Vec<&MkuiGraphic>> = BTreeMap::new();
        for g in &frame.graphics {
            let gi = *group_idx_map.get(g.group_id()).unwrap_or(&0);
            by_group.entry(gi).or_default().push(g);
        }
        // 与 pack_frame_by_group 一致，记录每个包引用的全局 graphic index
        for (_gi, items) in by_group {
            for txt in items.iter().copied().filter(|x| x.is_text()) {
                let idx = graphic_index_map[txt.id()];
                pack_items.push(PackRenderItem {
                    sub_cmd_hex: "0110".to_string(),
                    is_text_int: 1,
                    count: 1,
                    graphics_list: format!("{idx}u, 0u, 0u, 0u, 0u, 0u, 0u"),
                });
            }
            let shapes: Vec<&MkuiGraphic> = items.into_iter().filter(|x| !x.is_text()).collect();
            for chunk in shapes.chunks(7) {
                let (sub_cmd, _) = crate::protocol::encode::choose_shape_sub_cmd(chunk.len());
                let mut arr = [0usize; 7];
                for (slot, sg) in chunk.iter().enumerate() {
                    arr[slot] = graphic_index_map[sg.id()];
                }
                let list_str = arr
                    .iter()
                    .map(|x| format!("{x}u"))
                    .collect::<Vec<_>>()
                    .join(", ");
                pack_items.push(PackRenderItem {
                    sub_cmd_hex: format!("{sub_cmd:04X}"),
                    is_text_int: 0,
                    count: chunk.len(),
                    graphics_list: list_str,
                });
            }
        }

        frame_items.push(FrameRenderItem {
            enum_name: f_enum,
            pack_offset,
            pack_count: pack_items.len() - pack_offset,
            graphic_offset,
            graphic_count: graphic_items.len() - graphic_offset,
            layer_mask,
        });
    }

    let start_frame_index = profile
        .start_frame
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(|key| {
            selected_frames
                .iter()
                .position(|f| f.id == key || f.name == key)
        })
        .or_else(|| {
            selected_frames
                .iter()
                .position(|f| f.id == doc.active_frame_id)
        })
        .unwrap_or(0);

    // 4. 收集 C / C++ 符号垫片与 include
    let mut c_includes = BTreeSet::new();
    let mut c_decls = Vec::new();
    let mut cpp_includes = BTreeSet::new();
    let mut cpp_decls = Vec::new();
    let mut cpp_shims = Vec::new();
    let mut cpp_extern_decls = Vec::new();
    let mut symbol_getter_map: HashMap<String, (FlowValueType, String)> = HashMap::new();

    // 用户符号目录
    for sym in &profile.symbols {
        register_symbol_include(
            &sym.target_ref,
            &mut c_includes,
            &mut c_decls,
            &mut cpp_includes,
            &mut cpp_decls,
        );
        let getter = match sym.target_ref.lang {
            SymbolLang::C => format!("({})", format_symbol_expr(&sym.target_ref, &[])),
            SymbolLang::Cpp => {
                let c_fn = format!("{prefix}__sym_{}", sym.id);
                let ret_t = sym.value_type.c_type(&prefix);
                let sig = format!("{ret_t} {c_fn}(void)");
                cpp_extern_decls.push(format!("{sig};"));
                let expr = format_symbol_expr(&sym.target_ref, &[]);
                cpp_shims.push(CppShimItem {
                    signature: sig,
                    body: format!("return static_cast<{ret_t}>({expr});"),
                });
                format!("{c_fn}()")
            }
        };
        symbol_getter_map.insert(sym.id.clone(), (sym.value_type, getter));
    }

    let mut robot_id_c_expr = "0u".to_string();
    let mut online_c_expr = "1".to_string();
    let mut has_online = false;
    let mut now_ms_c_expr = "0u".to_string();
    let mut has_now_ms = false;
    let mut port_ready_c_expr = "1".to_string();
    let mut has_port_ready = false;
    let mut lock_stmt = String::new();
    let mut has_lock = false;
    let mut unlock_stmt = String::new();
    let mut has_unlock = false;
    let mut send_c_call = "0".to_string();
    let mut send_ok_c_expr = "ret == len".to_string();
    let mut write_c_call = "0".to_string();
    let mut has_custom_crc8 = false;
    let mut crc8_c_call = String::new();
    let mut has_custom_crc16 = false;
    let mut crc16_c_call = String::new();
    let mut has_custom_seq = false;
    let mut seq_c_expr = String::new();

    if profile.mode == CodegenMode::Mapping {
        if let Some(rid) = &profile.runtime.robot_id
            && !rid.is_empty()
        {
            register_symbol_include(
                rid,
                &mut c_includes,
                &mut c_decls,
                &mut cpp_includes,
                &mut cpp_decls,
            );
            robot_id_c_expr = match rid.lang {
                SymbolLang::C => format_symbol_expr(rid, &[]),
                SymbolLang::Cpp => {
                    let fn_name = format!("{prefix}__bind_robot_id");
                    let sig = format!("uint16_t {fn_name}(void)");
                    cpp_extern_decls.push(format!("{sig};"));
                    cpp_shims.push(CppShimItem {
                        signature: sig,
                        body: format!("return static_cast<uint16_t>({});", format_symbol_expr(rid, &[])),
                    });
                    format!("{fn_name}()")
                }
            };
        }

        if let Some(online) = &profile.runtime.online
            && !online.is_empty()
        {
            has_online = true;
            register_symbol_include(
                online,
                &mut c_includes,
                &mut c_decls,
                &mut cpp_includes,
                &mut cpp_decls,
            );
            online_c_expr = match online.lang {
                SymbolLang::C => format_symbol_expr(online, &[]),
                SymbolLang::Cpp => {
                    let fn_name = format!("{prefix}__bind_online");
                    let sig = format!("int {fn_name}(void)");
                    cpp_extern_decls.push(format!("{sig};"));
                    cpp_shims.push(CppShimItem {
                        signature: sig,
                        body: format!("return ({}) ? 1 : 0;", format_symbol_expr(online, &[])),
                    });
                    format!("{fn_name}()")
                }
            };
        }

        if let Some(now_ms) = &profile.runtime.now_ms
            && !now_ms.is_empty()
        {
            has_now_ms = true;
            register_symbol_include(
                now_ms,
                &mut c_includes,
                &mut c_decls,
                &mut cpp_includes,
                &mut cpp_decls,
            );
            now_ms_c_expr = match now_ms.lang {
                SymbolLang::C => format_symbol_expr(now_ms, &[]),
                SymbolLang::Cpp => {
                    let fn_name = format!("{prefix}__bind_now_ms");
                    let sig = format!("uint32_t {fn_name}(void)");
                    cpp_extern_decls.push(format!("{sig};"));
                    cpp_shims.push(CppShimItem {
                        signature: sig,
                        body: format!("return static_cast<uint32_t>({});", format_symbol_expr(now_ms, &[])),
                    });
                    format!("{fn_name}()")
                }
            };
        }

        if let Some(pr) = &profile.runtime.port_ready
            && !pr.is_empty()
        {
            has_port_ready = true;
            register_symbol_include(
                pr,
                &mut c_includes,
                &mut c_decls,
                &mut cpp_includes,
                &mut cpp_decls,
            );
            port_ready_c_expr = match pr.lang {
                SymbolLang::C => format_symbol_expr(pr, &[]),
                SymbolLang::Cpp => {
                    let fn_name = format!("{prefix}__bind_port_ready");
                    let sig = format!("int {fn_name}(void)");
                    cpp_extern_decls.push(format!("{sig};"));
                    cpp_shims.push(CppShimItem {
                        signature: sig,
                        body: format!("return ({}) ? 1 : 0;", format_symbol_expr(pr, &[])),
                    });
                    format!("{fn_name}()")
                }
            };
        }

        if let Some(lk) = &profile.runtime.lock
            && !lk.is_empty()
        {
            has_lock = true;
            register_symbol_include(
                lk,
                &mut c_includes,
                &mut c_decls,
                &mut cpp_includes,
                &mut cpp_decls,
            );
            lock_stmt = match lk.lang {
                SymbolLang::C => format!("{};", format_symbol_expr(lk, &[])),
                SymbolLang::Cpp => {
                    let fn_name = format!("{prefix}__bind_lock");
                    let sig = format!("void {fn_name}(void)");
                    cpp_extern_decls.push(format!("{sig};"));
                    cpp_shims.push(CppShimItem {
                        signature: sig,
                        body: format!("{};", format_symbol_expr(lk, &[])),
                    });
                    format!("{fn_name}();")
                }
            };
        }

        if let Some(ulk) = &profile.runtime.unlock
            && !ulk.is_empty()
        {
            has_unlock = true;
            register_symbol_include(
                ulk,
                &mut c_includes,
                &mut c_decls,
                &mut cpp_includes,
                &mut cpp_decls,
            );
            unlock_stmt = match ulk.lang {
                SymbolLang::C => format!("{};", format_symbol_expr(ulk, &[])),
                SymbolLang::Cpp => {
                    let fn_name = format!("{prefix}__bind_unlock");
                    let sig = format!("void {fn_name}(void)");
                    cpp_extern_decls.push(format!("{sig};"));
                    cpp_shims.push(CppShimItem {
                        signature: sig,
                        body: format!("{};", format_symbol_expr(ulk, &[])),
                    });
                    format!("{fn_name}();")
                }
            };
        }

        match profile.transport.kind {
            TransportKind::Payload => {
                if let Some(send) = &profile.transport.send
                    && !send.is_empty()
                {
                    register_symbol_include(
                        send,
                        &mut c_includes,
                        &mut c_decls,
                        &mut cpp_includes,
                        &mut cpp_decls,
                    );
                    send_c_call = match send.lang {
                        SymbolLang::C => format!(
                            "(size_t)({})",
                            format_symbol_expr(
                                send,
                                &[("cmd_id", "cmd_id"), ("data", "data"), ("len", "len")]
                            )
                        ),
                        SymbolLang::Cpp => {
                            let fn_name = format!("{prefix}__bind_send");
                            let sig = format!(
                                "size_t {fn_name}(uint16_t cmd_id, const uint8_t* data, size_t len)"
                            );
                            cpp_extern_decls.push(format!("{sig};"));
                            cpp_shims.push(CppShimItem {
                                signature: sig,
                                body: format!(
                                    "return static_cast<size_t>({});",
                                    format_symbol_expr(
                                        send,
                                        &[("cmd_id", "cmd_id"), ("data", "data"), ("len", "len")]
                                    )
                                ),
                            });
                            format!("{fn_name}(cmd_id, data, len)")
                        }
                    };
                }
                if let Some(ok) = &profile.transport.send_ok
                    && !ok.trim().is_empty()
                {
                    send_ok_c_expr = ok
                        .replace("{ret}", "ret")
                        .replace("{len}", "len");
                }
            }
            TransportKind::Frame => {
                if let Some(write) = &profile.transport.write
                    && !write.is_empty()
                {
                    register_symbol_include(
                        write,
                        &mut c_includes,
                        &mut c_decls,
                        &mut cpp_includes,
                        &mut cpp_decls,
                    );
                    write_c_call = match write.lang {
                        SymbolLang::C => format!(
                            "(size_t)({})",
                            format_symbol_expr(write, &[("buf", "buf"), ("len", "len")])
                        ),
                        SymbolLang::Cpp => {
                            let fn_name = format!("{prefix}__bind_write");
                            let sig =
                                format!("size_t {fn_name}(const uint8_t* buf, size_t len)");
                            cpp_extern_decls.push(format!("{sig};"));
                            cpp_shims.push(CppShimItem {
                                signature: sig,
                                body: format!(
                                    "return static_cast<size_t>({});",
                                    format_symbol_expr(write, &[("buf", "buf"), ("len", "len")])
                                ),
                            });
                            format!("{fn_name}(buf, len)")
                        }
                    };
                }
                if let ModeOrRef::Ref(r) = &profile.transport.crc8 {
                    has_custom_crc8 = true;
                    register_symbol_include(
                        r,
                        &mut c_includes,
                        &mut c_decls,
                        &mut cpp_includes,
                        &mut cpp_decls,
                    );
                    crc8_c_call = match r.lang {
                        SymbolLang::C => format_symbol_expr(r, &[("buf", "buf"), ("len", "len")]),
                        SymbolLang::Cpp => {
                            let fn_name = format!("{prefix}__bind_crc8");
                            let sig = format!("void {fn_name}(uint8_t* buf, size_t len)");
                            cpp_extern_decls.push(format!("{sig};"));
                            cpp_shims.push(CppShimItem {
                                signature: sig,
                                body: format!(
                                    "{};",
                                    format_symbol_expr(r, &[("buf", "buf"), ("len", "len")])
                                ),
                            });
                            format!("{fn_name}(buf, len)")
                        }
                    };
                }
                if let ModeOrRef::Ref(r) = &profile.transport.crc16 {
                    has_custom_crc16 = true;
                    register_symbol_include(
                        r,
                        &mut c_includes,
                        &mut c_decls,
                        &mut cpp_includes,
                        &mut cpp_decls,
                    );
                    crc16_c_call = match r.lang {
                        SymbolLang::C => format_symbol_expr(r, &[("buf", "buf"), ("len", "len")]),
                        SymbolLang::Cpp => {
                            let fn_name = format!("{prefix}__bind_crc16");
                            let sig = format!("void {fn_name}(uint8_t* buf, size_t len)");
                            cpp_extern_decls.push(format!("{sig};"));
                            cpp_shims.push(CppShimItem {
                                signature: sig,
                                body: format!(
                                    "{};",
                                    format_symbol_expr(r, &[("buf", "buf"), ("len", "len")])
                                ),
                            });
                            format!("{fn_name}(buf, len)")
                        }
                    };
                }
                if let ModeOrRef::Ref(r) = &profile.transport.seq {
                    has_custom_seq = true;
                    register_symbol_include(
                        r,
                        &mut c_includes,
                        &mut c_decls,
                        &mut cpp_includes,
                        &mut cpp_decls,
                    );
                    seq_c_expr = match r.lang {
                        SymbolLang::C => format_symbol_expr(r, &[]),
                        SymbolLang::Cpp => {
                            let fn_name = format!("{prefix}__bind_next_seq");
                            let sig = format!("uint8_t {fn_name}(void)");
                            cpp_extern_decls.push(format!("{sig};"));
                            cpp_shims.push(CppShimItem {
                                signature: sig,
                                body: format!(
                                    "return static_cast<uint8_t>({});",
                                    format_symbol_expr(r, &[])
                                ),
                            });
                            format!("{fn_name}()")
                        }
                    };
                }
            }
        }
    }

    // 5. 简单 [[bind]] 编译
    let mut simple_binds = Vec::new();
    for (idx, b) in profile.bind.iter().enumerate() {
        let Some((g, field)) = resolve_graphic_target(doc, &b.target) else {
            continue;
        };
        let Some(g_enum) = graphic_enum_map.get(g.id()) else {
            continue;
        };
        register_symbol_include(
            &b.source,
            &mut c_includes,
            &mut c_decls,
            &mut cpp_includes,
            &mut cpp_decls,
        );
        let read_expr = match b.source.lang {
            SymbolLang::C => format_symbol_expr(&b.source, &[]),
            SymbolLang::Cpp => {
                let fn_name = format!("{prefix}__bind_val_{idx}");
                let ret_t = match field {
                    "color" => format!("{prefix}_color_t"),
                    "percent" => "float".to_string(),
                    "value" if matches!(g, MkuiGraphic::Float { .. }) => "float".to_string(),
                    "text" => "const char*".to_string(),
                    "visible" => "int".to_string(),
                    _ => "int32_t".to_string(),
                };
                let sig = format!("{ret_t} {fn_name}(void)");
                cpp_extern_decls.push(format!("{sig};"));
                cpp_shims.push(CppShimItem {
                    signature: sig,
                    body: format!("return static_cast<{ret_t}>({});", format_symbol_expr(&b.source, &[])),
                });
                format!("{fn_name}()")
            }
        };
        let setter_call = emit_setter_call(&prefix, g_enum, g, field, &read_expr);
        simple_binds.push(SimpleBindItem {
            period_ms: b.period_ms.unwrap_or(0),
            setter_call,
        });
    }

    // 6. [[api]] 编译
    let mut api_endpoints = Vec::new();
    for ep in &profile.api {
        let Some((g, field)) = resolve_graphic_target(doc, &ep.target) else {
            continue;
        };
        let Some(g_enum) = graphic_enum_map.get(g.id()) else {
            continue;
        };
        let (c_param_sig, body_call) = match ep.value_type {
            FlowValueType::Text => (
                "const char* utf8, size_t len".to_string(),
                format!("return {prefix}__set_text({g_enum}, utf8, len);"),
            ),
            other => (
                format!("{} value", other.c_type(&prefix)),
                format!(
                    "return {}",
                    emit_setter_call(&prefix, g_enum, g, field, "value")
                ),
            ),
        };
        api_endpoints.push(ApiEndpointItem {
            name: ep.name.clone(),
            group: ep.group.clone(),
            c_param_sig,
            body_call,
        });
    }

    // 7. 编译全部 [flows.*]
    let compiled_flows = compile_flows(
        &profile,
        doc,
        &all_code_functions,
        &graphic_enum_map,
        &symbol_getter_map,
    );
    diagnostics.extend(compiled_flows.diagnostics);

    let api_flow_fns: Vec<ApiFlowFnItem> = compiled_flows
        .api_functions
        .into_iter()
        .map(|f| {
            let c_param_sig = if f.params.is_empty() {
                "void".to_string()
            } else {
                f.params
                    .iter()
                    .map(|(n, t)| format!("{} {n}", t.c_type(&prefix)))
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            ApiFlowFnItem {
                name: f.name,
                group: f.group,
                public: f.public,
                c_param_sig,
                body_lines: f.body_lines,
            }
        })
        .collect();

    // 8. MiniJinja 渲染
    let templates = load_effective_templates(&bundle.lib_overrides, options.base_lib_dir.as_deref())?;
    let mut env = Environment::new();
    for (name, body) in &templates {
        env.add_template_owned(name.clone(), body.clone())?;
    }

    let fig_array_len = graphic_items.len().max(1);
    let text_array_len = text_items.len().max(1);
    let pack_array_len = pack_items.len().max(1);
    let frame_array_len = frame_items.len().max(1);

    let ctx = context! {
        cli_version => env!("CARGO_PKG_VERSION"),
        mkui_name => if options.mkui_name.is_empty() { "design.mkui" } else { options.mkui_name.as_str() },
        prefix => prefix,
        prefix_upper => prefix_upper,
        cpp_wrapper => profile.cpp_wrapper,
        is_api_mode => profile.mode == CodegenMode::Api,
        is_payload_mode => profile.transport.kind == TransportKind::Payload,
        is_frame_mode => profile.transport.kind == TransportKind::Frame,
        max_frame => profile.transport.max_frame.max(120),
        min_interval_ms => profile.runtime.min_interval_ms,
        clear_layers_int => if profile.runtime.clear_layers_on_start { 1 } else { 0 },
        custom_hooks => profile.custom_hooks,
        custom_hooks_int => if profile.custom_hooks { 1 } else { 0 },
        text_utf16_int => if profile.text_encoding == ProfileTextEncoding::Utf16le { 1 } else { 0 },
        start_frame_index => start_frame_index,
        frame_count => frame_items.len(),
        graphic_count => graphic_items.len(),
        text_count => text_items.len(),
        pack_count => pack_items.len(),
        fig_array_len => fig_array_len,
        text_array_len => text_array_len,
        pack_array_len => pack_array_len,
        frame_array_len => frame_array_len,
        frames => frame_items,
        graphics => graphic_items,
        text_items => text_items,
        packs => pack_items,
        c_includes => c_includes.into_iter().collect::<Vec<_>>(),
        c_decls => c_decls,
        cpp_includes => cpp_includes.into_iter().collect::<Vec<_>>(),
        cpp_decls => cpp_decls,
        cpp_extern_decls => cpp_extern_decls,
        cpp_shims => cpp_shims,
        has_cpp_bindings => !cpp_shims.is_empty(),
        code_headers => code_headers,
        code_sources => code_sources,
        flow_static_decls => compiled_flows.static_decls,
        mapping_flow_lines => compiled_flows.mapping_sync_lines,
        simple_binds => simple_binds,
        api_endpoints => api_endpoints,
        api_flow_fns => api_flow_fns,
        robot_id_c_expr => robot_id_c_expr,
        has_online => has_online,
        online_c_expr => online_c_expr,
        has_now_ms => has_now_ms,
        now_ms_c_expr => now_ms_c_expr,
        has_port_ready => has_port_ready,
        port_ready_c_expr => port_ready_c_expr,
        has_lock => has_lock,
        lock_stmt => lock_stmt,
        has_unlock => has_unlock,
        unlock_stmt => unlock_stmt,
        send_c_call => send_c_call,
        send_ok_c_expr => send_ok_c_expr,
        write_c_call => write_c_call,
        has_custom_crc8 => has_custom_crc8,
        crc8_c_call => crc8_c_call,
        has_custom_crc16 => has_custom_crc16,
        crc16_c_call => crc16_c_call,
        has_custom_seq => has_custom_seq,
        seq_c_expr => seq_c_expr,
    };

    let mut files = BTreeMap::new();
    let mappings = [
        (format!("include/{prefix}.h"), "public_header.h.j2"),
        (format!("include/{prefix}.hpp"), "cpp_wrapper.hpp.j2"),
        (format!("{prefix}_layout.h"), "layout.h.j2"),
        (format!("{prefix}_layout.c"), "layout.c.j2"),
        (format!("{prefix}_runtime.c"), "runtime.c.j2"),
        (format!("{prefix}_gen.c"), "gen.c.j2"),
        (format!("{prefix}_bind.cpp"), "bind.cpp.j2"),
    ];

    for (out_rel, tpl_name) in mappings {
        let rendered = env.get_template(tpl_name)?.render(&ctx)?;
        files.insert(out_rel, normalize_lf(&rendered));
    }

    let output_list: Vec<String> = files.keys().cloned().collect();
    let doc_bytes = rmp_serde::to_vec_named(doc)?;
    let input_hash = compute_bundle_hash(
        &doc_bytes,
        &effective_profile_str,
        &bundle.code_files,
        &bundle.lib_overrides,
        options.frames_override.as_deref().unwrap_or(&profile.frames),
    );
    let stamp_rel_path = format!("{prefix}.stamp");

    Ok(GeneratedProject {
        prefix,
        files,
        output_list,
        stamp_rel_path,
        input_hash,
        diagnostics,
    })
}

/// 仅在目标文件不存在时生成 custom/ 骨架，已存在时绝对不触碰
pub fn scaffold_custom_dir(
    bundle: &CodegenBundle,
    profile_override: Option<&str>,
    base_lib_dir: Option<&Path>,
    custom_dir: &Path,
) -> AppResult<(PathBuf, bool)> {
    let profile_text = profile_override.unwrap_or(&bundle.profile_toml);
    let effective_profile_str = if profile_text.trim().is_empty() {
        crate::profile::default_profile_toml()
    } else {
        profile_text.to_string()
    };
    let profile: CodegenProfile = toml::from_str(&effective_profile_str)?;
    let prefix = profile.prefix;

    let templates = load_effective_templates(&bundle.lib_overrides, base_lib_dir)?;
    let mut env = Environment::new();
    env.add_template_owned(
        "custom_scaffold.c.j2".to_string(),
        templates["custom_scaffold.c.j2"].clone(),
    )?;
    let rendered = env
        .get_template("custom_scaffold.c.j2")?
        .render(context! { prefix => prefix })?;

    fs::create_dir_all(custom_dir)?;
    let dest = custom_dir.join(format!("{prefix}_custom.c"));
    if dest.exists() {
        return Ok((dest, false));
    }
    write_if_changed(&dest, &rendered)?;
    Ok((dest, true))
}

/// 将渲染好的生成项目落盘（可指定 stamp 文件）
pub fn write_generated_to_dir(
    generated: &GeneratedProject,
    out_dir: &Path,
    stamp_path: Option<&Path>,
) -> AppResult<Vec<PathBuf>> {
    let stamp_pair = stamp_path.map(|p| (p, generated.input_hash.as_str()));
    sync_output_dir(out_dir, &generated.files, stamp_pair)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{MkuiFrame, MkuiGroup};
    use crate::profile::{FlowEdge, FlowGraph, FlowNode, get_preset};

    fn sample_doc() -> MkuiDocument {
        MkuiDocument {
            schema_version: 1,
            project_id: "p_demo".into(),
            name: "DemoHUD".into(),
            description: "".into(),
            robot_role: "infantry_3".into(),
            active_frame_id: "f1".into(),
            frames: vec![MkuiFrame {
                id: "f1".into(),
                name: "战斗画面".into(),
                groups: vec![MkuiGroup {
                    id: "g1".into(),
                    name: "Battery".into(),
                    visible: true,
                    locked: false,
                    collapsed: false,
                }],
                graphics: vec![
                    MkuiGraphic::Line {
                        id: "bar1".into(),
                        figure_name: "BAR".into(),
                        display_name: "电容条".into(),
                        var_key: Some("battery.bar".into()),
                        group_id: "g1".into(),
                        layer: 1,
                        color: 2,
                        line_width: 12,
                        dynamic: true,
                        visible: true,
                        locked: false,
                        start_x: 700,
                        start_y: 200,
                        end_x: 1200,
                        end_y: 200,
                    },
                    MkuiGraphic::Float {
                        id: "num1".into(),
                        figure_name: "PCT".into(),
                        display_name: "电容电压".into(),
                        var_key: Some("battery.pct".into()),
                        group_id: "g1".into(),
                        layer: 1,
                        color: 8,
                        line_width: 2,
                        dynamic: true,
                        visible: true,
                        locked: false,
                        x: 700,
                        y: 240,
                        font_size: 20,
                        value: 24.0,
                    },
                ],
            }],
            created_at: "".into(),
            updated_at: "".into(),
        }
    }

    #[test]
    fn deterministic_generation_produces_byte_identical_files() {
        let doc = sample_doc();
        let mut profile = get_preset("generic-c").unwrap().profile;
        profile.flows.insert(
            "battery".into(),
            FlowGraph {
                nodes: vec![
                    FlowNode {
                        id: "entry".into(),
                        kind: "api_entry".into(),
                        node_ref: None,
                        label: None,
                        params: serde_json::json!({
                            "name": "update_battery",
                            "group": "power",
                            "public": true,
                            "args": [{ "name": "pct", "type": "float" }]
                        }),
                        position: None,
                    },
                    FlowNode {
                        id: "col".into(),
                        kind: "threshold_color".into(),
                        node_ref: None,
                        label: None,
                        params: serde_json::json!({
                            "steps": [[0.8, "green"], [0.2, "orange"]],
                            "else": "pink"
                        }),
                        position: None,
                    },
                    FlowNode {
                        id: "sink_bar".into(),
                        kind: "graphic_sink".into(),
                        node_ref: Some("battery.bar.percent".into()),
                        label: None,
                        params: serde_json::json!({}),
                        position: None,
                    },
                    FlowNode {
                        id: "sink_col".into(),
                        kind: "graphic_sink".into(),
                        node_ref: Some("battery.bar.color".into()),
                        label: None,
                        params: serde_json::json!({}),
                        position: None,
                    },
                ],
                edges: vec![
                    FlowEdge { id: None, from: "entry.arg0".into(), to: "sink_bar.in".into() },
                    FlowEdge { id: None, from: "entry.arg0".into(), to: "col.in".into() },
                    FlowEdge { id: None, from: "col.out".into(), to: "sink_col.in".into() },
                ],
                layout: BTreeMap::new(),
            },
        );
        let bundle = CodegenBundle {
            profile_toml: toml::to_string(&profile).unwrap(),
            code_files: BTreeMap::new(),
            lib_overrides: BTreeMap::new(),
        };
        let opts = GenerateOptions {
            mkui_name: "hero.mkui".into(),
            ..Default::default()
        };

        let gen1 = render_project(&doc, &bundle, &opts).unwrap();
        let gen2 = render_project(&doc, &bundle, &opts).unwrap();
        assert_eq!(gen1.files, gen2.files);
        assert_eq!(gen1.input_hash, gen2.input_hash);
        assert!(gen1.diagnostics.iter().all(|d| !d.is_error()));
        assert!(gen1.files["include/mk_hud.h"].contains("mk_hud_update_battery"));
    }
}
