// Flutter Rust Bridge 绑定
// 注意：需要运行 flutter_rust_bridge_codegen 来生成 Dart 绑定代码

use crate::db::Database;
use crate::models::*;
use crate::services::*;
use std::sync::{Arc, Mutex};

/// Flutter 数据库包装器
pub struct FlutterDatabase {
    inner: Arc<Mutex<Database>>,
}

impl FlutterDatabase {
    /// 创建新的数据库实例
    pub fn new(path: String) -> anyhow::Result<Self> {
        let db = Database::new(&path)?;
        Ok(FlutterDatabase {
            inner: Arc::new(Mutex::new(db)),
        })
    }

    /// 创建内存数据库
    pub fn new_in_memory() -> anyhow::Result<Self> {
        let db = Database::new_in_memory()?;
        Ok(FlutterDatabase {
            inner: Arc::new(Mutex::new(db)),
        })
    }
}

// ==================== 用户相关函数 ====================

/// 创建用户
pub fn create_user(
    db_path: String,
    name: String,
    email: Option<String>,
    avatar: Option<String>,
) -> anyhow::Result<User> {
    let db = Database::new(&db_path)?;
    UserService::create(
        &db,
        CreateUserInput {
            name,
            email,
            avatar,
        },
    )
    .map_err(|e| anyhow::anyhow!("{}", e))
}

/// 根据 ID 获取用户
pub fn get_user(db_path: String, id: i64) -> anyhow::Result<User> {
    let db = Database::new(&db_path)?;
    UserService::get_by_id(&db, id).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 根据邮箱获取用户
pub fn get_user_by_email(db_path: String, email: String) -> anyhow::Result<User> {
    let db = Database::new(&db_path)?;
    UserService::get_by_email(&db, &email).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 列出用户
pub fn list_users(db_path: String, offset: i64, limit: i64) -> anyhow::Result<Vec<User>> {
    let db = Database::new(&db_path)?;
    UserService::list(&db, offset, limit).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 更新用户
pub fn update_user(
    db_path: String,
    id: i64,
    name: Option<String>,
    email: Option<String>,
    avatar: Option<String>,
) -> anyhow::Result<User> {
    let db = Database::new(&db_path)?;
    UserService::update(
        &db,
        id,
        UpdateUserInput {
            name,
            email,
            avatar,
        },
    )
    .map_err(|e| anyhow::anyhow!("{}", e))
}

/// 删除用户
pub fn delete_user(db_path: String, id: i64) -> anyhow::Result<()> {
    let db = Database::new(&db_path)?;
    UserService::delete(&db, id).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 统计用户总数
pub fn count_users(db_path: String) -> anyhow::Result<i64> {
    let db = Database::new(&db_path)?;
    UserService::count(&db).map_err(|e| anyhow::anyhow!("{}", e))
}

// ==================== 项目相关函数 ====================

/// 创建项目
pub fn create_project(
    db_path: String,
    name: String,
    description: Option<String>,
    owner_id: i64,
) -> anyhow::Result<Project> {
    let db = Database::new(&db_path)?;
    ProjectService::create(
        &db,
        CreateProjectInput {
            name,
            description,
            owner_id,
        },
    )
    .map_err(|e| anyhow::anyhow!("{}", e))
}

/// 根据 ID 获取项目
pub fn get_project(db_path: String, id: i64) -> anyhow::Result<Project> {
    let db = Database::new(&db_path)?;
    ProjectService::get_by_id(&db, id).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 列出项目
pub fn list_projects(db_path: String, offset: i64, limit: i64) -> anyhow::Result<Vec<Project>> {
    let db = Database::new(&db_path)?;
    ProjectService::list(&db, offset, limit).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 根据所有者列出项目
pub fn list_projects_by_owner(
    db_path: String,
    owner_id: i64,
    offset: i64,
    limit: i64,
) -> anyhow::Result<Vec<Project>> {
    let db = Database::new(&db_path)?;
    ProjectService::list_by_owner(&db, owner_id, offset, limit)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

/// 更新项目
pub fn update_project(
    db_path: String,
    id: i64,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
) -> anyhow::Result<Project> {
    let db = Database::new(&db_path)?;
    ProjectService::update(
        &db,
        id,
        UpdateProjectInput {
            name,
            description,
            status,
        },
    )
    .map_err(|e| anyhow::anyhow!("{}", e))
}

/// 删除项目
pub fn delete_project(db_path: String, id: i64) -> anyhow::Result<()> {
    let db = Database::new(&db_path)?;
    ProjectService::delete(&db, id).map_err(|e| anyhow::anyhow!("{}", e))
}

// ==================== 设置相关函数 ====================

/// 获取设置
pub fn get_setting(db_path: String, key: String) -> anyhow::Result<Setting> {
    let db = Database::new(&db_path)?;
    SettingService::get(&db, &key).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 获取设置值
pub fn get_setting_value(db_path: String, key: String) -> anyhow::Result<String> {
    let db = Database::new(&db_path)?;
    SettingService::get_value(&db, &key).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 列出所有设置
pub fn list_settings(db_path: String) -> anyhow::Result<Vec<Setting>> {
    let db = Database::new(&db_path)?;
    SettingService::list(&db).map_err(|e| anyhow::anyhow!("{}", e))
}

/// 创建或更新设置
pub fn upsert_setting(
    db_path: String,
    key: String,
    value: String,
    description: Option<String>,
) -> anyhow::Result<Setting> {
    let db = Database::new(&db_path)?;
    SettingService::upsert(
        &db,
        UpsertSettingInput {
            key,
            value,
            description,
        },
    )
    .map_err(|e| anyhow::anyhow!("{}", e))
}

/// 删除设置
pub fn delete_setting(db_path: String, key: String) -> anyhow::Result<()> {
    let db = Database::new(&db_path)?;
    SettingService::delete(&db, &key).map_err(|e| anyhow::anyhow!("{}", e))
}
