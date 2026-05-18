use serde::{Deserialize, Serialize};

#[cfg(feature = "napi")]
use napi_derive::napi;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct HomeWorkspace {
    pub id: i64,
    pub key: String,
    pub name: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct HomeCategory {
    pub id: String,
    pub workspace_id: i64,
    pub label: String,
    pub icon: String,
    pub sort_order: i64,
    pub background_color: Option<String>,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct HomeWidget {
    pub id: String,
    pub workspace_id: i64,
    pub category_id: String,
    pub label: String,
    pub icon: Option<String>,
    pub action: Option<String>,
    pub source_type: String,
    pub widget_type: String,
    pub size_preset: Option<String>,
    pub widget_config: Option<String>,
    pub col: i64,
    pub row: i64,
    pub col_span: i64,
    pub row_span: i64,
    pub preferred_col: i64,
    pub preferred_row: i64,
    pub priority: i64,
    pub color: String,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub hidden: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct HomeLayoutCategory {
    pub id: String,
    pub workspace_id: i64,
    pub label: String,
    pub icon: String,
    pub sort_order: i64,
    pub background_color: Option<String>,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub widgets: Vec<HomeWidget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct HomeLayout {
    pub workspace_key: String,
    pub categories: Vec<HomeLayoutCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct MobileHomeWidgetLayout {
    pub widget_id: String,
    pub workspace_id: i64,
    pub layout_scope: String,
    pub col: i64,
    pub row: i64,
    pub col_span: i64,
    pub row_span: i64,
    pub preferred_col: i64,
    pub preferred_row: i64,
    pub priority: i64,
    pub hidden: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct SaveMobileHomeWidgetLayoutInput {
    pub widget_id: String,
    pub col: i64,
    pub row: i64,
    pub col_span: i64,
    pub row_span: i64,
    pub preferred_col: i64,
    pub preferred_row: i64,
    pub priority: i64,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct SaveMobileHomeCategoryLayoutInput {
    pub category_id: String,
    pub widgets: Vec<SaveMobileHomeWidgetLayoutInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateHomeCategoryInput {
    pub id: String,
    pub workspace_key: String,
    pub label: String,
    pub icon: String,
    pub sort_order: i64,
    pub background_color: Option<String>,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateHomeCategoryInput {
    pub label: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i64>,
    pub background_color: Option<String>,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct CreateHomeWidgetInput {
    pub id: String,
    pub workspace_key: String,
    pub category_id: String,
    pub label: String,
    pub icon: Option<String>,
    pub action: Option<String>,
    pub source_type: String,
    pub widget_type: String,
    pub size_preset: Option<String>,
    pub widget_config: Option<String>,
    pub col: i64,
    pub row: i64,
    pub col_span: i64,
    pub row_span: i64,
    pub preferred_col: i64,
    pub preferred_row: i64,
    pub priority: i64,
    pub color: String,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct UpdateHomeWidgetInput {
    pub category_id: Option<String>,
    pub label: Option<String>,
    pub icon: Option<String>,
    pub action: Option<String>,
    pub source_type: Option<String>,
    pub widget_type: Option<String>,
    pub size_preset: Option<String>,
    pub widget_config: Option<String>,
    pub col: Option<i64>,
    pub row: Option<i64>,
    pub col_span: Option<i64>,
    pub row_span: Option<i64>,
    pub preferred_col: Option<i64>,
    pub preferred_row: Option<i64>,
    pub priority: Option<i64>,
    pub color: Option<String>,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub hidden: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ImportHomeWidgetInput {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub action: Option<String>,
    pub source_type: Option<String>,
    pub widget_type: Option<String>,
    pub size_preset: Option<String>,
    pub widget_config: Option<String>,
    pub col: i64,
    pub row: i64,
    pub col_span: i64,
    pub row_span: i64,
    pub preferred_col: i64,
    pub preferred_row: i64,
    pub priority: i64,
    pub color: String,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ImportHomeCategoryInput {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub sort_order: i64,
    pub background_color: Option<String>,
    pub background_image: Option<String>,
    pub background_video: Option<String>,
    pub background_style: Option<String>,
    pub widgets: Vec<ImportHomeWidgetInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "napi", napi(object))]
pub struct ImportHomeLayoutInput {
    pub categories: Vec<ImportHomeCategoryInput>,
}
