//! 纯 Rust 无损 C 文件分块解析器与字节区间补丁（支持代码节点 ↔ 自由 C 文件双向同步）

pub mod parser;
pub mod patch;

pub use parser::*;
pub use patch::*;
