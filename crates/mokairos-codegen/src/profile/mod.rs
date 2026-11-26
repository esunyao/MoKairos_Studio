//! 代码生成配置 `codegen/profile.toml` 解析、官方预设与校验

pub mod presets;
pub mod schema;
pub mod validate;

pub use presets::*;
pub use schema::*;
pub use validate::*;
