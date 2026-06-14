use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpProfile {
    pub id: String,
    pub label: String,
    pub protocol: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub auth_type: String,
    pub save_password: bool,
    pub private_key_path: Option<String>,
    pub certificate_path: Option<String>,
    pub host_ca_key_path: Option<String>,
    pub ssh_profile_id: Option<String>,
    pub folder_id: Option<String>,
    pub sort_order: i64,
    pub default_remote_path: String,
    pub default_local_path: String,
    pub max_concurrent: u32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpSessionFolder {
    pub id: String,
    pub label: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub created_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateFtpProfileInput {
    pub label: String,
    pub protocol: String,
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
    pub ssh_profile_id: Option<String>,
    pub folder_id: Option<String>,
    pub default_remote_path: Option<String>,
    pub default_local_path: Option<String>,
    pub max_concurrent: Option<u32>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFtpProfileInput {
    pub id: String,
    pub label: Option<String>,
    pub protocol: Option<String>,
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
    pub ssh_profile_id: Option<String>,
    pub folder_id: Option<String>,
    pub default_remote_path: Option<String>,
    pub default_local_path: Option<String>,
    pub max_concurrent: Option<u32>,
    pub sort_order: Option<i64>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectFtpInput {
    pub profile_id: String,
    pub password: Option<String>,
    pub auth_session_id: Option<String>,
    pub challenge_responses: Option<Vec<String>>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpAuthPrompt {
    pub prompt: String,
    pub echo: bool,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpAuthChallenge {
    pub auth_session_id: String,
    pub profile_id: String,
    pub profile_label: String,
    pub username: String,
    pub name: Option<String>,
    pub instructions: Option<String>,
    pub prompts: Vec<FtpAuthPrompt>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateFtpSessionFolderInput {
    pub label: String,
    pub parent_id: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFtpSessionFolderInput {
    pub id: String,
    pub label: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: Option<i64>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpRetryPolicy {
    pub max_retries: i64,
    pub base_delay_secs: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpConnectionDescriptor {
    pub session_id: String,
    pub profile_id: String,
    pub profile_label: String,
    pub protocol: String,
    pub host: String,
    pub port: u32,
    pub username: String,
    pub status: String,
    pub remote_root: String,
    pub local_root: String,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTransferEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: i64,
    pub modified_at: Option<i64>,
    pub permissions: Option<String>,
    pub owner: Option<String>,
    pub source: String,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferOptions {
    pub method: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferTask {
    pub id: String,
    pub session_id: String,
    pub profile_id: String,
    pub retry_count: i64,
    pub priority: String,
    pub direction: String,
    pub local_path: String,
    pub remote_path: String,
    pub file_name: String,
    pub file_size: i64,
    pub transferred_size: i64,
    pub progress: f64,
    pub speed_bytes_per_sec: f64,
    pub transfer_method: String,
    pub transfer_tree_json: Option<String>,
    pub current_relative_path: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpRestoreState {
    pub id: String,
    pub session_id: String,
    pub tab_order: i64,
    pub remote_path: String,
    pub local_path: String,
    pub panel_layout_json: Option<String>,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertFtpRestoreStateInput {
    pub session_id: String,
    pub tab_order: i64,
    pub remote_path: String,
    pub local_path: String,
    pub panel_layout_json: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpScheduledTask {
    pub id: String,
    pub label: String,
    pub profile_id: String,
    pub direction: String,
    pub local_path: String,
    pub remote_path: String,
    pub schedule_type: String,
    pub conflict_policy: Option<String>,
    pub enabled: bool,
    pub include_subdirectories: bool,
    pub once_at: Option<i64>,
    pub interval_hours: Option<i64>,
    pub time_of_day: Option<String>,
    pub day_of_week: Option<i64>,
    pub cron_expression: Option<String>,
    pub next_run_at: Option<i64>,
    pub last_run_at: Option<i64>,
    pub last_status: Option<String>,
    pub last_result: Option<String>,
    pub last_task_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpsertFtpScheduledTaskInput {
    pub id: Option<String>,
    pub label: String,
    pub profile_id: String,
    pub direction: String,
    pub local_path: String,
    pub remote_path: String,
    pub schedule_type: String,
    pub conflict_policy: Option<String>,
    pub enabled: Option<bool>,
    pub include_subdirectories: Option<bool>,
    pub once_at: Option<i64>,
    pub interval_hours: Option<i64>,
    pub time_of_day: Option<String>,
    pub day_of_week: Option<i64>,
    pub cron_expression: Option<String>,
    pub next_run_at: Option<i64>,
    pub last_run_at: Option<i64>,
    pub last_status: Option<String>,
    pub last_result: Option<String>,
    pub last_task_id: Option<String>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpFilterPreset {
    pub id: String,
    pub label: String,
    pub rules_json: String,
    pub is_builtin: bool,
    pub created_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpsertFtpFilterPresetInput {
    pub id: Option<String>,
    pub label: String,
    pub rules_json: String,
    pub is_builtin: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FtpEventEnvelope {
    pub event_type: String,
    pub session: Option<FtpConnectionDescriptor>,
    pub task: Option<TransferTask>,
    pub message: Option<String>,
}
