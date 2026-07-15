#[cfg(feature = "flutter")]
mod frb_generated;
// Multi-platform core library entry point.
// Provides unified SQLite access, terminal management, and SSH client.

pub mod crypto;
pub mod db;
#[cfg(feature = "desktop-native")]
pub mod event;
#[cfg(feature = "desktop-native")]
pub mod ftp;
pub mod models;
pub mod multi_device_clipboard;
pub mod screenshot;
pub mod services;
#[cfg(feature = "desktop-native")]
pub mod ssh;
#[cfg(feature = "desktop-native")]
pub mod terminal;

#[cfg(any(feature = "napi", feature = "flutter"))]
pub mod bindings;

// Re-export core types
pub use db::{Database, DbError};
#[cfg(feature = "desktop-native")]
pub use ftp::*;
pub use models::*;
pub use services::*;
#[cfg(feature = "desktop-native")]
pub use ssh::*;
#[cfg(feature = "desktop-native")]
pub use terminal::*;
