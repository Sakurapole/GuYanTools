use crate::db::Database;
use crate::models::*;
use crate::multi_device_clipboard::*;
use crate::services::*;
use crate::terminal::*;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction};
use napi_derive::napi;
use rusqlite::OptionalExtension;
use std::sync::Arc;

/// 模块初始化：在 Windows 上将控制台输出编码设为 UTF-8（代码页 65001），
/// 避免 Rust println! 输出中文时出现乱码。
#[napi::module_init]
fn init() {
    #[cfg(target_os = "windows")]
    unsafe {
        extern "system" {
            fn SetConsoleOutputCP(wCodePageID: u32) -> i32;
        }
        SetConsoleOutputCP(65001);
    }
}

#[napi(js_name = "JsTerminalHost")]
pub struct JsTerminalHost {
    inner: Arc<TerminalSessionManager>,
}

#[napi]
impl JsTerminalHost {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(TerminalSessionManager::new()),
        }
    }

    #[napi(js_name = "listProfiles")]
    pub fn list_profiles(&self) -> Vec<TerminalProfile> {
        self.inner.list_profiles()
    }

    #[napi(js_name = "listSessions")]
    pub fn list_sessions(&self) -> Result<Vec<TerminalSessionDescriptor>> {
        self.inner
            .list_sessions()
            .map_err(|e| Error::from_reason(format!("获取终端会话列表失败: {}", e)))
    }

    #[napi(js_name = "createSession")]
    pub fn create_session(
        &self,
        input: CreateTerminalSessionInput,
    ) -> Result<TerminalSessionDescriptor> {
        self.inner
            .create_session(input)
            .map_err(|e| Error::from_reason(format!("创建终端会话失败: {}", e)))
    }

    #[napi]
    pub fn write(&self, session_id: String, data: String) -> Result<()> {
        self.inner
            .write(&session_id, &data)
            .map_err(|e| Error::from_reason(format!("写入终端失败: {}", e)))
    }

    #[napi(js_name = "resizeSession")]
    pub fn resize_session(&self, input: ResizeTerminalSessionInput) -> Result<()> {
        self.inner
            .resize_session(input)
            .map_err(|e| Error::from_reason(format!("调整终端尺寸失败: {}", e)))
    }

    #[napi(js_name = "killSession")]
    pub fn kill_session(&self, session_id: String) -> Result<()> {
        self.inner
            .kill_session(&session_id)
            .map_err(|e| Error::from_reason(format!("关闭终端会话失败: {}", e)))
    }

    #[napi(js_name = "attachSession")]
    pub fn attach_session(&self, session_id: String, target: String) -> Result<()> {
        self.inner
            .attach_session(&session_id, &target)
            .map_err(|e| Error::from_reason(format!("附着终端会话失败: {}", e)))
    }

    #[napi(js_name = "closeDetachedView")]
    pub fn close_detached_view(&self, session_id: String, target: String) -> Result<()> {
        self.inner
            .close_detached_view(&session_id, &target)
            .map_err(|e| Error::from_reason(format!("关闭终端独立视图失败: {}", e)))
    }

    #[napi(js_name = "registerEventSink")]
    pub fn register_event_sink(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
                Ok(vec![ctx.value])
            })?;

        self.inner
            .register_event_sink(tsfn)
            .map_err(|e| Error::from_reason(format!("注册终端事件回调失败: {}", e)))
    }
}

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

    // ==================== 首页布局相关方法 ====================

    #[napi(js_name = "listHomeWorkspaces")]
    pub async fn list_home_workspaces(&self) -> Result<Vec<HomeWorkspace>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::list_workspaces(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("列出首页配置文件失败: {}", e)))
    }

    #[napi(js_name = "createHomeWorkspace")]
    pub async fn create_home_workspace(&self, name: String) -> Result<HomeWorkspace> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::create_workspace(&db, name))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建首页配置文件失败: {}", e)))
    }

    #[napi(js_name = "renameHomeWorkspace")]
    pub async fn rename_home_workspace(&self, key: String, name: String) -> Result<HomeWorkspace> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::rename_workspace(&db, &key, name))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("重命名首页配置文件失败: {}", e)))
    }

    #[napi(js_name = "deleteHomeWorkspace")]
    pub async fn delete_home_workspace(&self, key: String) -> Result<String> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::delete_workspace(&db, &key))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除首页配置文件失败: {}", e)))
    }

    #[napi(js_name = "getActiveHomeWorkspaceKey")]
    pub async fn get_active_home_workspace_key(&self) -> Result<String> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::get_active_workspace_key(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取当前首页配置文件失败: {}", e)))
    }

    #[napi(js_name = "setActiveHomeWorkspaceKey")]
    pub async fn set_active_home_workspace_key(&self, key: String) -> Result<HomeWorkspace> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::set_active_workspace_key(&db, &key))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("切换首页配置文件失败: {}", e)))
    }

    #[napi(js_name = "getHomeLayout")]
    pub async fn get_home_layout(&self, workspace_key: String) -> Result<HomeLayout> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            HomeLayoutService::get_layout_by_workspace_key(&db, &workspace_key)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取首页布局失败: {}", e)))
    }

    #[napi(js_name = "createHomeCategory")]
    pub async fn create_home_category(
        &self,
        input: CreateHomeCategoryInput,
    ) -> Result<HomeCategory> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::create_category(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建首页分类失败: {}", e)))
    }

    #[napi(js_name = "updateHomeCategory")]
    pub async fn update_home_category(
        &self,
        category_id: String,
        input: UpdateHomeCategoryInput,
    ) -> Result<HomeCategory> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            HomeLayoutService::update_category(&db, &category_id, input)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新首页分类失败: {}", e)))
    }

    #[napi(js_name = "deleteHomeCategory")]
    pub async fn delete_home_category(&self, category_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::delete_category(&db, &category_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除首页分类失败: {}", e)))
    }

    #[napi(js_name = "createHomeWidget")]
    pub async fn create_home_widget(&self, input: CreateHomeWidgetInput) -> Result<HomeWidget> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::create_widget(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建首页卡片失败: {}", e)))
    }

    #[napi(js_name = "updateHomeWidget")]
    pub async fn update_home_widget(
        &self,
        widget_id: String,
        input: UpdateHomeWidgetInput,
    ) -> Result<HomeWidget> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            HomeLayoutService::update_widget(&db, &widget_id, input)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新首页卡片失败: {}", e)))
    }

    #[napi(js_name = "deleteHomeWidget")]
    pub async fn delete_home_widget(&self, widget_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || HomeLayoutService::delete_widget(&db, &widget_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除首页卡片失败: {}", e)))
    }

    #[napi(js_name = "importHomeLayout")]
    pub async fn import_home_layout(
        &self,
        workspace_key: String,
        input: ImportHomeLayoutInput,
    ) -> Result<HomeLayout> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            HomeLayoutService::import_layout(&db, &workspace_key, input)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("导入首页布局失败: {}", e)))
    }

    // ==================== 知识库相关方法 ====================

    #[napi(js_name = "listKnowledgeLibraries")]
    pub async fn list_knowledge_libraries(&self) -> Result<Vec<KnowledgeLibrary>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_libraries(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库列表失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgeLibrary")]
    pub async fn create_knowledge_library(
        &self,
        input: CreateKnowledgeLibraryInput,
    ) -> Result<KnowledgeLibrary> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_library(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeSpaces")]
    pub async fn list_knowledge_spaces(
        &self,
        library_id: Option<String>,
    ) -> Result<Vec<KnowledgeSpace>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_spaces(&db, library_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库空间失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgeSpace")]
    pub async fn create_knowledge_space(
        &self,
        input: CreateKnowledgeSpaceInput,
    ) -> Result<KnowledgeSpace> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_space(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库空间失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeTree")]
    pub async fn list_knowledge_tree(
        &self,
        input: Option<ListKnowledgeTreeInput>,
    ) -> Result<Vec<KnowledgeNode>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_tree(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库树失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgeFolder")]
    pub async fn create_knowledge_folder(
        &self,
        input: CreateKnowledgeFolderInput,
    ) -> Result<KnowledgeNode> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_folder(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库文件夹失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgePage")]
    pub async fn create_knowledge_page(
        &self,
        input: CreateKnowledgePageInput,
    ) -> Result<KnowledgePageDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_page(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库页面失败: {}", e)))
    }

    #[napi(js_name = "getKnowledgePage")]
    pub async fn get_knowledge_page(&self, page_id: String) -> Result<KnowledgePageDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::get_page(&db, &page_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库页面失败: {}", e)))
    }

    #[napi(js_name = "updateKnowledgePage")]
    pub async fn update_knowledge_page(
        &self,
        page_id: String,
        input: UpdateKnowledgePageInput,
    ) -> Result<KnowledgePageDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::update_page(&db, &page_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新知识库页面失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeQuickNotes")]
    pub async fn list_knowledge_quick_notes(
        &self,
        input: Option<ListKnowledgeQuickNotesInput>,
    ) -> Result<Vec<KnowledgeQuickNoteDetail>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_quick_notes(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库速记失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgeQuickNote")]
    pub async fn create_knowledge_quick_note(
        &self,
        input: CreateKnowledgeQuickNoteInput,
    ) -> Result<KnowledgeQuickNoteDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_quick_note(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库速记失败: {}", e)))
    }

    #[napi(js_name = "updateKnowledgeQuickNote")]
    pub async fn update_knowledge_quick_note(
        &self,
        note_id: String,
        input: UpdateKnowledgeQuickNoteInput,
    ) -> Result<KnowledgeQuickNoteDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            KnowledgeService::update_quick_note(&db, &note_id, input)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新知识库速记失败: {}", e)))
    }

    #[napi(js_name = "archiveKnowledgeQuickNote")]
    pub async fn archive_knowledge_quick_note(
        &self,
        note_id: String,
    ) -> Result<KnowledgeQuickNoteDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::archive_quick_note(&db, &note_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("归档知识库速记失败: {}", e)))
    }

    #[napi(js_name = "convertKnowledgeQuickNoteToPage")]
    pub async fn convert_knowledge_quick_note_to_page(
        &self,
        note_id: String,
        input: ConvertKnowledgeQuickNoteToPageInput,
    ) -> Result<KnowledgePageDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            KnowledgeService::convert_quick_note_to_page(&db, &note_id, input)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("速记转页面失败: {}", e)))
    }

    #[napi(js_name = "linkKnowledgeQuickNoteTodo")]
    pub async fn link_knowledge_quick_note_todo(
        &self,
        note_id: String,
        todo_id: String,
    ) -> Result<KnowledgeQuickNoteDetail> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            KnowledgeService::link_quick_note_todo(&db, &note_id, &todo_id)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("关联速记和 Todo 失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgeAsset")]
    pub async fn create_knowledge_asset(
        &self,
        input: CreateKnowledgeAssetInput,
    ) -> Result<KnowledgeAsset> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_asset(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库资产失败: {}", e)))
    }

    #[napi(js_name = "getKnowledgeAsset")]
    pub async fn get_knowledge_asset(&self, asset_id: String) -> Result<KnowledgeAsset> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::get_asset_by_id(&db, &asset_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库资产失败: {}", e)))
    }

    #[napi(js_name = "importKnowledgeDocument")]
    pub async fn import_knowledge_document(
        &self,
        input: ImportKnowledgeDocumentInput,
    ) -> Result<ImportKnowledgeDocumentResult> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::import_document(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("导入知识库文档失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeIndexJobs")]
    pub async fn list_knowledge_index_jobs(
        &self,
        input: Option<ListKnowledgeIndexJobsInput>,
    ) -> Result<Vec<KnowledgeIndexJob>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_index_jobs(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库索引任务失败: {}", e)))
    }

    #[napi(js_name = "getKnowledgeIndexJob")]
    pub async fn get_knowledge_index_job(&self, job_id: String) -> Result<KnowledgeIndexJob> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::get_index_job_by_id(&db, &job_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库索引任务失败: {}", e)))
    }

    #[napi(js_name = "cancelKnowledgeIndexJob")]
    pub async fn cancel_knowledge_index_job(&self, job_id: String) -> Result<KnowledgeIndexJob> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::cancel_index_job(&db, &job_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("取消知识库索引任务失败: {}", e)))
    }

    #[napi(js_name = "searchKnowledge")]
    pub async fn search_knowledge(
        &self,
        input: KnowledgeSearchInput,
    ) -> Result<Vec<KnowledgeSearchResult>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::search_knowledge(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("搜索知识库失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeTags")]
    pub async fn list_knowledge_tags(
        &self,
        input: Option<ListKnowledgeTagsInput>,
    ) -> Result<Vec<KnowledgeTag>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_tags(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库标签失败: {}", e)))
    }

    #[napi(js_name = "createKnowledgeTag")]
    pub async fn create_knowledge_tag(
        &self,
        input: CreateKnowledgeTagInput,
    ) -> Result<KnowledgeTag> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::create_tag(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建知识库标签失败: {}", e)))
    }

    #[napi(js_name = "updateKnowledgeTag")]
    pub async fn update_knowledge_tag(
        &self,
        tag_id: String,
        input: UpdateKnowledgeTagInput,
    ) -> Result<KnowledgeTag> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::update_tag(&db, &tag_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新知识库标签失败: {}", e)))
    }

    #[napi(js_name = "bindKnowledgeTag")]
    pub async fn bind_knowledge_tag(&self, input: BindKnowledgeTagInput) -> Result<KnowledgeTag> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::bind_tag(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("绑定知识库标签失败: {}", e)))
    }

    #[napi(js_name = "unbindKnowledgeTag")]
    pub async fn unbind_knowledge_tag(&self, input: UnbindKnowledgeTagInput) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::unbind_tag(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("解绑知识库标签失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeTagTargets")]
    pub async fn list_knowledge_tag_targets(
        &self,
        input: ListKnowledgeTagTargetsInput,
    ) -> Result<Vec<KnowledgeTaggedTarget>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_tag_targets(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库标签目标失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgePageLinks")]
    pub async fn list_knowledge_page_links(&self, page_id: String) -> Result<Vec<KnowledgeLink>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_page_links(&db, &page_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库页面链接失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeBacklinks")]
    pub async fn list_knowledge_backlinks(
        &self,
        page_id: String,
    ) -> Result<Vec<KnowledgeBacklink>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_backlinks(&db, &page_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库反链失败: {}", e)))
    }

    #[napi(js_name = "linkKnowledgeTodoSource")]
    pub async fn link_knowledge_todo_source(&self, input: LinkKnowledgeTodoInput) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::link_todo_source(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("关联知识库 Todo 来源失败: {}", e)))
    }

    #[napi(js_name = "getKnowledgeGraph")]
    pub async fn get_knowledge_graph(&self, input: KnowledgeGraphInput) -> Result<KnowledgeGraph> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::get_graph(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库关系图失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeOrphanPages")]
    pub async fn list_knowledge_orphan_pages(
        &self,
        input: Option<ListKnowledgeOrphanPagesInput>,
    ) -> Result<Vec<KnowledgeNode>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_orphan_pages(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库孤立页面失败: {}", e)))
    }

    #[napi(js_name = "moveKnowledgeNode")]
    pub async fn move_knowledge_node(
        &self,
        node_id: String,
        input: MoveKnowledgeNodeInput,
    ) -> Result<KnowledgeNode> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::move_node(&db, &node_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("移动知识库节点失败: {}", e)))
    }

    #[napi(js_name = "updateKnowledgeNode")]
    pub async fn update_knowledge_node(
        &self,
        node_id: String,
        input: UpdateKnowledgeNodeInput,
    ) -> Result<KnowledgeNode> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::update_node(&db, &node_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新知识库节点失败: {}", e)))
    }

    #[napi(js_name = "archiveKnowledgeNode")]
    pub async fn archive_knowledge_node(&self, node_id: String) -> Result<KnowledgeNode> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::archive_node(&db, &node_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("归档知识库节点失败: {}", e)))
    }

    #[napi(js_name = "toggleKnowledgeFavorite")]
    pub async fn toggle_knowledge_favorite(
        &self,
        node_id: String,
        favorite: bool,
    ) -> Result<KnowledgeNode> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            KnowledgeService::toggle_favorite(&db, &node_id, favorite)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新知识库收藏状态失败: {}", e)))
    }

    #[napi(js_name = "deleteKnowledgeNode")]
    pub async fn delete_knowledge_node(&self, node_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::delete_node(&db, &node_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除知识库节点失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeAiChunks")]
    pub async fn list_knowledge_ai_chunks(
        &self,
        input: Option<ListKnowledgeAiChunksInput>,
    ) -> Result<Vec<KnowledgeAiChunk>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_ai_chunks(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库 AI 分块失败: {}", e)))
    }

    #[napi(js_name = "upsertKnowledgeEmbedding")]
    pub async fn upsert_knowledge_embedding(
        &self,
        input: UpsertKnowledgeEmbeddingInput,
    ) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::upsert_embedding(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("写入知识库 embedding 失败: {}", e)))
    }

    #[napi(js_name = "deleteKnowledgeEmbeddings")]
    pub async fn delete_knowledge_embeddings(
        &self,
        provider: String,
        model: String,
    ) -> Result<i64> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            KnowledgeService::delete_embeddings(&db, &provider, &model)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("删除知识库 embedding 失败: {}", e)))
    }

    #[napi(js_name = "listKnowledgeEmbeddingCandidates")]
    pub async fn list_knowledge_embedding_candidates(
        &self,
        input: ListKnowledgeEmbeddingCandidatesInput,
    ) -> Result<Vec<KnowledgeEmbeddingCandidate>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || KnowledgeService::list_embedding_candidates(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取知识库 embedding 候选失败: {}", e)))
    }

    #[napi(js_name = "getKnowledgeEmbeddingStats")]
    pub async fn get_knowledge_embedding_stats(
        &self,
        provider: String,
        model: String,
    ) -> Result<KnowledgeEmbeddingStats> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            KnowledgeService::embedding_stats(&db, &provider, &model)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取知识库 embedding 统计失败: {}", e)))
    }

    // ==================== AI Chat 相关方法 ====================

    #[napi(js_name = "createAiConversation")]
    pub async fn create_ai_conversation(
        &self,
        input: CreateAiConversationInput,
    ) -> Result<AiConversation> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::create_conversation(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建 AI 会话失败: {}", e)))
    }

    #[napi(js_name = "listAiConversations")]
    pub async fn list_ai_conversations(&self) -> Result<Vec<AiConversation>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::list_conversations(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取 AI 会话列表失败: {}", e)))
    }

    #[napi(js_name = "updateAiConversation")]
    pub async fn update_ai_conversation(
        &self,
        id: String,
        input: UpdateAiConversationInput,
    ) -> Result<AiConversation> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::update_conversation(&db, &id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新 AI 会话失败: {}", e)))
    }

    #[napi(js_name = "deleteAiConversation")]
    pub async fn delete_ai_conversation(&self, id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::delete_conversation(&db, &id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除 AI 会话失败: {}", e)))
    }

    #[napi(js_name = "listAiMessages")]
    pub async fn list_ai_messages(&self, conversation_id: String) -> Result<Vec<AiChatMessage>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::list_messages(&db, &conversation_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取 AI 消息失败: {}", e)))
    }

    #[napi(js_name = "insertAiMessage")]
    pub async fn insert_ai_message(&self, input: CreateAiMessageInput) -> Result<AiChatMessage> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::insert_message(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("写入 AI 消息失败: {}", e)))
    }

    #[napi(js_name = "updateAiMessage")]
    pub async fn update_ai_message(
        &self,
        id: String,
        input: UpdateAiMessageInput,
    ) -> Result<AiChatMessage> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::update_message(&db, &id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新 AI 消息失败: {}", e)))
    }

    #[napi(js_name = "insertAiCitation")]
    pub async fn insert_ai_citation(&self, input: CreateAiCitationInput) -> Result<AiCitation> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::insert_citation(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("写入 AI 引用失败: {}", e)))
    }

    #[napi(js_name = "listAiCitations")]
    pub async fn list_ai_citations(&self, message_id: String) -> Result<Vec<AiCitation>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::list_citations(&db, &message_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取 AI 引用失败: {}", e)))
    }

    #[napi(js_name = "listAiCanvasWorkspaces")]
    pub async fn list_ai_canvas_workspaces(
        &self,
        conversation_id: String,
    ) -> Result<Vec<AiCanvasWorkspace>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            AiService::list_canvas_workspaces(&db, &conversation_id)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取 AI Canvas 工作区失败: {}", e)))
    }

    #[napi(js_name = "createAiCanvasWorkspace")]
    pub async fn create_ai_canvas_workspace(
        &self,
        input: CreateAiCanvasWorkspaceInput,
    ) -> Result<AiCanvasWorkspace> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::create_canvas_workspace(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建 AI Canvas 工作区失败: {}", e)))
    }

    #[napi(js_name = "updateAiCanvasWorkspace")]
    pub async fn update_ai_canvas_workspace(
        &self,
        id: String,
        input: UpdateAiCanvasWorkspaceInput,
    ) -> Result<AiCanvasWorkspace> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::update_canvas_workspace(&db, &id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新 AI Canvas 工作区失败: {}", e)))
    }

    #[napi(js_name = "deleteAiCanvasWorkspace")]
    pub async fn delete_ai_canvas_workspace(&self, id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::delete_canvas_workspace(&db, &id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除 AI Canvas 工作区失败: {}", e)))
    }

    #[napi(js_name = "listAiCanvasFiles")]
    pub async fn list_ai_canvas_files(&self, workspace_id: String) -> Result<Vec<AiCanvasFile>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::list_canvas_files(&db, &workspace_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取 AI Canvas 文件失败: {}", e)))
    }

    #[napi(js_name = "upsertAiCanvasFile")]
    pub async fn upsert_ai_canvas_file(
        &self,
        input: UpsertAiCanvasFileInput,
    ) -> Result<AiCanvasFile> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::upsert_canvas_file(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("保存 AI Canvas 文件失败: {}", e)))
    }

    #[napi(js_name = "deleteAiCanvasFile")]
    pub async fn delete_ai_canvas_file(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            AiService::delete_canvas_file(&db, &workspace_id, &path)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("删除 AI Canvas 文件失败: {}", e)))
    }

    #[napi(js_name = "listAiCanvasVersions")]
    pub async fn list_ai_canvas_versions(
        &self,
        workspace_id: String,
    ) -> Result<Vec<AiCanvasVersion>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::list_canvas_versions(&db, &workspace_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取 AI Canvas 版本失败: {}", e)))
    }

    #[napi(js_name = "createAiCanvasVersion")]
    pub async fn create_ai_canvas_version(
        &self,
        input: CreateAiCanvasVersionInput,
    ) -> Result<AiCanvasVersion> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::create_canvas_version(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建 AI Canvas 版本失败: {}", e)))
    }

    #[napi(js_name = "listAiCanvasOperations")]
    pub async fn list_ai_canvas_operations(
        &self,
        workspace_id: String,
    ) -> Result<Vec<AiCanvasOperation>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            AiService::list_canvas_operations(&db, &workspace_id)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取 AI Canvas 操作失败: {}", e)))
    }

    #[napi(js_name = "createAiCanvasOperation")]
    pub async fn create_ai_canvas_operation(
        &self,
        input: CreateAiCanvasOperationInput,
    ) -> Result<AiCanvasOperation> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || AiService::create_canvas_operation(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建 AI Canvas 操作失败: {}", e)))
    }

    // ==================== Todo 相关方法 ====================

    #[napi(js_name = "createTodoList")]
    pub async fn create_todo_list(&self, input: CreateTodoListInput) -> Result<TodoList> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::create_list(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建Todo列表失败: {}", e)))
    }

    #[napi(js_name = "updateTodoList")]
    pub async fn update_todo_list(
        &self,
        list_id: String,
        input: UpdateTodoListInput,
    ) -> Result<TodoList> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::update_list(&db, &list_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新Todo列表失败: {}", e)))
    }

    #[napi(js_name = "deleteTodoList")]
    pub async fn delete_todo_list(&self, list_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::delete_list(&db, &list_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除Todo列表失败: {}", e)))
    }

    #[napi(js_name = "getAllTodoLists")]
    pub async fn get_all_todo_lists(&self) -> Result<Vec<TodoList>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_all_lists(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取Todo列表失败: {}", e)))
    }

    #[napi(js_name = "reorderTodoLists")]
    pub async fn reorder_todo_lists(&self, ids: Vec<String>) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::reorder_lists(&db, ids))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("排序Todo列表失败: {}", e)))
    }

    #[napi(js_name = "createTodo")]
    pub async fn create_todo(&self, input: CreateTodoInput) -> Result<Todo> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::create_todo(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建Todo失败: {}", e)))
    }

    #[napi(js_name = "updateTodo")]
    pub async fn update_todo(&self, todo_id: String, input: UpdateTodoInput) -> Result<Todo> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::update_todo(&db, &todo_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新Todo失败: {}", e)))
    }

    #[napi(js_name = "deleteTodo")]
    pub async fn delete_todo(&self, todo_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::delete_todo(&db, &todo_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除Todo失败: {}", e)))
    }

    #[napi(js_name = "completeTodo")]
    pub async fn complete_todo(&self, todo_id: String) -> Result<CompleteTodoResult> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::complete_todo(&db, &todo_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("完成Todo失败: {}", e)))
    }

    #[napi(js_name = "uncompleteTodo")]
    pub async fn uncomplete_todo(&self, todo_id: String) -> Result<Todo> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::uncomplete_todo(&db, &todo_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("取消完成Todo失败: {}", e)))
    }

    #[napi(js_name = "getTodosByList")]
    pub async fn get_todos_by_list(
        &self,
        list_id: String,
        include_completed: bool,
    ) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            TodoService::get_todos_by_list(&db, &list_id, include_completed)
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取列表Todo失败: {}", e)))
    }

    #[napi(js_name = "searchTodos")]
    pub async fn search_todos(&self, query: String) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::search_todos(&db, &query))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("搜索Todo失败: {}", e)))
    }

    #[napi(js_name = "moveTodo")]
    pub async fn move_todo(&self, todo_id: String, target_list_id: String) -> Result<Todo> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::move_todo(&db, &todo_id, &target_list_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("移动Todo失败: {}", e)))
    }

    #[napi(js_name = "getMyDayTodos")]
    pub async fn get_my_day_todos(&self, date: String) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_my_day_todos(&db, &date))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取我的一天失败: {}", e)))
    }

    #[napi(js_name = "getImportantTodos")]
    pub async fn get_important_todos(&self) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_important_todos(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取重要Todo失败: {}", e)))
    }

    #[napi(js_name = "getPlannedTodos")]
    pub async fn get_planned_todos(&self) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_planned_todos(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取已计划Todo失败: {}", e)))
    }

    #[napi(js_name = "getAllTodos")]
    pub async fn get_all_todos(&self) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_all_todos(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取全部Todo失败: {}", e)))
    }

    #[napi(js_name = "getCompletedTodos")]
    pub async fn get_completed_todos(&self) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_completed_todos(&db))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取已完成Todo失败: {}", e)))
    }

    #[napi(js_name = "addTodoToMyDay")]
    pub async fn add_todo_to_my_day(&self, todo_id: String, date: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::add_to_my_day(&db, &todo_id, &date))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("添加到我的一天失败: {}", e)))
    }

    #[napi(js_name = "removeTodoFromMyDay")]
    pub async fn remove_todo_from_my_day(&self, todo_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::remove_from_my_day(&db, &todo_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("移除我的一天失败: {}", e)))
    }

    #[napi(js_name = "getYesterdayIncompleteTodos")]
    pub async fn get_yesterday_incomplete_todos(&self, today: String) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_yesterday_incomplete(&db, &today))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取昨日未完成失败: {}", e)))
    }

    #[napi(js_name = "getMyDaySuggestions")]
    pub async fn get_my_day_suggestions(&self, today: String) -> Result<Vec<Todo>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_my_day_suggestions(&db, &today))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取建议任务失败: {}", e)))
    }

    #[napi(js_name = "createTodoStep")]
    pub async fn create_todo_step(&self, input: CreateTodoStepInput) -> Result<TodoStep> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::create_step(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建步骤失败: {}", e)))
    }

    #[napi(js_name = "updateTodoStep")]
    pub async fn update_todo_step(
        &self,
        step_id: String,
        input: UpdateTodoStepInput,
    ) -> Result<TodoStep> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::update_step(&db, &step_id, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("更新步骤失败: {}", e)))
    }

    #[napi(js_name = "deleteTodoStep")]
    pub async fn delete_todo_step(&self, step_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::delete_step(&db, &step_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除步骤失败: {}", e)))
    }

    #[napi(js_name = "reorderTodoSteps")]
    pub async fn reorder_todo_steps(&self, ids: Vec<String>) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::reorder_steps(&db, ids))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("排序步骤失败: {}", e)))
    }

    #[napi(js_name = "createTodoReminder")]
    pub async fn create_todo_reminder(
        &self,
        input: CreateTodoReminderInput,
    ) -> Result<TodoReminder> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::create_reminder(&db, input))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("创建提醒失败: {}", e)))
    }

    #[napi(js_name = "deleteTodoReminder")]
    pub async fn delete_todo_reminder(&self, reminder_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::delete_reminder(&db, &reminder_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("删除提醒失败: {}", e)))
    }

    #[napi(js_name = "getRemindersByTodo")]
    pub async fn get_reminders_by_todo(&self, todo_id: String) -> Result<Vec<TodoReminder>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_reminders_by_todo(&db, &todo_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取提醒失败: {}", e)))
    }

    #[napi(js_name = "getPendingReminders")]
    pub async fn get_pending_reminders(&self, now: String) -> Result<Vec<TodoReminder>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::get_pending_reminders(&db, &now))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("获取待发提醒失败: {}", e)))
    }

    #[napi(js_name = "markReminderSent")]
    pub async fn mark_reminder_sent(&self, reminder_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || TodoService::mark_reminder_sent(&db, &reminder_id))
            .await
            .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
            .map_err(|e| Error::from_reason(format!("标记提醒已发送失败: {}", e)))
    }

    // ==================== 首页工作区背景方法 ====================

    #[napi(js_name = "getHomeWorkspaceBackground")]
    pub async fn get_home_workspace_background(
        &self,
        workspace_key: String,
    ) -> Result<Option<String>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            db.with_connection(|conn| {
                let result: rusqlite::Result<Option<(Option<String>, Option<String>)>> = conn.query_row(
                    "SELECT header_background, sidebar_background FROM home_workspaces WHERE key = ?1",
                    rusqlite::params![workspace_key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                ).optional();
                match result.map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))? {
                    Some((header, sidebar)) => {
                        let obj = serde_json::json!({
                            "header": header,
                            "sidebar": sidebar,
                        });
                        Ok(Some(obj.to_string()))
                    }
                    None => Ok(None),
                }
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取首页工作区背景失败: {}", e)))
    }

    #[napi(js_name = "updateHomeWorkspaceBackground")]
    pub async fn update_home_workspace_background(
        &self,
        workspace_key: String,
        header_background: Option<String>,
        sidebar_background: Option<String>,
    ) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            db.with_connection(|conn| {
                conn.execute(
                    "UPDATE home_workspaces SET header_background = ?1, sidebar_background = ?2, updated_at = datetime('now') WHERE key = ?3",
                    rusqlite::params![header_background, sidebar_background, workspace_key],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("更新首页工作区背景失败: {}", e)))
    }

    // ==================== 插件注册表方法 ====================

    #[napi(js_name = "listInstalledPlugins")]
    pub async fn list_installed_plugins(&self) -> Result<Vec<String>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            db.with_connection(|conn| {
                let mut stmt = conn.prepare(
                    "SELECT manifest, enabled, status, install_source, resolved_entry_path, package_name, local_path, error, installed_at, updated_at FROM plugins ORDER BY updated_at DESC"
                ).map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                let rows = stmt.query_map([], |row| {
                    let manifest: String = row.get(0)?;
                    let enabled: i64 = row.get(1)?;
                    let status: String = row.get(2)?;
                    let install_source: String = row.get(3)?;
                    let resolved_entry_path: String = row.get(4)?;
                    let package_name: Option<String> = row.get(5)?;
                    let local_path: Option<String> = row.get(6)?;
                    let error: Option<String> = row.get(7)?;
                    let installed_at: String = row.get(8)?;
                    let updated_at: String = row.get(9)?;
                    let obj = serde_json::json!({
                        "manifest": serde_json::from_str::<serde_json::Value>(&manifest).unwrap_or(serde_json::Value::Null),
                        "enabled": enabled != 0,
                        "status": status,
                        "installSource": serde_json::from_str::<serde_json::Value>(&install_source).unwrap_or(serde_json::Value::Null),
                        "resolvedEntryPath": resolved_entry_path,
                        "packageName": package_name,
                        "localPath": local_path,
                        "error": error,
                        "installedAt": installed_at,
                        "updatedAt": updated_at,
                    });
                    Ok(obj.to_string())
                }).map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(rows)
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("列出插件失败: {}", e)))
    }

    #[napi(js_name = "upsertPlugin")]
    pub async fn upsert_plugin(&self, record_json: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let v: serde_json::Value = serde_json::from_str(&record_json)
                .map_err(|e| crate::db::DbError::QueryFailed(format!("解析插件记录失败: {}", e)))?;
            let plugin_id = v["manifest"]["id"].as_str().unwrap_or("").to_string();
            let manifest_str = v["manifest"].to_string();
            let enabled = v["enabled"].as_bool().unwrap_or(false) as i64;
            let status = v["status"].as_str().unwrap_or("discovered").to_string();
            let install_source_str = v["installSource"].to_string();
            let resolved_entry_path = v["resolvedEntryPath"].as_str().unwrap_or("").to_string();
            let package_name: Option<String> = v["packageName"].as_str().map(|s| s.to_string());
            let local_path: Option<String> = v["localPath"].as_str().map(|s| s.to_string());
            let error: Option<String> = v["error"].as_str().map(|s| s.to_string());
            let installed_at = v["installedAt"].as_str().unwrap_or("").to_string();

            db.with_connection(|conn| {
                conn.execute(
                    "INSERT INTO plugins (id, manifest, enabled, status, install_source, resolved_entry_path, package_name, local_path, error, installed_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
                     ON CONFLICT(id) DO UPDATE SET
                         manifest = excluded.manifest,
                         enabled = excluded.enabled,
                         status = excluded.status,
                         install_source = excluded.install_source,
                         resolved_entry_path = excluded.resolved_entry_path,
                         package_name = excluded.package_name,
                         local_path = excluded.local_path,
                         error = excluded.error,
                         updated_at = datetime('now')",
                    rusqlite::params![
                        plugin_id, manifest_str, enabled, status, install_source_str,
                        resolved_entry_path, package_name, local_path, error, installed_at
                    ],
                ).map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("保存插件记录失败: {}", e)))
    }

    #[napi(js_name = "removePlugin")]
    pub async fn remove_plugin(&self, plugin_id: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            db.with_connection(|conn| {
                conn.execute(
                    "DELETE FROM plugins WHERE id = ?1",
                    rusqlite::params![plugin_id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("删除插件记录失败: {}", e)))
    }

    // ==================== 插件 KV 存储方法 ====================

    #[napi(js_name = "getPluginStateValue")]
    pub async fn get_plugin_state_value(
        &self,
        plugin_id: String,
        key: String,
    ) -> Result<Option<String>> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let setting_key = format!("plugin.{}.{}", plugin_id, key);
            db.with_connection(|conn| {
                let result: rusqlite::Result<Option<String>> = conn
                    .query_row(
                        "SELECT value FROM settings WHERE key = ?1",
                        rusqlite::params![setting_key],
                        |row| row.get(0),
                    )
                    .optional();
                result.map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("获取插件状态失败: {}", e)))
    }

    #[napi(js_name = "setPluginStateValue")]
    pub async fn set_plugin_state_value(
        &self,
        plugin_id: String,
        key: String,
        value: String,
    ) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let setting_key = format!("plugin.{}.{}", plugin_id, key);
            db.with_connection(|conn| {
                conn.execute(
                    "INSERT INTO settings (key, value, description) VALUES (?1, ?2, ?3)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
                    rusqlite::params![setting_key, value, format!("Plugin state: {}", plugin_id)],
                ).map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("设置插件状态失败: {}", e)))
    }

    #[napi(js_name = "deletePluginStateValue")]
    pub async fn delete_plugin_state_value(&self, plugin_id: String, key: String) -> Result<()> {
        let db = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let setting_key = format!("plugin.{}.{}", plugin_id, key);
            db.with_connection(|conn| {
                conn.execute(
                    "DELETE FROM settings WHERE key = ?1",
                    rusqlite::params![setting_key],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
        })
        .await
        .map_err(|e| Error::from_reason(format!("任务执行失败: {}", e)))?
        .map_err(|e| Error::from_reason(format!("删除插件状态失败: {}", e)))
    }
}

// ============================================================
// Multi-device clipboard NAPI host
// ============================================================

#[napi(js_name = "JsMultiDeviceClipboardHost")]
pub struct JsMultiDeviceClipboardHost {
    inner: Arc<MultiDeviceClipboardManager>,
}

#[napi]
impl JsMultiDeviceClipboardHost {
    #[napi(constructor)]
    pub fn new(db: &JsDatabase) -> Self {
        Self {
            inner: Arc::new(MultiDeviceClipboardManager::new(db.inner.clone())),
        }
    }

    #[napi(js_name = "getOrCreateLocalDevice")]
    pub async fn get_or_create_local_device(
        &self,
        name: String,
    ) -> Result<MultiDeviceClipboardDevice> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.get_or_create_local_device(name))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("getOrCreateLocalDevice failed: {}", e)))
    }

    #[napi(js_name = "startDiscovery")]
    pub fn start_discovery(&self, config: MultiDeviceClipboardDiscoveryConfig) -> Result<()> {
        self.inner
            .start_discovery(config)
            .map_err(|e| Error::from_reason(format!("startDiscovery failed: {}", e)))
    }

    #[napi(js_name = "stopDiscovery")]
    pub fn stop_discovery(&self) {
        self.inner.stop_discovery();
    }

    #[napi(js_name = "listDiscoveredDevices")]
    pub fn list_discovered_devices(&self) -> Vec<MultiDeviceClipboardDiscoveredDevice> {
        self.inner.list_discovered_devices()
    }

    #[napi(js_name = "listDevices")]
    pub async fn list_devices(&self) -> Result<Vec<MultiDeviceClipboardDevice>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_devices())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listDevices failed: {}", e)))
    }

    #[napi(js_name = "listDeviceStatuses")]
    pub async fn list_device_statuses(
        &self,
        online_window_seconds: i64,
    ) -> Result<Vec<MultiDeviceClipboardDeviceStatus>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_device_statuses(online_window_seconds))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listDeviceStatuses failed: {}", e)))
    }

    #[napi(js_name = "upsertDevice")]
    pub async fn upsert_device(
        &self,
        input: UpsertMultiDeviceClipboardDeviceInput,
    ) -> Result<MultiDeviceClipboardDevice> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.upsert_device(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("upsertDevice failed: {}", e)))
    }

    #[napi(js_name = "setDeviceTrusted")]
    pub async fn set_device_trusted(
        &self,
        id: String,
        trusted: bool,
    ) -> Result<MultiDeviceClipboardDevice> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.set_device_trusted(id, trusted))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("setDeviceTrusted failed: {}", e)))
    }

    #[napi(js_name = "forgetDevice")]
    pub async fn forget_device(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.forget_device(id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("forgetDevice failed: {}", e)))
    }

    #[napi(js_name = "listItems")]
    pub async fn list_items(&self, limit: i64) -> Result<Vec<MultiDeviceClipboardItem>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_items(limit))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listItems failed: {}", e)))
    }

    #[napi(js_name = "getItem")]
    pub async fn get_item(&self, id: String) -> Result<MultiDeviceClipboardItem> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.get_item(id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("getItem failed: {}", e)))
    }

    #[napi(js_name = "upsertItem")]
    pub async fn upsert_item(
        &self,
        input: UpsertMultiDeviceClipboardItemInput,
    ) -> Result<MultiDeviceClipboardItem> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.upsert_item(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("upsertItem failed: {}", e)))
    }

    #[napi(js_name = "deleteItem")]
    pub async fn delete_item(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_item(id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteItem failed: {}", e)))
    }

    #[napi(js_name = "clearHistory")]
    pub async fn clear_history(&self) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.clear_history())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("clearHistory failed: {}", e)))
    }

    #[napi(js_name = "pruneHistory")]
    pub async fn prune_history(&self, history_limit: i64) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.prune_history(history_limit))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("pruneHistory failed: {}", e)))
    }

    #[napi(js_name = "computeContentHash")]
    pub fn compute_content_hash(&self, parts: Vec<String>) -> String {
        MultiDeviceClipboardManager::compute_content_hash(parts)
    }

    #[napi(js_name = "registerEventSink")]
    pub fn register_event_sink(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
                Ok(vec![ctx.value])
            })?;
        self.inner
            .register_event_sink(tsfn)
            .map_err(|e| Error::from_reason(format!("registerEventSink failed: {}", e)))
    }
}

// ============================================================
// SSH client NAPI host
// ============================================================

use crate::ftp::{
    ConnectFtpInput, CreateFtpProfileInput, CreateFtpSessionFolderInput, FileTransferEntry,
    FtpConnectionDescriptor, FtpManager, FtpProfile, FtpRestoreState, FtpRetryPolicy,
    FtpSessionFolder, TransferOptions, TransferTask, UpdateFtpProfileInput,
    UpdateFtpSessionFolderInput, UpsertFtpRestoreStateInput,
};
use crate::ssh::{
    ConnectSshInput, CreatePortForwardInput, CreateSshProfileFolderInput, CreateSshProfileInput,
    ExportSshManagedKeyData, GenerateSshManagedKeyInput, HostVerifyResult,
    ImportSshManagedKeyInput, PortForwardStatus, PortForwardTrafficInfo, ResizeSshSessionInput,
    SshAgentIdentity, SshConnectionManager, SshKnownHost, SshManagedKey, SshPortForward,
    SshProfile, SshProfileFolder, SshSessionDescriptor, TrustHostInput, UpdatePortForwardInput,
    UpdateSshProfileFolderInput, UpdateSshProfileInput,
};

/// NAPI wrapper for the SSH connection manager.
#[napi(js_name = "JsSshHost")]
pub struct JsSshHost {
    inner: Arc<SshConnectionManager>,
}

#[napi]
impl JsSshHost {
    /// Create a new SSH host backed by the provided database.
    #[napi(constructor)]
    pub fn new(db: &JsDatabase) -> Self {
        Self {
            inner: Arc::new(SshConnectionManager::new(db.inner.clone())),
        }
    }

    // ── Profile CRUD ──────────────────────────────────────────

    /// List all SSH profiles ordered by sort_order.
    #[napi(js_name = "listProfiles")]
    pub async fn list_profiles(&self) -> Result<Vec<SshProfile>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_profiles())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listSshProfiles failed: {}", e)))
    }

    /// List all SSH profile folders ordered by sort_order.
    #[napi(js_name = "listFolders")]
    pub async fn list_folders(&self) -> Result<Vec<SshProfileFolder>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_folders())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listSshProfileFolders failed: {}", e)))
    }

    /// Create a new SSH profile folder.
    #[napi(js_name = "createFolder")]
    pub async fn create_folder(
        &self,
        input: CreateSshProfileFolderInput,
    ) -> Result<SshProfileFolder> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.create_folder(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("createSshProfileFolder failed: {}", e)))
    }

    /// Update an existing SSH profile folder.
    #[napi(js_name = "updateFolder")]
    pub async fn update_folder(
        &self,
        input: UpdateSshProfileFolderInput,
    ) -> Result<SshProfileFolder> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.update_folder(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("updateSshProfileFolder failed: {}", e)))
    }

    /// Delete an SSH profile folder and move contained profiles to ungrouped.
    #[napi(js_name = "deleteFolder")]
    pub async fn delete_folder(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_folder(id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteSshProfileFolder failed: {}", e)))
    }

    /// Create a new SSH profile.
    #[napi(js_name = "createProfile")]
    pub async fn create_profile(&self, input: CreateSshProfileInput) -> Result<SshProfile> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.create_profile(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("createSshProfile failed: {}", e)))
    }

    /// Update an existing SSH profile.
    #[napi(js_name = "updateProfile")]
    pub async fn update_profile(&self, input: UpdateSshProfileInput) -> Result<SshProfile> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.update_profile(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("updateSshProfile failed: {}", e)))
    }

    /// Delete an SSH profile by ID (also terminates active sessions).
    #[napi(js_name = "deleteProfile")]
    pub async fn delete_profile(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_profile(&id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteSshProfile failed: {}", e)))
    }

    // ── Connection management ─────────────────────────────────

    /// List all active SSH sessions.
    #[napi(js_name = "listSessions")]
    pub fn list_sessions(&self) -> Result<Vec<SshSessionDescriptor>> {
        self.inner
            .list_sessions()
            .map_err(|e| Error::from_reason(format!("listSshSessions failed: {}", e)))
    }

    /// Connect to a remote host using the specified profile.
    #[napi(js_name = "connect")]
    pub async fn connect(&self, input: ConnectSshInput) -> Result<SshSessionDescriptor> {
        let manager = self.inner.clone();
        manager
            .connect(input)
            .await
            .map_err(|e| Error::from_reason(format!("connect failed: {}", e)))
    }

    /// Disconnect an active SSH session.
    #[napi(js_name = "disconnect")]
    pub fn disconnect(&self, session_id: String) -> Result<()> {
        self.inner
            .disconnect(&session_id)
            .map_err(|e| Error::from_reason(format!("disconnect failed: {}", e)))
    }

    // ── I/O ──────────────────────────────────────────────────

    /// Send data (stdin) to an active SSH session.
    #[napi]
    pub fn write(&self, session_id: String, data: String) -> Result<()> {
        self.inner
            .write(&session_id, &data)
            .map_err(|e| Error::from_reason(format!("ssh write failed: {}", e)))
    }

    /// Resize the PTY for an active SSH session.
    #[napi(js_name = "resizeSession")]
    pub fn resize_session(&self, input: ResizeSshSessionInput) -> Result<()> {
        self.inner
            .resize_session(input)
            .map_err(|e| Error::from_reason(format!("ssh resize failed: {}", e)))
    }

    // ── Known hosts ───────────────────────────────────────────

    /// List all stored known host fingerprints.
    #[napi(js_name = "listKnownHosts")]
    pub async fn list_known_hosts(&self) -> Result<Vec<SshKnownHost>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_known_hosts())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listKnownHosts failed: {}", e)))
    }

    /// Verify whether a host fingerprint is already trusted.
    #[napi(js_name = "verifyHostFingerprint")]
    pub async fn verify_host_fingerprint(
        &self,
        host: String,
        port: u32,
        algorithm: String,
        fingerprint: String,
    ) -> Result<HostVerifyResult> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            manager.verify_host_fingerprint(&host, port, &algorithm, &fingerprint)
        })
        .await
        .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
        .map_err(|e| Error::from_reason(format!("verifyHostFingerprint failed: {}", e)))
    }

    /// Trust a host fingerprint (permanent or session-only).
    #[napi(js_name = "trustHost")]
    pub async fn trust_host(&self, input: TrustHostInput) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.trust_host(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("trustHost failed: {}", e)))
    }

    /// Delete a known host fingerprint by ID.
    #[napi(js_name = "deleteKnownHost")]
    pub async fn delete_known_host(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_known_host(&id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteKnownHost failed: {}", e)))
    }

    // ── SSH Agent ─────────────────────────────────────────────

    /// List available identities from the system SSH agent.
    #[napi(js_name = "listAgentIdentities")]
    pub async fn list_agent_identities(&self) -> Result<Vec<SshAgentIdentity>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_agent_identities())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listAgentIdentities failed: {}", e)))
    }

    #[napi(js_name = "listManagedKeys")]
    pub async fn list_managed_keys(&self) -> Result<Vec<SshManagedKey>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_managed_keys())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listManagedKeys failed: {}", e)))
    }

    #[napi(js_name = "generateManagedKey")]
    pub async fn generate_managed_key(
        &self,
        input: GenerateSshManagedKeyInput,
    ) -> Result<SshManagedKey> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.generate_managed_key(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("generateManagedKey failed: {}", e)))
    }

    #[napi(js_name = "importManagedKey")]
    pub async fn import_managed_key(
        &self,
        input: ImportSshManagedKeyInput,
    ) -> Result<SshManagedKey> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.import_managed_key(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("importManagedKey failed: {}", e)))
    }

    #[napi(js_name = "exportManagedKey")]
    pub async fn export_managed_key(&self, id: String) -> Result<ExportSshManagedKeyData> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.export_managed_key(&id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("exportManagedKey failed: {}", e)))
    }

    #[napi(js_name = "deleteManagedKey")]
    pub async fn delete_managed_key(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_managed_key(&id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteManagedKey failed: {}", e)))
    }

    // ── Event sink ────────────────────────────────────────────

    /// Register the JS callback that receives SSH events.
    /// Events are forwarded in the same envelope format as terminal events,
    /// with session_id prefixed "ssh-" to allow client-side routing.
    #[napi(js_name = "registerEventSink")]
    pub fn register_event_sink(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
                Ok(vec![ctx.value])
            })?;
        self.inner
            .register_event_sink(tsfn)
            .map_err(|e| Error::from_reason(format!("registerSshEventSink failed: {}", e)))
    }

    // ── Port forwarding ──────────────────────────────────────

    /// List all port forward rules for a profile.
    #[napi(js_name = "listPortForwards")]
    pub async fn list_port_forwards(&self, profile_id: String) -> Result<Vec<SshPortForward>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_port_forwards(&profile_id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listPortForwards failed: {}", e)))
    }

    /// Create a new port forwarding rule.
    #[napi(js_name = "createPortForward")]
    pub async fn create_port_forward(
        &self,
        input: CreatePortForwardInput,
    ) -> Result<SshPortForward> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.create_port_forward(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("createPortForward failed: {}", e)))
    }

    /// Update an existing port forwarding rule.
    #[napi(js_name = "updatePortForward")]
    pub async fn update_port_forward(
        &self,
        input: UpdatePortForwardInput,
    ) -> Result<SshPortForward> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.update_port_forward(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("updatePortForward failed: {}", e)))
    }

    /// Delete a port forwarding rule.
    #[napi(js_name = "deletePortForward")]
    pub async fn delete_port_forward(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_port_forward(&id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deletePortForward failed: {}", e)))
    }

    /// Start a port forward on an active SSH session.
    #[napi(js_name = "startPortForward")]
    pub async fn start_port_forward(&self, session_id: String, forward_id: String) -> Result<()> {
        let manager = self.inner.clone();
        manager
            .start_port_forward(&session_id, &forward_id)
            .await
            .map_err(|e| Error::from_reason(format!("startPortForward failed: {}", e)))
    }

    /// Stop a running port forward on a session.
    #[napi(js_name = "stopPortForward")]
    pub async fn stop_port_forward(&self, session_id: String, forward_id: String) -> Result<()> {
        let manager = self.inner.clone();
        manager
            .stop_port_forward(&session_id, &forward_id)
            .await
            .map_err(|e| Error::from_reason(format!("stopPortForward failed: {}", e)))
    }

    /// Get runtime status of all active port forwards on a session.
    #[napi(js_name = "listForwardStatus")]
    pub fn list_forward_status(&self, session_id: String) -> Result<Vec<PortForwardStatus>> {
        self.inner
            .list_forward_status(&session_id)
            .map_err(|e| Error::from_reason(format!("listForwardStatus failed: {}", e)))
    }

    /// Get real-time traffic statistics for all active port forwards on a session.
    #[napi(js_name = "getForwardTraffic")]
    pub fn get_forward_traffic(&self, session_id: String) -> Result<Vec<PortForwardTrafficInfo>> {
        self.inner
            .get_forward_traffic(&session_id)
            .map_err(|e| Error::from_reason(format!("getForwardTraffic failed: {}", e)))
    }

    /// Export all port forward rules for a profile as a JSON string.
    #[napi(js_name = "exportPortForwards")]
    pub async fn export_port_forwards(&self, profile_id: String) -> Result<String> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.export_port_forwards(&profile_id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("exportPortForwards failed: {}", e)))
    }

    /// Import port forward rules from a JSON string into the specified profile.
    #[napi(js_name = "importPortForwards")]
    pub async fn import_port_forwards(&self, profile_id: String, json_data: String) -> Result<u32> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.import_port_forwards(&profile_id, &json_data))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("importPortForwards failed: {}", e)))
    }
}

#[napi(js_name = "JsFtpHost")]
pub struct JsFtpHost {
    inner: Arc<FtpManager>,
}

#[napi]
impl JsFtpHost {
    #[napi(constructor)]
    pub fn new(db: &JsDatabase) -> Self {
        Self {
            inner: Arc::new(FtpManager::new(db.inner.clone())),
        }
    }

    #[napi(js_name = "listProfiles")]
    pub async fn list_profiles(&self) -> Result<Vec<FtpProfile>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_profiles())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listFtpProfiles failed: {}", e)))
    }

    #[napi(js_name = "listFolders")]
    pub async fn list_folders(&self) -> Result<Vec<FtpSessionFolder>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_folders())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listFtpFolders failed: {}", e)))
    }

    #[napi(js_name = "createFolder")]
    pub async fn create_folder(
        &self,
        input: CreateFtpSessionFolderInput,
    ) -> Result<FtpSessionFolder> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.create_folder(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("createFtpFolder failed: {}", e)))
    }

    #[napi(js_name = "updateFolder")]
    pub async fn update_folder(
        &self,
        input: UpdateFtpSessionFolderInput,
    ) -> Result<FtpSessionFolder> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.update_folder(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("updateFtpFolder failed: {}", e)))
    }

    #[napi(js_name = "deleteFolder")]
    pub async fn delete_folder(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_folder(id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteFtpFolder failed: {}", e)))
    }

    #[napi(js_name = "createProfile")]
    pub async fn create_profile(&self, input: CreateFtpProfileInput) -> Result<FtpProfile> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.create_profile(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("createFtpProfile failed: {}", e)))
    }

    #[napi(js_name = "updateProfile")]
    pub async fn update_profile(&self, input: UpdateFtpProfileInput) -> Result<FtpProfile> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.update_profile(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("updateFtpProfile failed: {}", e)))
    }

    #[napi(js_name = "deleteProfile")]
    pub async fn delete_profile(&self, id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_profile(&id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteFtpProfile failed: {}", e)))
    }

    #[napi(js_name = "listSessions")]
    pub fn list_sessions(&self) -> Result<Vec<FtpConnectionDescriptor>> {
        self.inner
            .list_sessions()
            .map_err(|e| Error::from_reason(format!("listFtpSessions failed: {}", e)))
    }

    #[napi(js_name = "listRestoreStates")]
    pub async fn list_restore_states(&self) -> Result<Vec<FtpRestoreState>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_restore_states())
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listFtpRestoreStates failed: {}", e)))
    }

    #[napi(js_name = "upsertRestoreState")]
    pub async fn upsert_restore_state(
        &self,
        input: UpsertFtpRestoreStateInput,
    ) -> Result<FtpRestoreState> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.upsert_restore_state(input))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("upsertFtpRestoreState failed: {}", e)))
    }

    #[napi(js_name = "deleteRestoreState")]
    pub async fn delete_restore_state(&self, session_id: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_restore_state(&session_id))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteFtpRestoreState failed: {}", e)))
    }

    #[napi(js_name = "connect")]
    pub async fn connect(&self, input: ConnectFtpInput) -> Result<FtpConnectionDescriptor> {
        self.inner
            .connect(input)
            .await
            .map_err(|e| Error::from_reason(format!("connectFtp failed: {}", e)))
    }

    #[napi(js_name = "cancelAuthChallenge")]
    pub async fn cancel_auth_challenge(&self, auth_session_id: String) -> Result<()> {
        self.inner
            .cancel_auth_challenge(&auth_session_id)
            .await
            .map_err(|e| Error::from_reason(format!("cancelFtpAuthChallenge failed: {}", e)))
    }

    #[napi(js_name = "disconnect")]
    pub async fn disconnect(&self, session_id: String) -> Result<()> {
        self.inner
            .disconnect(&session_id)
            .await
            .map_err(|e| Error::from_reason(format!("disconnectFtp failed: {}", e)))
    }

    #[napi(js_name = "listRemoteDirectory")]
    pub async fn list_remote_directory(
        &self,
        session_id: String,
        path: String,
    ) -> Result<Vec<FileTransferEntry>> {
        self.inner
            .list_remote_directory(session_id, path)
            .await
            .map_err(|e| Error::from_reason(format!("listRemoteDirectory failed: {}", e)))
    }

    #[napi(js_name = "computeRemoteFileSha256")]
    pub async fn compute_remote_file_sha256(
        &self,
        session_id: String,
        path: String,
    ) -> Result<Option<String>> {
        self.inner
            .compute_remote_file_sha256(session_id, path)
            .await
            .map_err(|e| Error::from_reason(format!("computeRemoteFileSha256 failed: {}", e)))
    }

    #[napi(js_name = "loadRemoteImagePreview")]
    pub async fn load_remote_image_preview(
        &self,
        session_id: String,
        path: String,
        max_bytes: Option<u32>,
    ) -> Result<Option<String>> {
        self.inner
            .load_remote_image_preview(session_id, path, max_bytes)
            .await
            .map_err(|e| Error::from_reason(format!("loadRemoteImagePreview failed: {}", e)))
    }

    #[napi(js_name = "loadRemoteTextFile")]
    pub async fn load_remote_text_file(
        &self,
        session_id: String,
        path: String,
        max_bytes: Option<u32>,
    ) -> Result<String> {
        self.inner
            .load_remote_text_file(session_id, path, max_bytes)
            .await
            .map_err(|e| Error::from_reason(format!("loadRemoteTextFile failed: {}", e)))
    }

    #[napi(js_name = "saveRemoteTextFile")]
    pub async fn save_remote_text_file(
        &self,
        session_id: String,
        path: String,
        content: String,
    ) -> Result<()> {
        self.inner
            .save_remote_text_file(session_id, path, content)
            .await
            .map_err(|e| Error::from_reason(format!("saveRemoteTextFile failed: {}", e)))
    }

    #[napi(js_name = "exportRemotePathToLocal")]
    pub async fn export_remote_path_to_local(
        &self,
        session_id: String,
        remote_path: String,
        local_path: String,
    ) -> Result<()> {
        self.inner
            .export_remote_path_to_local(session_id, remote_path, local_path)
            .await
            .map_err(|e| Error::from_reason(format!("exportRemotePathToLocal failed: {}", e)))
    }

    #[napi(js_name = "createRemoteDir")]
    pub async fn create_remote_dir(&self, session_id: String, path: String) -> Result<()> {
        self.inner
            .create_remote_dir(session_id, path)
            .await
            .map_err(|e| Error::from_reason(format!("createRemoteDir failed: {}", e)))
    }

    #[napi(js_name = "renameRemotePath")]
    pub async fn rename_remote_path(
        &self,
        session_id: String,
        old_path: String,
        new_path: String,
    ) -> Result<()> {
        self.inner
            .rename_remote_path(session_id, old_path, new_path)
            .await
            .map_err(|e| Error::from_reason(format!("renameRemotePath failed: {}", e)))
    }

    #[napi(js_name = "deleteRemotePath")]
    pub async fn delete_remote_path(&self, session_id: String, path: String) -> Result<()> {
        self.inner
            .delete_remote_path(session_id, path)
            .await
            .map_err(|e| Error::from_reason(format!("deleteRemotePath failed: {}", e)))
    }

    #[napi(js_name = "chmodRemotePath")]
    pub async fn chmod_remote_path(
        &self,
        session_id: String,
        path: String,
        mode: String,
    ) -> Result<()> {
        self.inner
            .chmod_remote_path(session_id, path, mode)
            .await
            .map_err(|e| Error::from_reason(format!("chmodRemotePath failed: {}", e)))
    }

    #[napi(js_name = "listLocalDirectory")]
    pub async fn list_local_directory(&self, path: String) -> Result<Vec<FileTransferEntry>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.list_local_directory(path))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("listLocalDirectory failed: {}", e)))
    }

    #[napi(js_name = "computeLocalFileSha256")]
    pub async fn compute_local_file_sha256(&self, path: String) -> Result<Option<String>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.compute_local_file_sha256(path))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("computeLocalFileSha256 failed: {}", e)))
    }

    #[napi(js_name = "loadLocalImagePreview")]
    pub async fn load_local_image_preview(
        &self,
        path: String,
        max_bytes: Option<u32>,
    ) -> Result<Option<String>> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.load_local_image_preview(path, max_bytes))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("loadLocalImagePreview failed: {}", e)))
    }

    #[napi(js_name = "createLocalDir")]
    pub async fn create_local_dir(&self, path: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.create_local_dir(path))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("createLocalDir failed: {}", e)))
    }

    #[napi(js_name = "renameLocalPath")]
    pub async fn rename_local_path(&self, old_path: String, new_path: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.rename_local_path(old_path, new_path))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("renameLocalPath failed: {}", e)))
    }

    #[napi(js_name = "deleteLocalPath")]
    pub async fn delete_local_path(&self, path: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.delete_local_path(path))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("deleteLocalPath failed: {}", e)))
    }

    #[napi(js_name = "copyLocalPath")]
    pub async fn copy_local_path(&self, source_path: String, target_path: String) -> Result<()> {
        let manager = self.inner.clone();
        tokio::task::spawn_blocking(move || manager.copy_local_path(source_path, target_path))
            .await
            .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| Error::from_reason(format!("copyLocalPath failed: {}", e)))
    }

    #[napi(js_name = "getDefaultLocalPath")]
    pub fn get_default_local_path(&self) -> String {
        self.inner.get_default_local_path()
    }

    #[napi(js_name = "uploadFile")]
    pub async fn upload_file(
        &self,
        session_id: String,
        local_path: String,
        remote_path: String,
        options: Option<TransferOptions>,
    ) -> Result<TransferTask> {
        self.inner
            .upload_file(session_id, local_path, remote_path, options)
            .await
            .map_err(|e| Error::from_reason(format!("uploadFile failed: {}", e)))
    }

    #[napi(js_name = "downloadFile")]
    pub async fn download_file(
        &self,
        session_id: String,
        remote_path: String,
        local_path: String,
        options: Option<TransferOptions>,
    ) -> Result<TransferTask> {
        self.inner
            .download_file(session_id, remote_path, local_path, options)
            .await
            .map_err(|e| Error::from_reason(format!("downloadFile failed: {}", e)))
    }

    #[napi(js_name = "fxpTransfer")]
    pub async fn fxp_transfer(
        &self,
        source_session_id: String,
        source_path: String,
        target_session_id: String,
        target_path: String,
    ) -> Result<TransferTask> {
        self.inner
            .fxp_transfer(
                source_session_id,
                source_path,
                target_session_id,
                target_path,
            )
            .await
            .map_err(|e| Error::from_reason(format!("fxpTransfer failed: {}", e)))
    }

    #[napi(js_name = "listTransferTasks")]
    pub fn list_transfer_tasks(&self) -> Result<Vec<TransferTask>> {
        self.inner
            .list_transfer_tasks()
            .map_err(|e| Error::from_reason(format!("listTransferTasks failed: {}", e)))
    }

    #[napi(js_name = "getRetryPolicy")]
    pub fn get_retry_policy(&self) -> Result<FtpRetryPolicy> {
        self.inner
            .get_retry_policy()
            .map_err(|e| Error::from_reason(format!("getRetryPolicy failed: {}", e)))
    }

    #[napi(js_name = "updateRetryPolicy")]
    pub fn update_retry_policy(&self, input: FtpRetryPolicy) -> Result<FtpRetryPolicy> {
        self.inner
            .update_retry_policy(input)
            .map_err(|e| Error::from_reason(format!("updateRetryPolicy failed: {}", e)))
    }

    #[napi(js_name = "deleteTransferTask")]
    pub fn delete_transfer_task(&self, task_id: String) -> Result<()> {
        self.inner
            .delete_transfer_task(task_id)
            .map_err(|e| Error::from_reason(format!("deleteTransferTask failed: {}", e)))
    }

    #[napi(js_name = "updateTaskPriority")]
    pub fn update_task_priority(&self, task_id: String, priority: String) -> Result<TransferTask> {
        self.inner
            .update_task_priority(task_id, priority)
            .map_err(|e| Error::from_reason(format!("updateTaskPriority failed: {}", e)))
    }

    #[napi(js_name = "pauseTask")]
    pub fn pause_task(&self, task_id: String) -> Result<TransferTask> {
        self.inner
            .pause_task(task_id)
            .map_err(|e| Error::from_reason(format!("pauseTask failed: {}", e)))
    }

    #[napi(js_name = "resumeTask")]
    pub fn resume_task(&self, task_id: String) -> Result<TransferTask> {
        self.inner
            .resume_task(task_id)
            .map_err(|e| Error::from_reason(format!("resumeTask failed: {}", e)))
    }

    #[napi(js_name = "retryTask")]
    pub async fn retry_task(&self, task_id: String) -> Result<TransferTask> {
        self.inner
            .retry_task(task_id)
            .await
            .map_err(|e| Error::from_reason(format!("retryTask failed: {}", e)))
    }

    #[napi(js_name = "pauseAllTasks")]
    pub fn pause_all_tasks(&self) -> Result<Vec<TransferTask>> {
        self.inner
            .pause_all_tasks()
            .map_err(|e| Error::from_reason(format!("pauseAllTasks failed: {}", e)))
    }

    #[napi(js_name = "resumeAllTasks")]
    pub fn resume_all_tasks(&self) -> Result<Vec<TransferTask>> {
        self.inner
            .resume_all_tasks()
            .map_err(|e| Error::from_reason(format!("resumeAllTasks failed: {}", e)))
    }

    #[napi(js_name = "registerEventSink")]
    pub fn register_event_sink(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<String>| {
                Ok(vec![ctx.value])
            })?;
        self.inner
            .register_event_sink(tsfn)
            .map_err(|e| Error::from_reason(format!("registerFtpEventSink failed: {}", e)))
    }
}
