//! 内置官方“轮椅”预设清单

use serde::{Deserialize, Serialize};

use super::{CodegenMode, CodegenProfile, TransportKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodegenPresetInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub mode: CodegenMode,
    pub transport_kind: TransportKind,
    pub profile_toml: String,
    pub profile: CodegenProfile,
}

const GENERIC_C_TOML: &str = include_str!("../../profiles/generic-c.toml");
const UICRM_NEW_TOML: &str = include_str!("../../profiles/uicrm-new.toml");
const UICRM_LEGACY_TOML: &str = include_str!("../../profiles/uicrm-legacy.toml");

fn parse_preset(id: &str, name: &str, description: &str, raw: &str) -> CodegenPresetInfo {
    let profile: CodegenProfile =
        toml::from_str(raw).unwrap_or_else(|e| panic!("内置预设 {id} 解析失败: {e}"));
    CodegenPresetInfo {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        mode: profile.mode,
        transport_kind: profile.transport.kind,
        profile_toml: raw.replace("\r\n", "\n"),
        profile,
    }
}

/// 返回全部内置官方预设
pub fn builtin_presets() -> Vec<CodegenPresetInfo> {
    vec![
        parse_preset(
            "generic-c",
            "通用纯 C（API 模式）",
            "零外部符号依赖，生成 port_t 回调表与自定义公开接口，适合任何 C/C++ 固件接入。",
            GENERIC_C_TOML,
        ),
        parse_preset(
            "uicrm-new",
            "UICRM 新裁判栈（Payload 直通）",
            "Mapping 模式直接调用 ::referee::Referee::Transmit(0x0301, data, len)，不抢占外层帧与 seq。",
            UICRM_NEW_TOML,
        ),
        parse_preset(
            "uicrm-legacy",
            "UICRM 旧栈 / 自写串口（Frame 自封）",
            "Mapping 模式自行拼装 0xA5 帧，复用队伍已有 UART::Write 与 append_crc8/16_check_sum。",
            UICRM_LEGACY_TOML,
        ),
    ]
}

pub fn get_preset(id: &str) -> Option<CodegenPresetInfo> {
    builtin_presets().into_iter().find(|p| p.id == id)
}

pub fn default_profile_toml() -> String {
    GENERIC_C_TOML.replace("\r\n", "\n")
}
