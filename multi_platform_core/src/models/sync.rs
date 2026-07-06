use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProfile {
    pub profile_id: String,
    pub profile_name: String,
    pub owner_device_id: String,
    pub schema_version: i64,
    pub app_version: String,
    pub payload_hash: String,
    pub is_local: bool,
    pub is_active: bool,
    pub is_default: bool,
    pub payload_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub conflict_id: String,
    pub collection: String,
    pub object_id: String,
    pub title: String,
    pub local_payload_json: String,
    pub remote_payload_json: String,
    pub base_payload_json: Option<String>,
    pub local_updated_at: i64,
    pub remote_updated_at: i64,
    pub status: String,
    pub created_at: i64,
    pub resolved_at: Option<i64>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncObjectState {
    pub collection: String,
    pub object_id: String,
    pub owner_device_id: String,
    pub schema_version: i64,
    pub base_rev: Option<String>,
    pub local_rev: Option<String>,
    pub remote_rev: Option<String>,
    pub payload_hash: String,
    pub dirty: bool,
    pub deleted: bool,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutboxItem {
    pub op_id: String,
    pub collection: String,
    pub object_id: String,
    pub op_kind: String,
    pub base_rev: Option<String>,
    pub payload_json: String,
    pub payload_hash: String,
    pub status: String,
    pub retry_count: i64,
    pub last_error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}
