use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

// ==================== 列表 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct TodoList {
    pub id: String,
    pub workspace_id: i64,
    pub name: String,
    pub icon: String,
    pub theme_color: String,
    pub sort_order: i64,
    pub incomplete_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateTodoListInput {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub theme_color: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateTodoListInput {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub theme_color: Option<String>,
    pub sort_order: Option<i64>,
}

// ==================== 任务 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct Todo {
    pub id: String,
    pub list_id: String,
    pub title: String,
    pub note: String,
    pub is_completed: bool,
    pub is_important: bool,
    pub is_my_day: bool,
    pub my_day_date: Option<String>,
    pub due_date: Option<String>,
    pub repeat_rule: Option<String>,
    pub sort_order: i64,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub steps: Vec<TodoStep>,
    pub reminders: Vec<TodoReminder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateTodoInput {
    pub id: String,
    pub list_id: String,
    pub title: String,
    pub note: Option<String>,
    pub is_important: Option<bool>,
    pub is_my_day: Option<bool>,
    pub due_date: Option<String>,
    pub repeat_rule: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateTodoInput {
    pub list_id: Option<String>,
    pub title: Option<String>,
    pub note: Option<String>,
    pub is_important: Option<bool>,
    pub is_my_day: Option<bool>,
    pub my_day_date: Option<String>,
    pub due_date: Option<String>,
    pub repeat_rule: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CompleteTodoResult {
    pub completed_todo: Todo,
    pub next_todo: Option<Todo>,
}

// ==================== 步骤 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct TodoStep {
    pub id: String,
    pub todo_id: String,
    pub title: String,
    pub image_url: Option<String>,
    pub is_completed: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateTodoStepInput {
    pub id: String,
    pub todo_id: String,
    pub title: String,
    pub image_url: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateTodoStepInput {
    pub title: Option<String>,
    pub image_url: Option<String>,
    pub is_completed: Option<bool>,
    pub sort_order: Option<i64>,
}

// ==================== 提醒 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct TodoReminder {
    pub id: String,
    pub todo_id: String,
    pub remind_at: String,
    pub is_sent: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateTodoReminderInput {
    pub id: String,
    pub todo_id: String,
    pub remind_at: String,
}
