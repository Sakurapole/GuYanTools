use crate::db::Database;
use crate::models::*;
use crate::services::*;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;

/// Node.js 数据库包装器
#[napi(js_name = "JsDatabase")]
pub struct JsDatabase {
    inner: Arc<Database>,
}

#[napi]
impl JsDatabase {
    /// 创建新的数据库实例
    #[napi(constructor)]
    pub fn new(path: String) -> napi::Result<Self> {
        let db = Database::new(&path)
            .map_err(|e| Error::from_reason(format!("创建数据库失败: {}", e)))?;
        Ok(JsDatabase {
            inner: Arc::new(db),
        })
    }

    /// 创建内存数据库（用于测试）
    #[napi(factory)]
    pub fn new_in_memory() -> Result<Self> {
        let db = Database::new_in_memory()
            .map_err(|e| Error::from_reason(format!("创建内存数据库失败: {}", e)))?;
        Ok(JsDatabase {
            inner: Arc::new(db),
        })
    }

    // ==================== 用户相关方法 ====================

    /// 创建用户
    #[napi]
    pub async fn create_user(
        &self,
        name: String,
        email: Option<String>,
        avatar: Option<String>,
    ) -> Result<User> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            UserService::create(
                &db,
                CreateUserInput {
                    name,
                    email,
                    avatar,
                },
            )
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("创建用户失败: {}", e)))
    }

    /// 根据 ID 获取用户
    #[napi]
    pub async fn get_user(&self, id: i64) -> Result<User> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || UserService::get_by_id(&db, id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取用户失败: {}", e)))
    }

    /// 根据邮箱获取用户
    #[napi]
    pub async fn get_user_by_email(&self, email: String) -> Result<User> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || UserService::get_by_email(&db, &email))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取用户失败: {}", e)))
    }

    /// 列出用户
    #[napi]
    pub async fn list_users(&self, offset: i64, limit: i64) -> Result<Vec<User>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || UserService::list(&db, offset, limit))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("列出用户失败: {}", e)))
    }

    /// 更新用户
    #[napi]
    pub async fn update_user(
        &self,
        id: i64,
        name: Option<String>,
        email: Option<String>,
        avatar: Option<String>,
    ) -> Result<User> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            UserService::update(
                &db,
                id,
                UpdateUserInput {
                    name,
                    email,
                    avatar,
                },
            )
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新用户失败: {}", e)))
    }

    /// 删除用户
    #[napi]
    pub async fn delete_user(&self, id: i64) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || UserService::delete(&db, id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除用户失败: {}", e)))
    }

    /// 统计用户总数
    #[napi]
    pub async fn count_users(&self) -> Result<i64> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || UserService::count(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("统计用户失败: {}", e)))
    }

    // ==================== 项目相关方法 ====================

    /// 创建项目
    #[napi]
    pub async fn create_project(
        &self,
        name: String,
        description: Option<String>,
        owner_id: i64,
    ) -> Result<Project> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            ProjectService::create(
                &db,
                CreateProjectInput {
                    name,
                    description,
                    owner_id,
                },
            )
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("创建项目失败: {}", e)))
    }

    /// 根据 ID 获取项目
    #[napi]
    pub async fn get_project(&self, id: i64) -> Result<Project> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || ProjectService::get_by_id(&db, id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取项目失败: {}", e)))
    }

    /// 列出项目
    #[napi]
    pub async fn list_projects(&self, offset: i64, limit: i64) -> Result<Vec<Project>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || ProjectService::list(&db, offset, limit))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("列出项目失败: {}", e)))
    }

    /// 根据所有者列出项目
    #[napi]
    pub async fn list_projects_by_owner(
        &self,
        owner_id: i64,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<Project>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            ProjectService::list_by_owner(&db, owner_id, offset, limit)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("列出项目失败: {}", e)))
    }

    /// 更新项目
    #[napi]
    pub async fn update_project(
        &self,
        id: i64,
        name: Option<String>,
        description: Option<String>,
        status: Option<String>,
    ) -> Result<Project> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            ProjectService::update(
                &db,
                id,
                UpdateProjectInput {
                    name,
                    description,
                    status,
                },
            )
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新项目失败: {}", e)))
    }

    /// 删除项目
    #[napi]
    pub async fn delete_project(&self, id: i64) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || ProjectService::delete(&db, id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除项目失败: {}", e)))
    }

    // ==================== 设置相关方法 ====================

    /// 获取设置
    #[napi]
    pub async fn get_setting(&self, key: String) -> Result<Setting> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || SettingService::get(&db, &key))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取设置失败: {}", e)))
    }

    /// 获取设置值
    #[napi]
    pub async fn get_setting_value(&self, key: String) -> Result<String> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || SettingService::get_value(&db, &key))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取设置值失败: {}", e)))
    }

    /// 列出所有设置
    #[napi]
    pub async fn list_settings(&self) -> Result<Vec<Setting>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || SettingService::list(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("列出设置失败: {}", e)))
    }

    /// 创建或更新设置
    #[napi]
    pub async fn upsert_setting(
        &self,
        key: String,
        value: String,
        description: Option<String>,
    ) -> Result<Setting> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            SettingService::upsert(
                &db,
                UpsertSettingInput {
                    key,
                    value,
                    description,
                },
            )
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新设置失败: {}", e)))
    }

    /// 删除设置
    #[napi]
    pub async fn delete_setting(&self, key: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || SettingService::delete(&db, &key))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除设置失败: {}", e)))
    }
}
