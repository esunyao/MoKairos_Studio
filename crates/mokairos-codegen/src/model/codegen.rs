//! .mkui 内嵌代码生成配置与用户代码包模型

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// 与 .mkui 内 `codegen/` 目录对应的完整代码生成包
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodegenBundle {
    /// `codegen/profile.toml` 全文
    pub profile_toml: String,
    /// `codegen/code/<filename>` 用户手写 C/H 代码文件（相对 `codegen/code/`）
    #[serde(default)]
    pub code_files: BTreeMap<String, String>,
    /// `codegen/lib/<template>` 可选基底 lib 模板覆写（相对 `codegen/lib/`）
    #[serde(default)]
    pub lib_overrides: BTreeMap<String, String>,
}
