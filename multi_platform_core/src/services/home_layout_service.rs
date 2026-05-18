use crate::db::{Database, DbError, DbResult};
use crate::models::{
    CreateHomeCategoryInput, CreateHomeWidgetInput, HomeCategory, HomeLayout, HomeLayoutCategory,
    HomeWidget, HomeWorkspace, ImportHomeLayoutInput, SaveMobileHomeCategoryLayoutInput,
    UpdateHomeCategoryInput, UpdateHomeWidgetInput,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use uuid::Uuid;

pub struct HomeLayoutService;

impl HomeLayoutService {
    const DEFAULT_WORKSPACE_KEY: &'static str = "default";
    const ACTIVE_WORKSPACE_SETTING_KEY: &'static str = "home.activeWorkspaceKey";
    pub const MOBILE_SCOPE_COMPACT: &'static str = "mobile_compact";
    pub const MOBILE_SCOPE_EXPANDED: &'static str = "mobile_expanded";

    pub fn list_workspaces(db: &Database) -> DbResult<Vec<HomeWorkspace>> {
        db.with_connection(|conn| Self::list_workspaces_with_conn(conn))
    }

    pub fn create_workspace(db: &Database, name: String) -> DbResult<HomeWorkspace> {
        db.transaction(|conn| {
            let name = Self::normalize_required_name(name)?;
            let key = format!("home-{}", Uuid::new_v4().simple());

            conn.execute(
                "INSERT INTO home_workspaces (key, name, is_default) VALUES (?1, ?2, 0)",
                params![key, name],
            )?;

            Self::get_workspace_by_key(conn, &key)
        })
    }

    pub fn rename_workspace(db: &Database, key: &str, name: String) -> DbResult<HomeWorkspace> {
        db.transaction(|conn| {
            let name = Self::normalize_required_name(name)?;
            let affected = conn.execute(
                "UPDATE home_workspaces SET name = ?1, updated_at = datetime('now') WHERE key = ?2",
                params![name, key],
            )?;

            if affected == 0 {
                return Err(DbError::NotFound(format!("首页配置文件 {} 不存在", key)));
            }

            Self::get_workspace_by_key(conn, key)
        })
    }

    pub fn delete_workspace(db: &Database, key: &str) -> DbResult<String> {
        db.transaction(|conn| {
            let count: i64 =
                conn.query_row("SELECT COUNT(*) FROM home_workspaces", [], |row| row.get(0))?;
            if count <= 1 {
                return Err(DbError::InvalidParameter(
                    "至少需要保留一个首页配置文件".to_string(),
                ));
            }

            Self::get_workspace_by_key(conn, key)?;
            let active_key = Self::get_active_workspace_key_with_conn(conn)?;

            conn.execute("DELETE FROM home_workspaces WHERE key = ?1", params![key])?;

            let next_active_key = if active_key == key {
                Self::fallback_workspace_key(conn)?
            } else {
                active_key
            };
            Self::set_active_workspace_key_with_conn(conn, &next_active_key)?;

            Ok(next_active_key)
        })
    }

    pub fn get_active_workspace_key(db: &Database) -> DbResult<String> {
        db.with_connection(|conn| Self::get_active_workspace_key_with_conn(conn))
    }

    pub fn set_active_workspace_key(db: &Database, key: &str) -> DbResult<HomeWorkspace> {
        db.transaction(|conn| {
            let workspace = Self::get_workspace_by_key(conn, key)?;
            Self::set_active_workspace_key_with_conn(conn, key)?;
            Ok(workspace)
        })
    }

    pub fn get_layout_by_workspace_key(db: &Database, workspace_key: &str) -> DbResult<HomeLayout> {
        db.with_connection(|conn| {
            let workspace_id = Self::get_workspace_id(conn, workspace_key)?;
            let categories = Self::list_categories_with_widgets(conn, workspace_id)?;
            Ok(HomeLayout {
                workspace_key: workspace_key.to_string(),
                categories,
            })
        })
    }

    pub fn get_mobile_layout_by_workspace_key(
        db: &Database,
        workspace_key: &str,
        layout_scope: &str,
    ) -> DbResult<HomeLayout> {
        db.with_connection(|conn| {
            Self::validate_mobile_layout_scope(layout_scope)?;
            let workspace_id = Self::get_workspace_id(conn, workspace_key)?;
            let categories =
                Self::list_categories_with_widgets_for_mobile(conn, workspace_id, layout_scope)?;
            Ok(HomeLayout {
                workspace_key: workspace_key.to_string(),
                categories,
            })
        })
    }

    pub fn save_mobile_category_layout(
        db: &Database,
        workspace_key: &str,
        layout_scope: &str,
        input: SaveMobileHomeCategoryLayoutInput,
    ) -> DbResult<HomeLayoutCategory> {
        db.transaction(|conn| {
            Self::validate_mobile_layout_scope(layout_scope)?;
            let workspace_id = Self::get_workspace_id(conn, workspace_key)?;
            Self::ensure_category_in_workspace(conn, &input.category_id, workspace_id)?;

            for widget in &input.widgets {
                let existing = Self::get_widget(conn, &widget.widget_id)?;
                if existing.workspace_id != workspace_id {
                    return Err(DbError::InvalidParameter(format!(
                        "卡片 {} 不属于工作区 {}",
                        widget.widget_id, workspace_id
                    )));
                }
                if existing.category_id != input.category_id {
                    return Err(DbError::InvalidParameter(format!(
                        "卡片 {} 不属于分类 {}",
                        widget.widget_id, input.category_id
                    )));
                }
            }

            conn.execute(
                "DELETE FROM mobile_home_widget_layouts
                 WHERE workspace_id = ?1 AND layout_scope = ?2 AND widget_id IN (
                    SELECT id FROM home_widgets WHERE workspace_id = ?1 AND category_id = ?3
                 )",
                params![workspace_id, layout_scope, input.category_id],
            )?;

            for widget in input.widgets {
                conn.execute(
                    "INSERT INTO mobile_home_widget_layouts (
                        workspace_id, widget_id, layout_scope, col, row, col_span, row_span,
                        preferred_col, preferred_row, priority, hidden
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
                    )",
                    params![
                        workspace_id,
                        widget.widget_id,
                        layout_scope,
                        widget.col,
                        widget.row,
                        widget.col_span,
                        widget.row_span,
                        widget.preferred_col,
                        widget.preferred_row,
                        widget.priority,
                        widget.hidden as i64
                    ],
                )?;
            }

            Self::get_mobile_category_layout(conn, workspace_id, &input.category_id, layout_scope)
        })
    }

    pub fn reset_mobile_category_layout(
        db: &Database,
        workspace_key: &str,
        layout_scope: &str,
        category_id: &str,
    ) -> DbResult<HomeLayoutCategory> {
        db.transaction(|conn| {
            Self::validate_mobile_layout_scope(layout_scope)?;
            let workspace_id = Self::get_workspace_id(conn, workspace_key)?;
            Self::ensure_category_in_workspace(conn, category_id, workspace_id)?;

            conn.execute(
                "DELETE FROM mobile_home_widget_layouts
                 WHERE workspace_id = ?1 AND layout_scope = ?2 AND widget_id IN (
                    SELECT id FROM home_widgets WHERE workspace_id = ?1 AND category_id = ?3
                 )",
                params![workspace_id, layout_scope, category_id],
            )?;

            Self::get_mobile_category_layout(conn, workspace_id, category_id, layout_scope)
        })
    }

    pub fn create_category(
        db: &Database,
        input: CreateHomeCategoryInput,
    ) -> DbResult<HomeCategory> {
        db.transaction(|conn| {
            let workspace_id = Self::get_workspace_id(conn, &input.workspace_key)?;
            let background_color = Self::normalize_optional_text(input.background_color);
            let background_image = Self::normalize_optional_text(input.background_image);
            let background_video = Self::normalize_optional_text(input.background_video);
            let background_style = Self::normalize_optional_text(input.background_style);

            conn.execute(
                "INSERT INTO home_categories (id, workspace_id, label, icon, sort_order, background_color, background_image, background_video, background_style)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![input.id, workspace_id, input.label, input.icon, input.sort_order,
                        background_color, background_image, background_video, background_style],
            )?;

            Self::get_category(conn, &input.id)
        })
    }

    pub fn update_category(
        db: &Database,
        category_id: &str,
        input: UpdateHomeCategoryInput,
    ) -> DbResult<HomeCategory> {
        db.transaction(|conn| {
            let current = Self::get_category(conn, category_id)?;
            let label = input.label.unwrap_or(current.label);
            let icon = input.icon.unwrap_or(current.icon);
            let sort_order = input.sort_order.unwrap_or(current.sort_order);
            let background_color = match input.background_color {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_color,
            };
            let background_image = match input.background_image {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_image,
            };
            let background_video = match input.background_video {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_video,
            };
            let background_style = match input.background_style {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_style,
            };

            conn.execute(
                "UPDATE home_categories
                 SET label = ?1, icon = ?2, sort_order = ?3,
                     background_color = ?4, background_image = ?5,
                     background_video = ?6, background_style = ?7,
                     updated_at = datetime('now')
                 WHERE id = ?8",
                params![
                    label,
                    icon,
                    sort_order,
                    background_color,
                    background_image,
                    background_video,
                    background_style,
                    category_id
                ],
            )?;

            Self::get_category(conn, category_id)
        })
    }

    pub fn delete_category(db: &Database, category_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM home_categories WHERE id = ?1",
                params![category_id],
            )?;
            Ok(())
        })
    }

    pub fn create_widget(db: &Database, input: CreateHomeWidgetInput) -> DbResult<HomeWidget> {
        db.transaction(|conn| {
            let workspace_id = Self::get_workspace_id(conn, &input.workspace_key)?;
            Self::ensure_category_in_workspace(conn, &input.category_id, workspace_id)?;
            let background_image = Self::normalize_optional_text(input.background_image);
            let background_video = Self::normalize_optional_text(input.background_video);
            let background_style = Self::normalize_optional_text(input.background_style);
            let size_preset = Self::normalize_optional_text(input.size_preset);
            let widget_config = Self::normalize_optional_text(input.widget_config);

            conn.execute(
                "INSERT INTO home_widgets (
                    id, workspace_id, category_id, label, icon, action, source_type, widget_type,
                    size_preset, widget_config, col, row, col_span, row_span,
                    preferred_col, preferred_row, priority, color, background_image, background_video,
                    background_style, hidden
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
                 )",
                params![
                    input.id,
                    workspace_id,
                    input.category_id,
                    input.label,
                    input.icon,
                    input.action,
                    input.source_type,
                    input.widget_type,
                    size_preset,
                    widget_config,
                    input.col,
                    input.row,
                    input.col_span,
                    input.row_span,
                    input.preferred_col,
                    input.preferred_row,
                    input.priority,
                    input.color,
                    background_image,
                    background_video,
                    background_style,
                    input.hidden as i64
                ],
            )?;

            Self::get_widget(conn, &input.id)
        })
    }

    pub fn update_widget(
        db: &Database,
        widget_id: &str,
        input: UpdateHomeWidgetInput,
    ) -> DbResult<HomeWidget> {
        db.transaction(|conn| {
            let current = Self::get_widget(conn, widget_id)?;
            let category_id = input.category_id.unwrap_or(current.category_id.clone());
            Self::ensure_category_in_workspace(conn, &category_id, current.workspace_id)?;

            let label = input.label.unwrap_or(current.label);
            let icon = input.icon.or(current.icon);
            let action = input.action.or(current.action);
            let source_type = input.source_type.unwrap_or(current.source_type);
            let widget_type = input.widget_type.unwrap_or(current.widget_type);
            let size_preset = match input.size_preset {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.size_preset,
            };
            let widget_config = match input.widget_config {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.widget_config,
            };
            let col = input.col.unwrap_or(current.col);
            let row = input.row.unwrap_or(current.row);
            let col_span = input.col_span.unwrap_or(current.col_span);
            let row_span = input.row_span.unwrap_or(current.row_span);
            let preferred_col = input.preferred_col.unwrap_or(current.preferred_col);
            let preferred_row = input.preferred_row.unwrap_or(current.preferred_row);
            let priority = input.priority.unwrap_or(current.priority);
            let color = input.color.unwrap_or(current.color);
            let background_image = match input.background_image {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_image,
            };
            let background_video = match input.background_video {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_video,
            };
            let background_style = match input.background_style {
                Some(value) => Self::normalize_optional_text(Some(value)),
                None => current.background_style,
            };
            let hidden = input.hidden.unwrap_or(current.hidden);

            conn.execute(
                "UPDATE home_widgets
                 SET category_id = ?1,
                     label = ?2,
                     icon = ?3,
                     action = ?4,
                     source_type = ?5,
                     widget_type = ?6,
                     size_preset = ?7,
                     widget_config = ?8,
                     col = ?9,
                     row = ?10,
                     col_span = ?11,
                     row_span = ?12,
                     preferred_col = ?13,
                     preferred_row = ?14,
                     priority = ?15,
                     color = ?16,
                     background_image = ?17,
                     background_video = ?18,
                     background_style = ?19,
                     hidden = ?20,
                     updated_at = datetime('now')
                 WHERE id = ?21",
                params![
                    category_id,
                    label,
                    icon,
                    action,
                    source_type,
                    widget_type,
                    size_preset,
                    widget_config,
                    col,
                    row,
                    col_span,
                    row_span,
                    preferred_col,
                    preferred_row,
                    priority,
                    color,
                    background_image,
                    background_video,
                    background_style,
                    hidden as i64,
                    widget_id
                ],
            )?;

            Self::get_widget(conn, widget_id)
        })
    }

    pub fn delete_widget(db: &Database, widget_id: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM home_widgets WHERE id = ?1", params![widget_id])?;
            Ok(())
        })
    }

    pub fn import_layout(
        db: &Database,
        workspace_key: &str,
        input: ImportHomeLayoutInput,
    ) -> DbResult<HomeLayout> {
        db.transaction(|conn| {
            let workspace_id = Self::get_workspace_id(conn, workspace_key)?;

            conn.execute(
                "DELETE FROM home_widgets WHERE workspace_id = ?1",
                params![workspace_id],
            )?;
            conn.execute(
                "DELETE FROM home_categories WHERE workspace_id = ?1",
                params![workspace_id],
            )?;

            for category in input.categories {
                let bg_color = Self::normalize_optional_text(category.background_color);
                let bg_image = Self::normalize_optional_text(category.background_image);
                let bg_video = Self::normalize_optional_text(category.background_video);
                let bg_style = Self::normalize_optional_text(category.background_style);

                conn.execute(
                    "INSERT INTO home_categories (id, workspace_id, label, icon, sort_order, background_color, background_image, background_video, background_style)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        category.id,
                        workspace_id,
                        category.label,
                        category.icon,
                        category.sort_order,
                        bg_color,
                        bg_image,
                        bg_video,
                        bg_style
                    ],
                )?;

                for widget in category.widgets {
                    let background_image = Self::normalize_optional_text(widget.background_image);
                    let background_video = Self::normalize_optional_text(widget.background_video);
                    let background_style = Self::normalize_optional_text(widget.background_style);
                    let size_preset = Self::normalize_optional_text(widget.size_preset);
                    let widget_config = Self::normalize_optional_text(widget.widget_config);
                    conn.execute(
                        "INSERT INTO home_widgets (
                            id, workspace_id, category_id, label, icon, action, source_type, widget_type,
                            size_preset, widget_config, col, row, col_span, row_span,
                            preferred_col, preferred_row, priority, color, background_image, background_video,
                            background_style, hidden
                         ) VALUES (
                            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
                         )",
                        params![
                            widget.id,
                            workspace_id,
                            category.id,
                            widget.label,
                            widget.icon,
                            widget.action,
                            widget.source_type.unwrap_or_else(|| "shortcut".to_string()),
                            widget.widget_type.unwrap_or_else(|| "shortcut".to_string()),
                            size_preset,
                            widget_config,
                            widget.col,
                            widget.row,
                            widget.col_span,
                            widget.row_span,
                            widget.preferred_col,
                            widget.preferred_row,
                            widget.priority,
                            widget.color,
                            background_image,
                            background_video,
                            background_style,
                            widget.hidden as i64
                        ],
                    )?;
                }
            }

            let categories = Self::list_categories_with_widgets(conn, workspace_id)?;
            Ok(HomeLayout {
                workspace_key: workspace_key.to_string(),
                categories,
            })
        })
    }

    fn get_workspace_id(conn: &Connection, workspace_key: &str) -> DbResult<i64> {
        conn.query_row(
            "SELECT id FROM home_workspaces WHERE key = ?1",
            params![workspace_key],
            |row| row.get(0),
        )
        .map_err(DbError::from)
    }

    fn list_workspaces_with_conn(conn: &Connection) -> DbResult<Vec<HomeWorkspace>> {
        let mut stmt = conn.prepare(
            "SELECT id, key, name, is_default, created_at, updated_at
             FROM home_workspaces
             ORDER BY is_default DESC, created_at ASC, id ASC",
        )?;

        let workspaces = stmt
            .query_map([], Self::map_workspace)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(workspaces)
    }

    fn get_workspace_by_key(conn: &Connection, key: &str) -> DbResult<HomeWorkspace> {
        conn.query_row(
            "SELECT id, key, name, is_default, created_at, updated_at
             FROM home_workspaces WHERE key = ?1",
            params![key],
            Self::map_workspace,
        )
        .map_err(DbError::from)
    }

    fn workspace_exists(conn: &Connection, key: &str) -> DbResult<bool> {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM home_workspaces WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;

        Ok(exists.is_some())
    }

    fn fallback_workspace_key(conn: &Connection) -> DbResult<String> {
        if Self::workspace_exists(conn, Self::DEFAULT_WORKSPACE_KEY)? {
            return Ok(Self::DEFAULT_WORKSPACE_KEY.to_string());
        }

        conn.query_row(
            "SELECT key FROM home_workspaces ORDER BY is_default DESC, created_at ASC, id ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(DbError::from)
    }

    fn get_active_workspace_key_with_conn(conn: &Connection) -> DbResult<String> {
        let stored_key: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![Self::ACTIVE_WORKSPACE_SETTING_KEY],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(key) = stored_key {
            if Self::workspace_exists(conn, &key)? {
                return Ok(key);
            }
        }

        let fallback_key = Self::fallback_workspace_key(conn)?;
        Self::set_active_workspace_key_with_conn(conn, &fallback_key)?;
        Ok(fallback_key)
    }

    fn set_active_workspace_key_with_conn(conn: &Connection, key: &str) -> DbResult<()> {
        conn.execute(
            "INSERT INTO settings (key, value, description) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                description = excluded.description,
                updated_at = datetime('now')",
            params![Self::ACTIVE_WORKSPACE_SETTING_KEY, key, "当前首页配置文件"],
        )?;
        Ok(())
    }

    fn map_workspace(row: &rusqlite::Row<'_>) -> rusqlite::Result<HomeWorkspace> {
        Ok(HomeWorkspace {
            id: row.get(0)?,
            key: row.get(1)?,
            name: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }

    fn ensure_category_in_workspace(
        conn: &Connection,
        category_id: &str,
        workspace_id: i64,
    ) -> DbResult<()> {
        let existing_workspace_id: Option<i64> = conn
            .query_row(
                "SELECT workspace_id FROM home_categories WHERE id = ?1",
                params![category_id],
                |row| row.get(0),
            )
            .optional()?;

        match existing_workspace_id {
            Some(id) if id == workspace_id => Ok(()),
            Some(_) => Err(DbError::InvalidParameter(format!(
                "类别 {} 不属于目标工作区 {}",
                category_id, workspace_id
            ))),
            None => Err(DbError::NotFound(format!("类别 {} 不存在", category_id))),
        }
    }

    fn list_categories_with_widgets(
        conn: &Connection,
        workspace_id: i64,
    ) -> DbResult<Vec<HomeLayoutCategory>> {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, label, icon, sort_order,
                    background_color, background_image, background_video, background_style
             FROM home_categories
             WHERE workspace_id = ?1
             ORDER BY sort_order ASC, created_at ASC",
        )?;

        let categories = stmt
            .query_map(params![workspace_id], |row| {
                Ok(HomeLayoutCategory {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    label: row.get(2)?,
                    icon: row.get(3)?,
                    sort_order: row.get(4)?,
                    background_color: row.get(5)?,
                    background_image: row.get(6)?,
                    background_video: row.get(7)?,
                    background_style: row.get(8)?,
                    widgets: Vec::new(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut result = Vec::with_capacity(categories.len());
        for mut category in categories {
            category.widgets = Self::list_widgets_by_category(conn, workspace_id, &category.id)?;
            result.push(category);
        }

        Ok(result)
    }

    fn list_categories_with_widgets_for_mobile(
        conn: &Connection,
        workspace_id: i64,
        layout_scope: &str,
    ) -> DbResult<Vec<HomeLayoutCategory>> {
        let mut categories = Self::list_categories_with_widgets(conn, workspace_id)?;
        let overrides = Self::list_mobile_widget_layouts(conn, workspace_id, layout_scope)?;

        for category in &mut categories {
            for widget in &mut category.widgets {
                if let Some(override_layout) = overrides.get(&widget.id) {
                    widget.col = override_layout.col;
                    widget.row = override_layout.row;
                    widget.col_span = override_layout.col_span;
                    widget.row_span = override_layout.row_span;
                    widget.preferred_col = override_layout.preferred_col;
                    widget.preferred_row = override_layout.preferred_row;
                    widget.priority = override_layout.priority;
                    widget.hidden = override_layout.hidden;
                }
            }
        }

        Ok(categories)
    }

    fn list_widgets_by_category(
        conn: &Connection,
        workspace_id: i64,
        category_id: &str,
    ) -> DbResult<Vec<HomeWidget>> {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, category_id, label, icon, action, source_type, widget_type,
                    size_preset, widget_config, col, row, col_span, row_span,
                    preferred_col, preferred_row, priority, color, background_image, background_video,
                    background_style, hidden, created_at, updated_at
             FROM home_widgets
             WHERE workspace_id = ?1 AND category_id = ?2
             ORDER BY priority ASC, created_at ASC",
        )?;

        let widgets = stmt
            .query_map(params![workspace_id, category_id], |row| {
                Self::map_widget(row)
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(widgets)
    }

    fn get_mobile_category_layout(
        conn: &Connection,
        workspace_id: i64,
        category_id: &str,
        layout_scope: &str,
    ) -> DbResult<HomeLayoutCategory> {
        let categories =
            Self::list_categories_with_widgets_for_mobile(conn, workspace_id, layout_scope)?;
        categories
            .into_iter()
            .find(|category| category.id == category_id)
            .ok_or_else(|| DbError::NotFound(format!("类别 {} 不存在", category_id)))
    }

    fn get_category(conn: &Connection, category_id: &str) -> DbResult<HomeCategory> {
        conn.query_row(
            "SELECT id, workspace_id, label, icon, sort_order,
                    background_color, background_image, background_video, background_style,
                    created_at, updated_at
             FROM home_categories WHERE id = ?1",
            params![category_id],
            |row| {
                Ok(HomeCategory {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    label: row.get(2)?,
                    icon: row.get(3)?,
                    sort_order: row.get(4)?,
                    background_color: row.get(5)?,
                    background_image: row.get(6)?,
                    background_video: row.get(7)?,
                    background_style: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
        .map_err(DbError::from)
    }

    fn get_widget(conn: &Connection, widget_id: &str) -> DbResult<HomeWidget> {
        conn.query_row(
            "SELECT id, workspace_id, category_id, label, icon, action, source_type, widget_type,
                    size_preset, widget_config, col, row, col_span, row_span,
                    preferred_col, preferred_row, priority, color, background_image, background_video,
                    background_style, hidden, created_at, updated_at
             FROM home_widgets WHERE id = ?1",
            params![widget_id],
            Self::map_widget,
        )
        .map_err(DbError::from)
    }

    fn list_mobile_widget_layouts(
        conn: &Connection,
        workspace_id: i64,
        layout_scope: &str,
    ) -> DbResult<HashMap<String, crate::models::MobileHomeWidgetLayout>> {
        let mut stmt = conn.prepare(
            "SELECT widget_id, workspace_id, layout_scope, col, row, col_span, row_span,
                    preferred_col, preferred_row, priority, hidden, created_at, updated_at
             FROM mobile_home_widget_layouts
             WHERE workspace_id = ?1 AND layout_scope = ?2",
        )?;

        let rows = stmt
            .query_map(params![workspace_id, layout_scope], |row| {
                Ok(crate::models::MobileHomeWidgetLayout {
                    widget_id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    layout_scope: row.get(2)?,
                    col: row.get(3)?,
                    row: row.get(4)?,
                    col_span: row.get(5)?,
                    row_span: row.get(6)?,
                    preferred_col: row.get(7)?,
                    preferred_row: row.get(8)?,
                    priority: row.get(9)?,
                    hidden: row.get::<_, i64>(10)? != 0,
                    created_at: row.get(11)?,
                    updated_at: row.get(12)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows
            .into_iter()
            .map(|layout| (layout.widget_id.clone(), layout))
            .collect())
    }

    fn validate_mobile_layout_scope(layout_scope: &str) -> DbResult<()> {
        match layout_scope {
            Self::MOBILE_SCOPE_COMPACT | Self::MOBILE_SCOPE_EXPANDED => Ok(()),
            other => Err(DbError::InvalidParameter(format!(
                "不支持的移动端布局范围: {}",
                other
            ))),
        }
    }

    fn map_widget(row: &rusqlite::Row<'_>) -> rusqlite::Result<HomeWidget> {
        Ok(HomeWidget {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            category_id: row.get(2)?,
            label: row.get(3)?,
            icon: row.get(4)?,
            action: row.get(5)?,
            source_type: row.get(6)?,
            widget_type: row.get(7)?,
            size_preset: row.get(8)?,
            widget_config: row.get(9)?,
            col: row.get(10)?,
            row: row.get(11)?,
            col_span: row.get(12)?,
            row_span: row.get(13)?,
            preferred_col: row.get(14)?,
            preferred_row: row.get(15)?,
            priority: row.get(16)?,
            color: row.get(17)?,
            background_image: row.get(18)?,
            background_video: row.get(19)?,
            background_style: row.get(20)?,
            hidden: row.get::<_, i64>(21)? != 0,
            created_at: row.get(22)?,
            updated_at: row.get(23)?,
        })
    }

    fn normalize_optional_text(value: Option<String>) -> Option<String> {
        value.and_then(|text| {
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        })
    }

    fn normalize_required_name(value: String) -> DbResult<String> {
        let name = value.trim().to_string();
        if name.is_empty() {
            Err(DbError::InvalidParameter(
                "首页配置文件名称不能为空".to_string(),
            ))
        } else {
            Ok(name)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        CreateHomeCategoryInput, CreateHomeWidgetInput, ImportHomeCategoryInput,
        ImportHomeWidgetInput, SaveMobileHomeCategoryLayoutInput, SaveMobileHomeWidgetLayoutInput,
    };

    #[test]
    fn test_default_home_layout_seeded() {
        let db = Database::new_in_memory().unwrap();
        let layout = HomeLayoutService::get_layout_by_workspace_key(&db, "default").unwrap();

        assert_eq!(layout.categories.len(), 4);
        assert_eq!(layout.categories[0].id, "category-tools");
        assert_eq!(layout.categories[0].widgets.len(), 3);
        assert_eq!(layout.categories[1].widgets.len(), 2);
        assert_eq!(layout.categories[2].widgets.len(), 2);
        assert_eq!(layout.categories[3].widgets.len(), 1);
    }

    #[test]
    fn test_home_workspace_profile_lifecycle() {
        let db = Database::new_in_memory().unwrap();

        assert_eq!(
            HomeLayoutService::get_active_workspace_key(&db).unwrap(),
            "default"
        );

        let created =
            HomeLayoutService::create_workspace(&db, "  个人工作台  ".to_string()).unwrap();
        assert_eq!(created.name, "个人工作台");
        assert!(!created.is_default);

        let blank_layout =
            HomeLayoutService::get_layout_by_workspace_key(&db, &created.key).unwrap();
        assert!(blank_layout.categories.is_empty());

        let active = HomeLayoutService::set_active_workspace_key(&db, &created.key).unwrap();
        assert_eq!(active.key, created.key);
        assert_eq!(
            HomeLayoutService::get_active_workspace_key(&db).unwrap(),
            created.key
        );

        let renamed =
            HomeLayoutService::rename_workspace(&db, &created.key, "项目配置".to_string()).unwrap();
        assert_eq!(renamed.name, "项目配置");

        let fallback_key = HomeLayoutService::delete_workspace(&db, &created.key).unwrap();
        assert_eq!(fallback_key, "default");
        assert_eq!(
            HomeLayoutService::get_active_workspace_key(&db).unwrap(),
            "default"
        );

        let delete_last = HomeLayoutService::delete_workspace(&db, "default");
        assert!(delete_last.is_err());
    }

    #[test]
    fn test_home_layout_category_and_widget_crud() {
        let db = Database::new_in_memory().unwrap();

        let category = HomeLayoutService::create_category(
            &db,
            CreateHomeCategoryInput {
                id: "category-custom".to_string(),
                workspace_key: "default".to_string(),
                label: "自定义".to_string(),
                icon: "category-tools".to_string(),
                sort_order: 99,
                background_color: None,
                background_image: None,
                background_video: None,
                background_style: None,
            },
        )
        .unwrap();
        assert_eq!(category.label, "自定义");

        let widget = HomeLayoutService::create_widget(
            &db,
            CreateHomeWidgetInput {
                id: "grid-item-custom".to_string(),
                workspace_key: "default".to_string(),
                category_id: category.id.clone(),
                label: "新卡片".to_string(),
                icon: Some("tool".to_string()),
                action: Some("open:test".to_string()),
                source_type: "shortcut".to_string(),
                widget_type: "shortcut".to_string(),
                size_preset: None,
                widget_config: None,
                col: 1,
                row: 1,
                col_span: 1,
                row_span: 1,
                preferred_col: 1,
                preferred_row: 1,
                priority: 1,
                color: "#ffffff".to_string(),
                background_image: Some("data:image/png;base64,test".to_string()),
                background_video: None,
                background_style: None,
                hidden: false,
            },
        )
        .unwrap();
        assert_eq!(widget.category_id, category.id);

        let updated_widget = HomeLayoutService::update_widget(
            &db,
            &widget.id,
            UpdateHomeWidgetInput {
                category_id: None,
                label: Some("新卡片2".to_string()),
                icon: None,
                action: Some("open:updated".to_string()),
                source_type: None,
                widget_type: None,
                size_preset: None,
                widget_config: None,
                col: Some(2),
                row: Some(3),
                col_span: None,
                row_span: None,
                preferred_col: Some(2),
                preferred_row: Some(3),
                priority: Some(2),
                color: Some("#000000".to_string()),
                background_image: Some("data:image/png;base64,updated".to_string()),
                background_video: None,
                background_style: None,
                hidden: Some(true),
            },
        )
        .unwrap();
        assert_eq!(updated_widget.label, "新卡片2");
        assert_eq!(updated_widget.hidden, true);
        assert_eq!(
            updated_widget.background_image,
            Some("data:image/png;base64,updated".to_string())
        );

        let updated_category = HomeLayoutService::update_category(
            &db,
            &category.id,
            UpdateHomeCategoryInput {
                label: Some("自定义2".to_string()),
                icon: Some("category-dev".to_string()),
                sort_order: Some(88),
                background_color: None,
                background_image: None,
                background_video: None,
                background_style: None,
            },
        )
        .unwrap();
        assert_eq!(updated_category.label, "自定义2");

        HomeLayoutService::delete_category(&db, &category.id).unwrap();
        let layout = HomeLayoutService::get_layout_by_workspace_key(&db, "default").unwrap();
        assert!(layout
            .categories
            .iter()
            .all(|item| item.id != "category-custom"));
        assert!(layout
            .categories
            .iter()
            .flat_map(|item| item.widgets.iter())
            .all(|item| item.id != "grid-item-custom"));
    }

    #[test]
    fn test_import_home_layout_replaces_workspace_layout() {
        let db = Database::new_in_memory().unwrap();

        let imported = HomeLayoutService::import_layout(
            &db,
            "default",
            ImportHomeLayoutInput {
                categories: vec![ImportHomeCategoryInput {
                    id: "category-imported".to_string(),
                    label: "导入分类".to_string(),
                    icon: "category-tools".to_string(),
                    sort_order: 1,
                    background_color: None,
                    background_image: None,
                    background_video: None,
                    background_style: None,
                    widgets: vec![ImportHomeWidgetInput {
                        id: "grid-item-imported".to_string(),
                        label: "导入卡片".to_string(),
                        icon: Some("tool".to_string()),
                        action: Some("open:imported".to_string()),
                        source_type: Some("shortcut".to_string()),
                        widget_type: Some("shortcut".to_string()),
                        size_preset: None,
                        widget_config: None,
                        col: 1,
                        row: 1,
                        col_span: 2,
                        row_span: 1,
                        preferred_col: 1,
                        preferred_row: 1,
                        priority: 1,
                        color: "#123456".to_string(),
                        background_image: Some("data:image/png;base64,imported".to_string()),
                        background_video: None,
                        background_style: None,
                        hidden: false,
                    }],
                }],
            },
        )
        .unwrap();

        assert_eq!(imported.categories.len(), 1);
        assert_eq!(imported.categories[0].id, "category-imported");
        assert_eq!(imported.categories[0].widgets.len(), 1);
        assert_eq!(
            imported.categories[0].widgets[0].background_image,
            Some("data:image/png;base64,imported".to_string())
        );

        let layout = HomeLayoutService::get_layout_by_workspace_key(&db, "default").unwrap();
        assert_eq!(layout.categories.len(), 1);
        assert_eq!(layout.categories[0].widgets[0].priority, 1);
    }

    #[test]
    fn test_mobile_layout_override_isolated_from_desktop_layout() {
        let db = Database::new_in_memory().unwrap();

        let original = HomeLayoutService::get_layout_by_workspace_key(&db, "default").unwrap();
        let original_widget = original.categories[0]
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap()
            .clone();

        let updated_category = HomeLayoutService::save_mobile_category_layout(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_COMPACT,
            SaveMobileHomeCategoryLayoutInput {
                category_id: "category-tools".to_string(),
                widgets: vec![
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-1".to_string(),
                        col: 2,
                        row: 4,
                        col_span: 1,
                        row_span: 1,
                        preferred_col: 2,
                        preferred_row: 4,
                        priority: 7,
                        hidden: false,
                    },
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-2".to_string(),
                        col: 1,
                        row: 1,
                        col_span: 1,
                        row_span: 2,
                        preferred_col: 1,
                        preferred_row: 1,
                        priority: 2,
                        hidden: false,
                    },
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-3".to_string(),
                        col: 3,
                        row: 1,
                        col_span: 2,
                        row_span: 1,
                        preferred_col: 3,
                        preferred_row: 1,
                        priority: 3,
                        hidden: true,
                    },
                ],
            },
        )
        .unwrap();

        let mobile_widget = updated_category
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap();
        assert_eq!(mobile_widget.col, 2);
        assert_eq!(mobile_widget.row, 4);
        assert_eq!(mobile_widget.priority, 7);

        let desktop_layout =
            HomeLayoutService::get_layout_by_workspace_key(&db, "default").unwrap();
        let desktop_widget = desktop_layout.categories[0]
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap();
        assert_eq!(desktop_widget.col, original_widget.col);
        assert_eq!(desktop_widget.row, original_widget.row);
        assert_eq!(desktop_widget.priority, original_widget.priority);
    }

    #[test]
    fn test_mobile_layout_scopes_are_independent_and_resettable() {
        let db = Database::new_in_memory().unwrap();

        HomeLayoutService::save_mobile_category_layout(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_COMPACT,
            SaveMobileHomeCategoryLayoutInput {
                category_id: "category-tools".to_string(),
                widgets: vec![
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-1".to_string(),
                        col: 2,
                        row: 2,
                        col_span: 1,
                        row_span: 1,
                        preferred_col: 2,
                        preferred_row: 2,
                        priority: 4,
                        hidden: false,
                    },
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-2".to_string(),
                        col: 1,
                        row: 1,
                        col_span: 1,
                        row_span: 2,
                        preferred_col: 1,
                        preferred_row: 1,
                        priority: 2,
                        hidden: false,
                    },
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-3".to_string(),
                        col: 3,
                        row: 1,
                        col_span: 2,
                        row_span: 1,
                        preferred_col: 3,
                        preferred_row: 1,
                        priority: 3,
                        hidden: false,
                    },
                ],
            },
        )
        .unwrap();

        HomeLayoutService::save_mobile_category_layout(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_EXPANDED,
            SaveMobileHomeCategoryLayoutInput {
                category_id: "category-tools".to_string(),
                widgets: vec![
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-1".to_string(),
                        col: 5,
                        row: 1,
                        col_span: 1,
                        row_span: 1,
                        preferred_col: 5,
                        preferred_row: 1,
                        priority: 9,
                        hidden: true,
                    },
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-2".to_string(),
                        col: 1,
                        row: 1,
                        col_span: 1,
                        row_span: 2,
                        preferred_col: 1,
                        preferred_row: 1,
                        priority: 2,
                        hidden: false,
                    },
                    SaveMobileHomeWidgetLayoutInput {
                        widget_id: "grid-item-3".to_string(),
                        col: 3,
                        row: 1,
                        col_span: 2,
                        row_span: 1,
                        preferred_col: 3,
                        preferred_row: 1,
                        priority: 3,
                        hidden: false,
                    },
                ],
            },
        )
        .unwrap();

        let compact = HomeLayoutService::get_mobile_layout_by_workspace_key(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_COMPACT,
        )
        .unwrap();
        let expanded = HomeLayoutService::get_mobile_layout_by_workspace_key(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_EXPANDED,
        )
        .unwrap();

        let compact_widget = compact.categories[0]
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap();
        let expanded_widget = expanded.categories[0]
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap();
        assert_eq!(compact_widget.col, 2);
        assert_eq!(expanded_widget.col, 5);
        assert_eq!(expanded_widget.hidden, true);

        let reset = HomeLayoutService::reset_mobile_category_layout(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_COMPACT,
            "category-tools",
        )
        .unwrap();

        let reset_widget = reset
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap();
        assert_eq!(reset_widget.col, 1);
        assert_eq!(reset_widget.row, 1);

        let expanded_after_reset = HomeLayoutService::get_mobile_layout_by_workspace_key(
            &db,
            "default",
            HomeLayoutService::MOBILE_SCOPE_EXPANDED,
        )
        .unwrap();
        let expanded_widget_after_reset = expanded_after_reset.categories[0]
            .widgets
            .iter()
            .find(|item| item.id == "grid-item-1")
            .unwrap();
        assert_eq!(expanded_widget_after_reset.col, 5);
    }
}
