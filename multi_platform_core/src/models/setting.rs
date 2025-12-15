use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

/// 设置模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct Setting {
    pub id: i64,
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建/更新设置的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertSettingInput {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
}
