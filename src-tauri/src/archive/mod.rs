//! .mkui ZIP + MessagePack 打包与解包引擎

pub mod pack;
pub mod unpack;

pub const MANIFEST_ENTRY: &str = "manifest.json";
pub const DESIGN_ENTRY: &str = "design.msgpack";
pub const HISTORY_INDEX_ENTRY: &str = "history/index.msgpack";
pub const HISTORY_COMMITS_PREFIX: &str = "history/commits/";
