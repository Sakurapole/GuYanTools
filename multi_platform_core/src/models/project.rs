use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

/// 项目模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建项目的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub description: Option<String>,
    pub owner_id: i64,
}

/// 更新项目的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProjectInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
}
