//! 代码生成、节点解析、CMake 导出与源码目录直出 Tauri IPC 命令

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::Serialize;

use crate::archive::pack::normalize_lf;
use crate::error::{AppError, AppResult};
use crate::model::{CodegenBundle, MkuiDocument};
use mokairos_codegen::cmake_export::{CmakeExportOptions, build_cmake_snippet, render_cmake_module};
use mokairos_codegen::codefile::{
    CodeNodeUpsertResult, CodeNodeUpsertSpec, ParsedCodeFile, parse_c_file, upsert_function_block,
};
use mokairos_codegen::error::Diagnostic;
use mokairos_codegen::generate::{
    GenerateOptions, builtin_base_templates, render_project, scaffold_custom_dir,
    write_generated_to_dir, write_if_changed,
};
use mokairos_codegen::profile::{
    CodegenPresetInfo, CodegenProfile, builtin_presets, parse_profile_toml,
    validate_profile_toml_and_code,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodegenPreviewResult {
    pub prefix: String,
    pub files: BTreeMap<String, String>,
    pub output_list: Vec<String>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCmakeResult {
    pub cmake_path: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSourcesResult {
    pub target_dir: String,
    pub written_files: Vec<String>,
    pub custom_scaffold_path: Option<String>,
    pub custom_scaffold_created: bool,
    pub diagnostics: Vec<Diagnostic>,
}

/// 加载内置官方预设清单
#[tauri::command]
pub fn codegen_load_presets() -> Vec<CodegenPresetInfo> {
    builtin_presets()
}

/// 加载官方内置基底 lib 模板全文（供代码页只读查看与一键覆写）
#[tauri::command]
pub fn codegen_load_builtin_base_lib() -> BTreeMap<String, String> {
    builtin_base_templates()
}

/// 解析 profile.toml 为完整结构
#[tauri::command]
pub fn codegen_parse_profile(profile_toml: String) -> AppResult<CodegenProfile> {
    parse_profile_toml(&profile_toml)
}

/// 校验生成配置、设计文档与代码文件
#[tauri::command]
pub fn codegen_validate_profile(
    profile_toml: String,
    document: MkuiDocument,
    code_files: BTreeMap<String, String>,
) -> Vec<Diagnostic> {
    validate_profile_toml_and_code(&profile_toml, &document, &code_files)
}

/// 运行代码生成预览（与 CLI 使用完全同一份 Rust 渲染实现）
#[tauri::command]
pub fn codegen_preview(
    document: MkuiDocument,
    codegen: CodegenBundle,
    mkui_name: Option<String>,
) -> AppResult<CodegenPreviewResult> {
    let opts = GenerateOptions {
        mkui_name: mkui_name.unwrap_or_else(|| format!("{}.mkui", document.name)),
        ..Default::default()
    };
    let generated = render_project(&document, &codegen, &opts)?;
    Ok(CodegenPreviewResult {
        prefix: generated.prefix,
        files: generated.files,
        output_list: generated.output_list,
        diagnostics: generated.diagnostics,
    })
}

/// 无损解析单个代码节点文件并返回函数签名目录
#[tauri::command]
pub fn codegen_parse_codefile(path: String, content: String, prefix: String) -> ParsedCodeFile {
    parse_c_file(&path, &normalize_lf(&content), &prefix)
}

/// 从节点图精准新增或替换一个代码节点函数块
#[tauri::command]
pub fn codegen_upsert_code_node(
    path: String,
    content: String,
    prefix: String,
    spec: CodeNodeUpsertSpec,
) -> CodeNodeUpsertResult {
    upsert_function_block(&path, &normalize_lf(&content), &prefix, &spec)
}

/// 导出 cmake/MoKairosUI.cmake 并返回 CMakeLists 接入片段
#[tauri::command]
pub fn codegen_export_cmake(
    target_dir: String,
    mkui_file_name: String,
    prefix: String,
    version: Option<String>,
    base_url: Option<String>,
) -> AppResult<ExportCmakeResult> {
    let dir = PathBuf::from(&target_dir);
    fs::create_dir_all(&dir)?;
    let cmake_file = dir.join("MoKairosUI.cmake");
    let content = render_cmake_module(&CmakeExportOptions {
        version,
        base_url,
        ..Default::default()
    })?;
    write_if_changed(&cmake_file, &content)?;
    let snippet = build_cmake_snippet(&mkui_file_name, &prefix);
    Ok(ExportCmakeResult {
        cmake_path: cmake_file.to_string_lossy().replace('\\', "/"),
        snippet,
    })
}

/// 直接将生成好的 C/C++ UI 源码导出到指定目录（可选同时初始化 custom/ 骨架）
#[tauri::command]
pub fn codegen_export_sources(
    document: MkuiDocument,
    codegen: CodegenBundle,
    target_dir: String,
    include_custom_scaffold: bool,
    mkui_name: Option<String>,
) -> AppResult<ExportSourcesResult> {
    let dir = PathBuf::from(&target_dir);
    let opts = GenerateOptions {
        mkui_name: mkui_name.unwrap_or_else(|| format!("{}.mkui", document.name)),
        ..Default::default()
    };
    let generated = render_project(&document, &codegen, &opts)?;
    if generated.diagnostics.iter().any(|d| d.is_error()) {
        return Err(AppError::Codegen(
            generated
                .diagnostics
                .iter()
                .filter(|d| d.is_error())
                .map(|d| d.message.clone())
                .collect::<Vec<_>>()
                .join("；"),
        ));
    }

    let gen_out_dir = if include_custom_scaffold {
        dir.join("generated")
    } else {
        dir.clone()
    };
    let stamp = gen_out_dir.join(&generated.stamp_rel_path);
    write_generated_to_dir(&generated, &gen_out_dir, Some(&stamp))?;

    let mut custom_path = None;
    let mut custom_created = false;
    if include_custom_scaffold {
        let (path, created) = scaffold_custom_dir(&codegen, None, None, &dir.join("custom"))?;
        custom_path = Some(path.to_string_lossy().replace('\\', "/"));
        custom_created = created;
    }

    Ok(ExportSourcesResult {
        target_dir: dir.to_string_lossy().replace('\\', "/"),
        written_files: generated.output_list,
        custom_scaffold_path: custom_path,
        custom_scaffold_created: custom_created,
        diagnostics: generated.diagnostics,
    })
}
