// 多平台核心库入口
// 提供统一的 SQLite 数据库访问层，支持 Electron 和 Flutter

pub mod db;
pub mod models;
pub mod services;

#[cfg(feature = "napi")]
pub mod bindings;

// 重新导出核心类型
pub use db::{Database, DbError};
pub use models::*;
pub use services::*;
