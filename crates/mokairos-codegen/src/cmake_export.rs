//! 渲染 `cmake/MoKairosUI.cmake` 与 CMakeLists 接入片段

use minijinja::{Environment, context};
use serde::{Deserialize, Serialize};

use crate::archive::pack::normalize_lf;
use crate::error::AppResult;

const CMAKE_TEMPLATE: &str = include_str!("../templates/cmake/MoKairosUI.cmake.j2");

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CmakeExportOptions {
    pub version: Option<String>,
    pub base_url: Option<String>,
    pub sha256_windows_x64: Option<String>,
    pub sha256_linux_x64: Option<String>,
    pub sha256_linux_arm64: Option<String>,
    pub sha256_macos_arm64: Option<String>,
    pub sha256_macos_x64: Option<String>,
}

/// 渲染 `MoKairosUI.cmake` 模块内容
pub fn render_cmake_module(options: &CmakeExportOptions) -> AppResult<String> {
    let mut env = Environment::new();
    env.add_template_owned("MoKairosUI.cmake.j2".to_string(), normalize_lf(CMAKE_TEMPLATE))?;
    let rendered = env.get_template("MoKairosUI.cmake.j2")?.render(context! {
        cli_version => env!("CARGO_PKG_VERSION"),
        default_version => options.version.as_deref().unwrap_or(env!("CARGO_PKG_VERSION")),
        default_base_url => options.base_url.as_deref().unwrap_or("https://github.com/esunyao/MoKairos_Studio/releases/download"),
        sha256_windows_x64 => options.sha256_windows_x64.as_deref().unwrap_or(""),
        sha256_linux_x64 => options.sha256_linux_x64.as_deref().unwrap_or(""),
        sha256_linux_arm64 => options.sha256_linux_arm64.as_deref().unwrap_or(""),
        sha256_macos_arm64 => options.sha256_macos_arm64.as_deref().unwrap_or(""),
        sha256_macos_x64 => options.sha256_macos_x64.as_deref().unwrap_or(""),
    })?;
    Ok(normalize_lf(&rendered))
}

/// 生成供用户复制到整车 CMakeLists.txt 的接入片段
pub fn build_cmake_snippet(mkui_file_name: &str, prefix: &str) -> String {
    let clean_mkui = if mkui_file_name.trim().is_empty() {
        "ui/hero.mkui"
    } else {
        mkui_file_name.trim()
    };
    let clean_target = if prefix.trim().is_empty() {
        "mk_hud"
    } else {
        prefix.trim()
    };
    format!(
        "# 如需完全离线或使用未发布版本，可在配置阶段传入 -DMOKAIROS_UI_CLI=/path/to/mokairos-ui\n\
include(${{CMAKE_SOURCE_DIR}}/cmake/MoKairosUI.cmake)\n\n\
mokairos_add_ui({clean_target}\n\
    MKUI       \"${{CMAKE_CURRENT_SOURCE_DIR}}/{clean_mkui}\"\n\
    TARGET     <YOUR_FIRMWARE_TARGET>\n\
    CUSTOM_DIR \"${{CMAKE_CURRENT_SOURCE_DIR}}/ui/custom\"\n\
)\n"
    )
}
