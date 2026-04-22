mod connection;
mod credentials;
mod models;
mod operations;
mod profile;
mod protocol;
mod transfer;

pub use self::models::*;
use self::protocol::{ftp_file_to_transfer_entry, parse_ftp_listing_line, FtpControlSession};
use self::transfer::{PendingTaskMap, TransferControlMap};

use anyhow::{anyhow, Context, Result};
use async_std::io::{Read as AsyncStdRead, Write as AsyncStdWrite};
use russh::client::{self, Handler};
use russh_keys::PublicKey;
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncRead, AsyncWrite};

use crate::db::Database;
#[cfg(feature = "napi")]
use crate::event::EventSink;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostVerificationPayload {
    pub status: String,
    pub host: String,
    pub port: u32,
    pub algorithm: String,
    pub fingerprint: String,
    pub stored_fingerprint: Option<String>,
}

#[derive(Debug, Clone)]
struct ResolvedProfileData {
    profile_id: String,
    label: String,
    protocol: String,
    host: String,
    port: u32,
    username: String,
    auth_type: String,
    password: Option<String>,
    private_key_path: Option<String>,
    certificate_path: Option<String>,
    host_ca_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    default_remote_path: String,
    default_local_path: String,
    jump_host_json: Option<String>,
    ssh_tunnel: Option<Box<ResolvedProfileData>>,
}

trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T> AsyncStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

type FtpDataReader = Box<dyn AsyncStdRead + Unpin + Send>;
type FtpDataWriter = Box<dyn AsyncStdWrite + Unpin + Send>;

#[derive(Debug, Clone)]
struct SshProfileRecord {
    host: String,
    port: u32,
    username: String,
    auth_type: String,
    save_password: bool,
    private_key_path: Option<String>,
    certificate_path: Option<String>,
    host_ca_key_path: Option<String>,
    jump_host_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshJumpHostConfig {
    host: String,
    port: u32,
    username: String,
    auth_type: String,
    profile_id: Option<String>,
    host_ca_key_path: Option<String>,
}

struct FtpRuntimeSession {
    descriptor: Mutex<FtpConnectionDescriptor>,
    resolved: ResolvedProfileData,
    ssh: tokio::sync::Mutex<Option<client::Handle<SshClientHandler>>>,
    sftp: Option<Arc<SftpSession>>,
}

impl FtpRuntimeSession {
    fn require_sftp(&self) -> Result<Arc<SftpSession>> {
        self.sftp.clone().ok_or_else(|| {
            anyhow!(
                "protocol '{}' does not use an SFTP channel",
                self.resolved.protocol
            )
        })
    }
}

struct PendingAuthSession {
    resolved: ResolvedProfileData,
    ssh: tokio::sync::Mutex<Option<client::Handle<SshClientHandler>>>,
}

struct FtpRemoteMetadata {
    is_dir: bool,
    size: u64,
}

struct SshClientHandler {
    server_key_algorithm: Arc<Mutex<String>>,
    server_key_fingerprint: Arc<Mutex<String>>,
    server_key_bytes: Arc<Mutex<Vec<u8>>>,
}

impl SshClientHandler {
    fn new() -> (Self, Arc<Mutex<String>>, Arc<Mutex<String>>, Arc<Mutex<Vec<u8>>>) {
        let alg = Arc::new(Mutex::new(String::new()));
        let fp = Arc::new(Mutex::new(String::new()));
        let raw = Arc::new(Mutex::new(Vec::new()));
        (
            Self {
                server_key_algorithm: alg.clone(),
                server_key_fingerprint: fp.clone(),
                server_key_bytes: raw.clone(),
            },
            alg,
            fp,
            raw,
        )
    }
}

#[async_trait::async_trait]
impl Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key_ext(
        &mut self,
        server_public_key: &PublicKey,
        server_key_bytes: &[u8],
    ) -> std::result::Result<bool, Self::Error> {
        let algorithm = server_public_key.algorithm().to_string();
        let fingerprint = server_public_key
            .fingerprint(russh::keys::HashAlg::Sha256)
            .to_string();
        *self.server_key_algorithm.lock().unwrap() = algorithm;
        *self.server_key_fingerprint.lock().unwrap() = fingerprint;
        *self.server_key_bytes.lock().unwrap() = server_key_bytes.to_vec();
        Ok(true)
    }
}

type SessionMap = HashMap<String, Arc<FtpRuntimeSession>>;
type TaskMap = HashMap<String, TransferTask>;
type PendingAuthMap = HashMap<String, Arc<PendingAuthSession>>;

struct FtpManagerInner {
    db: Arc<Database>,
    sessions: RwLock<SessionMap>,
    tasks: RwLock<TaskMap>,
    pending_jobs: Mutex<PendingTaskMap>,
    task_controls: Mutex<TransferControlMap>,
    pending_auth: Mutex<PendingAuthMap>,
    retry_policy: RwLock<FtpRetryPolicy>,
    #[cfg(feature = "napi")]
    event_sink: Mutex<Option<EventSink>>,
    next_session_counter: AtomicU64,
}

#[derive(Clone)]
pub struct FtpManager {
    inner: Arc<FtpManagerInner>,
}

impl FtpManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            inner: Arc::new(FtpManagerInner {
                db,
                sessions: RwLock::new(HashMap::new()),
                tasks: RwLock::new(HashMap::new()),
                pending_jobs: Mutex::new(HashMap::new()),
                task_controls: Mutex::new(HashMap::new()),
                pending_auth: Mutex::new(HashMap::new()),
                retry_policy: RwLock::new(FtpRetryPolicy {
                    max_retries: DEFAULT_RETRY_LIMIT,
                    base_delay_secs: DEFAULT_RETRY_BASE_DELAY_SECS,
                }),
                #[cfg(feature = "napi")]
                event_sink: Mutex::new(None),
                next_session_counter: AtomicU64::new(1),
            }),
        }
    }

    fn next_session_id(&self) -> String {
        let counter = self
            .inner
            .next_session_counter
            .fetch_add(1, Ordering::SeqCst);
        format!("ftp-{}-{}", unix_now(), counter)
    }

    pub fn list_local_directory(&self, path: String) -> Result<Vec<FileTransferEntry>> {
        let path = normalize_local_path(path);
        let mut entries = std::fs::read_dir(&path)
            .with_context(|| format!("failed to read local directory {}", path.display()))?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let metadata = entry.metadata().ok()?;
                Some(FileTransferEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir: metadata.is_dir(),
                    size: u64_to_i64(metadata.len()),
                    modified_at: metadata.modified().ok().map(system_time_to_millis),
                    permissions: Some(if metadata.permissions().readonly() {
                        "ro".to_string()
                    } else {
                        "rw".to_string()
                    }),
                    owner: None,
                    source: "local".to_string(),
                })
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            right
                .is_dir
                .cmp(&left.is_dir)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });
        Ok(entries)
    }

    pub fn load_local_image_preview(
        &self,
        path: String,
        max_bytes: Option<u32>,
    ) -> Result<Option<String>> {
        let normalized_path = normalize_local_path(path);
        let Some(mime) = image_mime_for_path(&normalized_path.to_string_lossy()) else {
            return Ok(None);
        };
        let max_bytes = max_bytes.unwrap_or(DEFAULT_IMAGE_PREVIEW_MAX_BYTES as u32) as u64;
        let metadata = std::fs::metadata(&normalized_path)
            .with_context(|| format!("failed to stat local image {}", normalized_path.display()))?;
        if metadata.is_dir() || metadata.len() > max_bytes {
            return Ok(None);
        }
        let bytes = std::fs::read(&normalized_path)
            .with_context(|| format!("failed to read local image {}", normalized_path.display()))?;
        Ok(Some(format!(
            "data:{};base64,{}",
            mime,
            encode_base64(&bytes)
        )))
    }

    pub fn create_local_dir(&self, path: String) -> Result<()> {
        let target = normalize_local_path(path);
        std::fs::create_dir_all(&target)
            .with_context(|| format!("failed to create local directory {}", target.display()))
    }

    pub fn rename_local_path(&self, old_path: String, new_path: String) -> Result<()> {
        let old_path = normalize_local_path(old_path);
        let new_path = normalize_local_path(new_path);
        std::fs::rename(&old_path, &new_path).with_context(|| {
            format!(
                "failed to rename local path {} -> {}",
                old_path.display(),
                new_path.display()
            )
        })
    }

    pub fn delete_local_path(&self, path: String) -> Result<()> {
        let target = normalize_local_path(path);
        if target.is_dir() {
            std::fs::remove_dir_all(&target)
                .with_context(|| format!("failed to remove local directory {}", target.display()))
        } else {
            std::fs::remove_file(&target)
                .with_context(|| format!("failed to remove local file {}", target.display()))
        }
    }

    pub fn copy_local_path(&self, source_path: String, target_path: String) -> Result<()> {
        let source_path = normalize_local_path(source_path);
        let target_path = normalize_local_path(target_path);
        self.copy_local_path_recursive(&source_path, &target_path)
    }

    pub fn get_default_local_path(&self) -> String {
        default_local_root()
    }

    fn get_session(&self, session_id: &str) -> Result<Arc<FtpRuntimeSession>> {
        self.inner
            .sessions
            .read()
            .map_err(|_| anyhow!("ftp sessions lock poisoned"))?
            .get(session_id)
            .cloned()
            .ok_or_else(|| anyhow!("FTP session '{}' not found", session_id))
    }

    fn copy_local_path_recursive(&self, source_path: &Path, target_path: &Path) -> Result<()> {
        let metadata = std::fs::metadata(source_path)
            .with_context(|| format!("failed to inspect local path {}", source_path.display()))?;
        if metadata.is_dir() {
            std::fs::create_dir_all(target_path).with_context(|| {
                format!("failed to create local directory {}", target_path.display())
            })?;
            for entry in std::fs::read_dir(source_path).with_context(|| {
                format!("failed to read local directory {}", source_path.display())
            })? {
                let entry = entry.with_context(|| {
                    format!("failed to read local directory {}", source_path.display())
                })?;
                self.copy_local_path_recursive(
                    &entry.path(),
                    &target_path.join(entry.file_name()),
                )?;
            }
            return Ok(());
        }

        if let Some(parent) = target_path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).with_context(|| {
                    format!("failed to create local directory {}", parent.display())
                })?;
            }
        }
        std::fs::copy(source_path, target_path).with_context(|| {
            format!(
                "failed to copy local file '{}' to '{}'",
                source_path.display(),
                target_path.display()
            )
        })?;
        Ok(())
    }

    fn emit_event(&self, _event: FtpEventEnvelope) {
        #[cfg(feature = "napi")]
        {
            crate::event::emit_serialized_event(&self.inner.event_sink, &_event, "ftp");
        }
    }

    #[cfg(feature = "napi")]
    pub fn register_event_sink(&self, sink: EventSink) -> Result<()> {
        crate::event::register_event_sink(&self.inner.event_sink, sink, "ftp")
    }
}

fn default_local_root() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

fn default_port_for_protocol(protocol: &str) -> u32 {
    match protocol {
        "sftp" => 22,
        "ftp" | "ftps" => 21,
        _ => 22,
    }
}

fn normalize_remote_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return "/".to_string();
    }
    trimmed.replace('\\', "/")
}

fn join_remote_path(base: &str, name: &str) -> String {
    let normalized_base = normalize_remote_path(base);
    if normalized_base == "/" {
        format!("/{}", name)
    } else {
        format!("{}/{}", normalized_base.trim_end_matches('/'), name)
    }
}

fn join_remote_relative_path(base: &str, relative_path: &Path) -> String {
    let mut current = normalize_remote_path(base);
    for segment in relative_path.components() {
        let name = segment.as_os_str().to_string_lossy();
        current = join_remote_path(&current, &name);
    }
    current
}

fn remote_parent_path(path: &str) -> Option<String> {
    let normalized = normalize_remote_path(path);
    if normalized == "/" {
        return None;
    }
    let index = normalized.rfind('/')?;
    if index == 0 {
        Some("/".to_string())
    } else {
        Some(normalized[..index].to_string())
    }
}

fn normalize_local_path(path: String) -> PathBuf {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        PathBuf::from(default_local_root())
    } else {
        PathBuf::from(trimmed)
    }
}

fn normalize_optional_id(value: Option<&str>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| path.to_string())
}

fn normalize_transfer_priority(priority: &str) -> String {
    match priority.trim().to_lowercase().as_str() {
        "high" => "high".to_string(),
        "low" => "low".to_string(),
        _ => "medium".to_string(),
    }
}

fn transfer_priority_rank(priority: &str) -> u8 {
    match normalize_transfer_priority(priority).as_str() {
        "high" => 2,
        "medium" => 1,
        "low" => 0,
        _ => 1,
    }
}

const DEFAULT_RETRY_LIMIT: i64 = 3;
const DEFAULT_RETRY_BASE_DELAY_SECS: i64 = 5;
const DEFAULT_IMAGE_PREVIEW_MAX_BYTES: usize = 1_500_000;
const DEFAULT_REMOTE_TEXT_MAX_BYTES: usize = 512_000;

fn retry_delay_secs(attempt: i64, base_delay_secs: i64) -> i64 {
    let exponent = attempt.saturating_sub(1).clamp(0, 8) as u32;
    base_delay_secs
        .max(1)
        .saturating_mul(2_i64.saturating_pow(exponent))
}

fn image_mime_for_path(path: &str) -> Option<&'static str> {
    let lower = path.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return Some("image/jpeg");
    }
    if lower.ends_with(".png") {
        return Some("image/png");
    }
    if lower.ends_with(".gif") {
        return Some("image/gif");
    }
    if lower.ends_with(".bmp") {
        return Some("image/bmp");
    }
    if lower.ends_with(".webp") {
        return Some("image/webp");
    }
    if lower.ends_with(".svg") {
        return Some("image/svg+xml");
    }
    None
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;
    while index + 3 <= bytes.len() {
        let chunk = ((bytes[index] as u32) << 16)
            | ((bytes[index + 1] as u32) << 8)
            | bytes[index + 2] as u32;
        output.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        output.push(TABLE[((chunk >> 6) & 0x3f) as usize] as char);
        output.push(TABLE[(chunk & 0x3f) as usize] as char);
        index += 3;
    }

    let remaining = bytes.len().saturating_sub(index);
    if remaining == 1 {
        let chunk = (bytes[index] as u32) << 16;
        output.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        output.push('=');
        output.push('=');
    } else if remaining == 2 {
        let chunk = ((bytes[index] as u32) << 16) | ((bytes[index + 1] as u32) << 8);
        output.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        output.push(TABLE[((chunk >> 6) & 0x3f) as usize] as char);
        output.push('=');
    }

    output
}

fn system_time_to_millis(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn u64_to_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn unix_now() -> i64 {
    system_time_to_millis(SystemTime::now())
}
