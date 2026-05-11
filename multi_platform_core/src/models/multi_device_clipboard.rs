use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiDeviceClipboardDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub public_key: Option<String>,
    pub trusted: bool,
    pub is_self: bool,
    pub last_address: Option<String>,
    pub last_port: Option<u32>,
    pub last_seen_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpsertMultiDeviceClipboardDeviceInput {
    pub id: String,
    pub name: String,
    pub platform: Option<String>,
    pub public_key: Option<String>,
    pub trusted: Option<bool>,
    pub is_self: Option<bool>,
    pub last_address: Option<String>,
    pub last_port: Option<u32>,
    pub last_seen_at: Option<i64>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiDeviceClipboardItem {
    pub id: String,
    pub source_device_id: String,
    pub source_device_name: String,
    pub content_type: String,
    pub mime_type: Option<String>,
    pub text: Option<String>,
    pub file_name: Option<String>,
    pub asset_path: Option<String>,
    pub preview_path: Option<String>,
    pub byte_size: i64,
    pub content_hash: String,
    pub tags_json: String,
    pub local_only: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpsertMultiDeviceClipboardItemInput {
    pub id: String,
    pub source_device_id: String,
    pub source_device_name: String,
    pub content_type: String,
    pub mime_type: Option<String>,
    pub text: Option<String>,
    pub file_name: Option<String>,
    pub asset_path: Option<String>,
    pub preview_path: Option<String>,
    pub byte_size: Option<i64>,
    pub content_hash: String,
    pub tags_json: Option<String>,
    pub local_only: Option<bool>,
    pub created_at: Option<i64>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MultiDeviceClipboardDiscoveryConfig {
    pub device_id: String,
    pub device_name: String,
    pub port: u32,
    pub platform: Option<String>,
    pub preferred_address: Option<String>,
    pub probe_local_addresses: Vec<String>,
    pub http_probe_enabled: Option<bool>,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiDeviceClipboardDiscoveredDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub address: String,
    pub port: u32,
    pub service_name: String,
    pub last_seen_at: i64,
}

#[cfg_attr(feature = "napi", napi(object))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiDeviceClipboardDeviceStatus {
    pub device_id: String,
    pub name: String,
    pub platform: String,
    pub trusted: bool,
    pub is_self: bool,
    pub state: String,
    pub online: bool,
    pub last_address: Option<String>,
    pub last_port: Option<u32>,
    pub last_seen_at: Option<i64>,
    pub seconds_since_seen: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum MultiDeviceClipboardEvent {
    DeviceFound {
        device: MultiDeviceClipboardDiscoveredDevice,
    },
    DeviceLost {
        service_name: String,
    },
}
