// Flutter Rust Bridge 绑定
// 注意：需要运行 flutter_rust_bridge_codegen 来生成 Dart 绑定代码

use crate::db::Database;
use crate::models::*;
use crate::multi_device_clipboard::MultiDeviceClipboardManager;
use crate::services::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_CLIPBOARD_SYNC_BYTES: i64 = 1024 * 1024 * 1024;

struct MobileClipboardHost {
    manager: Arc<MultiDeviceClipboardManager>,
}

static MOBILE_CLIPBOARD_HOSTS: OnceLock<Mutex<HashMap<String, MobileClipboardHost>>> =
    OnceLock::new();

fn mobile_clipboard_hosts() -> &'static Mutex<HashMap<String, MobileClipboardHost>> {
    MOBILE_CLIPBOARD_HOSTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn with_mobile_clipboard_manager<T>(
    host_id: String,
    f: impl FnOnce(&MultiDeviceClipboardManager) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    let manager = {
        let hosts = mobile_clipboard_hosts()
            .lock()
            .map_err(|_| anyhow::anyhow!("mobile clipboard host registry poisoned"))?;
        hosts
            .get(&host_id)
            .map(|host| host.manager.clone())
            .ok_or_else(|| anyhow::anyhow!("mobile clipboard host not found: {}", host_id))?
    };
    f(&manager)
}

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

    pub fn database(&self) -> anyhow::Result<Database> {
        self.inner
            .lock()
            .map(|db| db.clone())
            .map_err(|_| anyhow::anyhow!("Flutter database lock poisoned"))
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

// ==================== 首页布局相关函数 ====================

pub fn get_home_layout(db_path: String, workspace_key: String) -> anyhow::Result<HomeLayout> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::get_layout_by_workspace_key(&db, &workspace_key)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn create_home_category(
    db_path: String,
    input: CreateHomeCategoryInput,
) -> anyhow::Result<HomeCategory> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::create_category(&db, input).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn update_home_category(
    db_path: String,
    category_id: String,
    input: UpdateHomeCategoryInput,
) -> anyhow::Result<HomeCategory> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::update_category(&db, &category_id, input)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn delete_home_category(db_path: String, category_id: String) -> anyhow::Result<()> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::delete_category(&db, &category_id).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn create_home_widget(
    db_path: String,
    input: CreateHomeWidgetInput,
) -> anyhow::Result<HomeWidget> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::create_widget(&db, input).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn update_home_widget(
    db_path: String,
    widget_id: String,
    input: UpdateHomeWidgetInput,
) -> anyhow::Result<HomeWidget> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::update_widget(&db, &widget_id, input).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn delete_home_widget(db_path: String, widget_id: String) -> anyhow::Result<()> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::delete_widget(&db, &widget_id).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn import_home_layout(
    db_path: String,
    workspace_key: String,
    input: ImportHomeLayoutInput,
) -> anyhow::Result<HomeLayout> {
    let db = Database::new(&db_path)?;
    HomeLayoutService::import_layout(&db, &workspace_key, input)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

// ==================== 多设备剪贴板可复用核心 ====================

pub fn create_mobile_clipboard_host(db_path: String) -> anyhow::Result<String> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = Arc::new(MultiDeviceClipboardManager::new(db));
    let host_id = Uuid::new_v4().to_string();
    let mut hosts = mobile_clipboard_hosts()
        .lock()
        .map_err(|_| anyhow::anyhow!("mobile clipboard host registry poisoned"))?;
    hosts.insert(host_id.clone(), MobileClipboardHost { manager });
    Ok(host_id)
}

pub fn dispose_mobile_clipboard_host(host_id: String) -> anyhow::Result<()> {
    let host = mobile_clipboard_hosts()
        .lock()
        .map_err(|_| anyhow::anyhow!("mobile clipboard host registry poisoned"))?
        .remove(&host_id);
    if let Some(host) = host {
        host.manager.stop_discovery();
    }
    Ok(())
}

pub fn get_or_create_mobile_clipboard_local_device(
    host_id: String,
    name: String,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .get_or_create_local_device(name)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn start_mobile_clipboard_discovery(
    host_id: String,
    config: MultiDeviceClipboardDiscoveryConfig,
) -> anyhow::Result<()> {
    with_mobile_clipboard_manager(host_id, |manager| manager.start_discovery(config))
}

pub fn stop_mobile_clipboard_discovery(host_id: String) -> anyhow::Result<()> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager.stop_discovery();
        Ok(())
    })
}

pub fn list_mobile_clipboard_discovered_devices(
    host_id: String,
) -> anyhow::Result<Vec<MultiDeviceClipboardDiscoveredDevice>> {
    with_mobile_clipboard_manager(host_id, |manager| Ok(manager.list_discovered_devices()))
}

pub fn list_mobile_clipboard_devices(
    host_id: String,
) -> anyhow::Result<Vec<MultiDeviceClipboardDevice>> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager.list_devices().map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn list_mobile_clipboard_device_statuses(
    host_id: String,
    online_window_seconds: i64,
) -> anyhow::Result<Vec<MultiDeviceClipboardDeviceStatus>> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .list_device_statuses(online_window_seconds)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn upsert_mobile_clipboard_device(
    host_id: String,
    input: UpsertMultiDeviceClipboardDeviceInput,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .upsert_device(input)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn set_mobile_clipboard_device_trusted(
    host_id: String,
    id: String,
    trusted: bool,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .set_device_trusted(id, trusted)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn forget_mobile_clipboard_device(host_id: String, id: String) -> anyhow::Result<()> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .forget_device(id)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn list_mobile_clipboard_items(
    host_id: String,
    limit: i64,
) -> anyhow::Result<Vec<MultiDeviceClipboardItem>> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .list_items(limit)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn get_mobile_clipboard_item(
    host_id: String,
    id: String,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager.get_item(id).map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn upsert_mobile_clipboard_item(
    host_id: String,
    mut input: UpsertMultiDeviceClipboardItemInput,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    input.byte_size = input.byte_size.map(clamp_clipboard_sync_bytes);
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .upsert_item(input)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn delete_mobile_clipboard_item(host_id: String, id: String) -> anyhow::Result<()> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .delete_item(id)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn clear_mobile_clipboard_history(host_id: String) -> anyhow::Result<()> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .clear_history()
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn prune_mobile_clipboard_history(host_id: String, history_limit: i64) -> anyhow::Result<()> {
    with_mobile_clipboard_manager(host_id, |manager| {
        manager
            .prune_history(history_limit)
            .map_err(|e| anyhow::anyhow!("{}", e))
    })
}

pub fn compute_mobile_clipboard_content_hash(parts: Vec<String>) -> String {
    MultiDeviceClipboardManager::compute_content_hash(parts)
}

pub fn classify_mobile_clipboard_text(text: String) -> Vec<String> {
    classify_clipboard_text(&text)
        .into_iter()
        .map(ToString::to_string)
        .collect()
}

pub fn clamp_mobile_clipboard_sync_bytes(value: i64) -> i64 {
    clamp_clipboard_sync_bytes(value)
}

pub fn get_or_create_multi_device_clipboard_local_device(
    db_path: String,
    name: String,
) -> anyhow::Result<MultiDeviceClipboardDevice> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager
        .get_or_create_local_device(name)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn list_multi_device_clipboard_items(
    db_path: String,
    limit: i64,
) -> anyhow::Result<Vec<MultiDeviceClipboardItem>> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager
        .list_items(limit)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn get_multi_device_clipboard_item(
    db_path: String,
    id: String,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager.get_item(id).map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn upsert_multi_device_clipboard_item(
    db_path: String,
    input: UpsertMultiDeviceClipboardItemInput,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager
        .upsert_item(input)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn upsert_multi_device_clipboard_text(
    db_path: String,
    device_name: String,
    text: String,
) -> anyhow::Result<MultiDeviceClipboardItem> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    let device = manager
        .get_or_create_local_device(device_name)
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    let content_hash =
        MultiDeviceClipboardManager::compute_content_hash(vec!["text".to_string(), text.clone()]);
    let tags_json = serde_json::to_string(&classify_clipboard_text(&text))?;
    manager
        .upsert_item(UpsertMultiDeviceClipboardItemInput {
            id: Uuid::new_v4().to_string(),
            source_device_id: device.id,
            source_device_name: device.name,
            content_type: "text".to_string(),
            mime_type: Some("text/plain".to_string()),
            text: Some(text.clone()),
            byte_size: Some(text.as_bytes().len() as i64),
            content_hash,
            tags_json: Some(tags_json),
            local_only: Some(false),
            created_at: Some(unix_now()),
            ..Default::default()
        })
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn delete_multi_device_clipboard_item(db_path: String, id: String) -> anyhow::Result<()> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager
        .delete_item(id)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn clear_multi_device_clipboard_history(db_path: String) -> anyhow::Result<()> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager
        .clear_history()
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn prune_multi_device_clipboard_history(
    db_path: String,
    history_limit: i64,
) -> anyhow::Result<()> {
    let db = Arc::new(Database::new(&db_path)?);
    let manager = MultiDeviceClipboardManager::new(db);
    manager
        .prune_history(history_limit)
        .map_err(|e| anyhow::anyhow!("{}", e))
}

pub fn compute_multi_device_clipboard_content_hash(parts: Vec<String>) -> String {
    MultiDeviceClipboardManager::compute_content_hash(parts)
}

fn classify_clipboard_text(text: &str) -> Vec<&'static str> {
    let trimmed = text.trim();
    let mut tags = vec!["text"];
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        tags.push("url");
    }
    if text.contains("```") || text.contains("**") || trimmed.starts_with('#') {
        tags.push("markdown");
    }
    if text.chars().any(|ch| {
        matches!(
            ch as u32,
            0x1F300..=0x1FAFF | 0x2600..=0x27BF | 0xFE00..=0xFE0F
        )
    }) {
        tags.push("emoji");
    }
    tags
}

fn clamp_clipboard_sync_bytes(value: i64) -> i64 {
    value.clamp(1, MAX_CLIPBOARD_SYNC_BYTES)
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mobile_host_registry_lifecycle_and_history_crud() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("clipboard.db").display().to_string();
        let host_id = create_mobile_clipboard_host(db_path).unwrap();

        let device = get_or_create_mobile_clipboard_local_device(
            host_id.clone(),
            "Android Phone".to_string(),
        )
        .unwrap();
        assert!(device.is_self);

        let hash = compute_mobile_clipboard_content_hash(vec![
            "text".to_string(),
            "https://example.com".to_string(),
        ]);
        let item = upsert_mobile_clipboard_item(
            host_id.clone(),
            UpsertMultiDeviceClipboardItemInput {
                id: Uuid::new_v4().to_string(),
                source_device_id: device.id,
                source_device_name: device.name,
                content_type: "text".to_string(),
                mime_type: Some("text/plain".to_string()),
                text: Some("https://example.com".to_string()),
                content_hash: hash,
                tags_json: Some("[\"text\",\"url\"]".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

        let items = list_mobile_clipboard_items(host_id.clone(), 10).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, item.id);

        delete_mobile_clipboard_item(host_id.clone(), item.id).unwrap();
        assert!(list_mobile_clipboard_items(host_id.clone(), 10)
            .unwrap()
            .is_empty());

        dispose_mobile_clipboard_host(host_id.clone()).unwrap();
        assert!(list_mobile_clipboard_items(host_id, 10).is_err());
    }

    #[test]
    fn mobile_helpers_classify_and_clamp() {
        assert_eq!(
            classify_mobile_clipboard_text("# Hello 😀".to_string()),
            vec!["text", "markdown", "emoji"]
        );
        assert_eq!(clamp_mobile_clipboard_sync_bytes(-1), 1);
        assert_eq!(
            clamp_mobile_clipboard_sync_bytes(MAX_CLIPBOARD_SYNC_BYTES + 1),
            MAX_CLIPBOARD_SYNC_BYTES
        );
    }
}
