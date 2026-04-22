// Multi-platform core library entry point.
// Provides unified SQLite access, terminal management, and SSH client.

pub mod crypto;
pub mod db;
pub mod event;
pub mod ftp;
pub mod models;
pub mod services;
pub mod ssh;
pub mod terminal;

#[cfg(feature = "napi")]
pub mod bindings;

// Re-export core types
pub use db::{Database, DbError};
pub use ftp::*;
pub use models::*;
pub use services::*;
pub use ssh::*;
pub use terminal::*;
