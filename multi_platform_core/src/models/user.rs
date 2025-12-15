use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

/// 用户模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct User {
    pub id: i64,
    pub name: String,
    pub email: Option<String>,
    pub avatar: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建用户的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserInput {
    pub name: String,
    pub email: Option<String>,
    pub avatar: Option<String>,
}

/// 更新用户的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserInput {
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar: Option<String>,
}
