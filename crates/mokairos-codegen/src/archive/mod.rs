//! .mkui ZIP + MessagePack 打包与解包引擎

pub mod pack;
pub mod unpack;

pub const MANIFEST_ENTRY: &str = "manifest.json";
pub const DESIGN_ENTRY: &str = "design.msgpack";
pub const HISTORY_INDEX_ENTRY: &str = "history/index.msgpack";
pub const HISTORY_COMMITS_PREFIX: &str = "history/commits/";

pub const CODEGEN_PREFIX: &str = "codegen/";
pub const CODEGEN_PROFILE_ENTRY: &str = "codegen/profile.toml";
pub const CODEGEN_CODE_PREFIX: &str = "codegen/code/";
pub const CODEGEN_LIB_PREFIX: &str = "codegen/lib/";
pub const MAX_CODEGEN_ENTRY_BYTES: usize = 1024 * 1024;
