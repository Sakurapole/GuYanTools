use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct PluginJob {
    pub id: String,
    pub plugin_id: String,
    pub parent_job_id: Option<String>,
    pub kind: String,
    pub status: String,
    pub progress: f64,
    pub current_step: Option<String>,
    pub input_json: String,
    pub output_json: Option<String>,
    pub error_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreatePluginJobInput {
    pub id: String,
    pub plugin_id: String,
    pub parent_job_id: Option<String>,
    pub kind: String,
    pub input_json: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdatePluginJobInput {
    pub status: Option<String>,
    pub progress: Option<f64>,
    pub current_step: Option<String>,
    pub output_json: Option<String>,
    pub error_json: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct PluginInstallation {
    pub plugin_id: String,
    pub manifest_json: String,
    pub source_json: String,
    pub resolved_commit: Option<String>,
    pub package_sha256: Option<String>,
    pub approved_permissions_json: String,
    pub capabilities_json: String,
    pub current_path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpsertPluginInstallationInput {
    pub plugin_id: String,
    pub manifest_json: String,
    pub source_json: String,
    pub resolved_commit: Option<String>,
    pub package_sha256: Option<String>,
    pub approved_permissions_json: String,
    pub capabilities_json: String,
    pub current_path: String,
    pub previous_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct PluginFileGrant {
    pub id: String,
    pub plugin_id: String,
    pub purpose: String,
    pub root_path: String,
    pub access_mode: String,
    pub expires_at: String,
    pub max_bytes: i64,
    pub revoked: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreatePluginFileGrantInput {
    pub id: String,
    pub plugin_id: String,
    pub purpose: String,
    pub root_path: String,
    pub access_mode: String,
    pub expires_at: String,
    pub max_bytes: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct PluginMarketplaceCache {
    pub id: String,
    pub url: String,
    pub ref_name: String,
    pub catalog_json: String,
    pub catalog_sha256: String,
    pub enabled: bool,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpsertPluginMarketplaceInput {
    pub id: String,
    pub url: String,
    pub ref_name: String,
    pub catalog_json: String,
    pub catalog_sha256: String,
    pub enabled: bool,
}
