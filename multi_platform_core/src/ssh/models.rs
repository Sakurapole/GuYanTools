use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

// ============================================================
// Profile data structures
// ============================================================

/// Jump host configuration embedded in an SSH profile.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshJumpHost {
    pub host: String,
    pub port: u32,
    pub username: String,
    /// Auth type: 'password' | 'privateKey' | 'agent'
    pub auth_type: String,
    /// Reference to another profile id used as jump host (optional)
    pub profile_id: Option<String>,
    pub host_ca_key_path: Option<String>,
}

/// Persisted SSH connection profile record.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    /// Auth type: 'password' | 'privateKey' | 'agent'
    pub auth_type: String,
    /// Whether the password/passphrase is persisted encrypted
    pub save_password: bool,
    pub private_key_path: Option<String>,
    pub certificate_path: Option<String>,
    pub host_ca_key_path: Option<String>,
    /// Serialized jump host JSON (optional)
    pub jump_host_json: Option<String>,
    pub auto_reconnect: bool,
    pub folder_id: Option<String>,
    pub sort_order: i64,
    pub color: Option<String>,
    /// Serialized tags JSON array string (optional)
    pub tags: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Input for creating an SSH profile.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSshProfileInput {
    pub label: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub auth_type: String,
    pub save_password: bool,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub certificate_path: Option<String>,
    pub host_ca_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub jump_host_json: Option<String>,
    pub auto_reconnect: bool,
    pub folder_id: Option<String>,
    pub color: Option<String>,
    pub tags: Option<String>,
}

/// Input for updating an SSH profile.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSshProfileInput {
    pub id: String,
    pub label: Option<String>,
    pub host: Option<String>,
    pub port: Option<u32>,
    pub username: Option<String>,
    pub auth_type: Option<String>,
    pub save_password: Option<bool>,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub certificate_path: Option<String>,
    pub host_ca_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub jump_host_json: Option<String>,
    pub auto_reconnect: Option<bool>,
    pub folder_id: Option<String>,
    pub sort_order: Option<i64>,
    pub color: Option<String>,
    pub tags: Option<String>,
}

/// Folder/group for saved SSH profiles.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshProfileFolder {
    pub id: String,
    pub label: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub created_at: i64,
}

/// Input for creating an SSH profile folder.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSshProfileFolderInput {
    pub label: String,
    pub parent_id: Option<String>,
}

/// Input for updating an SSH profile folder.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSshProfileFolderInput {
    pub id: String,
    pub label: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

// ============================================================
// Session data structures
// ============================================================

/// Descriptor of an active SSH session.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshSessionDescriptor {
    pub session_id: String,
    pub profile_id: String,
    pub profile_label: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub status: String,
    pub via_jump_host: bool,
}

/// Input for connecting via SSH (runtime only, not persisted).
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSshInput {
    pub profile_id: String,
    /// Password for this connection attempt (if not using saved credential)
    pub password: Option<String>,
    pub rows: u32,
    pub cols: u32,
}

/// Input for resizing an SSH session terminal.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResizeSshSessionInput {
    pub session_id: String,
    pub rows: u32,
    pub cols: u32,
}

// ============================================================
// Known host data structures
// ============================================================

/// Known host fingerprint record.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKnownHost {
    pub id: String,
    pub host: String,
    pub port: u32,
    pub algorithm: String,
    pub fingerprint: String,
    pub trust_mode: String,
    pub added_at: i64,
}

/// Result of verifying a host fingerprint.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostVerifyResult {
    /// 'trusted' | 'unknown' | 'mismatch'
    pub status: String,
    /// Stored fingerprint if mismatch
    pub stored_fingerprint: Option<String>,
}

/// Input for trusting a host fingerprint.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrustHostInput {
    pub host: String,
    pub port: u32,
    pub algorithm: String,
    pub fingerprint: String,
    /// 'permanent' | 'session'
    pub trust_mode: String,
}

// ============================================================
// SSH Agent
// ============================================================

/// SSH agent key identity.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshAgentIdentity {
    pub fingerprint: String,
    pub comment: String,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshManagedKey {
    pub id: String,
    pub label: String,
    pub algorithm: String,
    pub source: String,
    pub comment: Option<String>,
    pub fingerprint: String,
    pub public_key: String,
    pub is_encrypted: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSshManagedKeyInput {
    pub label: String,
    pub algorithm: String,
    pub comment: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportSshManagedKeyInput {
    pub label: Option<String>,
    pub private_key: Option<String>,
    pub file_path: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSshManagedKeyData {
    pub id: String,
    pub label: String,
    pub algorithm: String,
    pub fingerprint: String,
    pub comment: Option<String>,
    pub public_key: String,
    pub private_key: String,
    pub suggested_private_key_name: String,
    pub suggested_public_key_name: String,
}

// ============================================================
// Event envelope
// ============================================================

/// SSH event envelope sent to the JS event bus.
/// Session IDs are prefixed with "ssh-" to distinguish from local terminal sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshEventEnvelope {
    pub event_type: String,
    pub session_id: String,
    pub data: Option<String>,
    pub status: Option<String>,
    pub message: Option<String>,
    pub exit_code: Option<u32>,
}

// ============================================================
// Port forwarding data structures
// ============================================================

/// Persisted port forwarding rule.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshPortForward {
    pub id: String,
    pub profile_id: String,
    pub label: Option<String>,
    /// 'local' | 'remote' | 'dynamic'
    pub forward_type: String,
    pub local_host: String,
    pub local_port: u32,
    pub remote_host: Option<String>,
    pub remote_port: Option<u32>,
    pub auto_start: bool,
    pub enabled: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Input for creating a port forwarding rule.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreatePortForwardInput {
    pub profile_id: String,
    pub label: Option<String>,
    pub forward_type: String,
    pub local_host: Option<String>,
    pub local_port: u32,
    pub remote_host: Option<String>,
    pub remote_port: Option<u32>,
    pub auto_start: bool,
}

/// Input for updating a port forwarding rule.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePortForwardInput {
    pub id: String,
    pub label: Option<String>,
    pub forward_type: Option<String>,
    pub local_host: Option<String>,
    pub local_port: Option<u32>,
    pub remote_host: Option<String>,
    pub remote_port: Option<u32>,
    pub auto_start: Option<bool>,
    pub enabled: Option<bool>,
}

/// Runtime status of a single port forward.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardStatus {
    pub forward_id: String,
    pub session_id: String,
    /// 'running' | 'stopped' | 'error'
    pub status: String,
    pub active_connections: u32,
    pub error_message: Option<String>,
}

/// Real-time traffic statistics for a single port forward.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardTrafficInfo {
    pub forward_id: String,
    pub session_id: String,
    /// Bytes sent from local to remote (upload)
    pub bytes_sent: i64,
    /// Bytes received from remote to local (download)
    pub bytes_received: i64,
    pub active_connections: u32,
}

/// Exported port forwarding data (for import/export).
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPortForwardData {
    pub version: u32,
    pub profile_label: String,
    pub profile_host: String,
    pub rules: Vec<ExportPortForwardRule>,
}

/// A single exported port forwarding rule.
#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPortForwardRule {
    pub label: Option<String>,
    pub forward_type: String,
    pub local_host: String,
    pub local_port: u32,
    pub remote_host: Option<String>,
    pub remote_port: Option<u32>,
    pub auto_start: bool,
}
