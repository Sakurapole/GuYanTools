use super::error::{DbError, DbResult};
use rusqlite::Connection;

/// 运行数据库迁移
pub fn run_migrations(conn: &Connection) -> DbResult<()> {
    // 创建迁移记录表
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        [],
    )
    .map_err(|e| DbError::MigrationFailed(format!("创建迁移表失败: {}", e)))?;

    // 定义迁移列表（按顺序执行）
    let migrations = vec![
        ("001_init", include_str!("../../migrations/001_init.sql")),
        (
            "002_add_projects",
            include_str!("../../migrations/002_add_projects.sql"),
        ),
        (
            "003_add_settings",
            include_str!("../../migrations/003_add_settings.sql"),
        ),
        (
            "004_add_home_layout",
            include_str!("../../migrations/004_add_home_layout.sql"),
        ),
        (
            "005_add_background_fields",
            include_str!("../../migrations/005_add_background_fields.sql"),
        ),
        (
            "006_add_todo",
            include_str!("../../migrations/006_add_todo.sql"),
        ),
        (
            "007_extend_home_widgets_builtin",
            include_str!("../../migrations/007_extend_home_widgets_builtin.sql"),
        ),
        (
            "008_extend_home_workspace_bg",
            include_str!("../../migrations/008_extend_home_workspace_bg.sql"),
        ),
        (
            "009_add_plugins_table",
            include_str!("../../migrations/009_add_plugins_table.sql"),
        ),
        (
            "010_add_ssh_profiles",
            include_str!("../../migrations/010_add_ssh_profiles.sql"),
        ),
        (
            "011_add_ftp_client",
            include_str!("../../migrations/011_add_ftp_client.sql"),
        ),
        (
            "012_add_ssh_port_forwards",
            include_str!("../../migrations/012_add_ssh_port_forwards.sql"),
        ),
        (
            "013_add_ssh_certificate_paths",
            include_str!("../../migrations/013_add_ssh_certificate_paths.sql"),
        ),
        (
            "014_add_ssh_managed_keys",
            include_str!("../../migrations/014_add_ssh_managed_keys.sql"),
        ),
        (
            "015_add_host_ca_key_paths",
            include_str!("../../migrations/015_add_host_ca_key_paths.sql"),
        ),
        (
            "016_extend_ftp_transfer_tree_history",
            include_str!("../../migrations/016_extend_ftp_transfer_tree_history.sql"),
        ),
        (
            "017_add_multi_device_clipboard",
            include_str!("../../migrations/017_add_multi_device_clipboard.sql"),
        ),
        (
            "018_add_mobile_home_layouts",
            include_str!("../../migrations/018_add_mobile_home_layouts.sql"),
        ),
        (
            "019_add_ssh_profile_folders",
            include_str!("../../migrations/019_add_ssh_profile_folders.sql"),
        ),
        (
            "020_add_todo_step_image",
            include_str!("../../migrations/020_add_todo_step_image.sql"),
        ),
        (
            "021_add_knowledge",
            include_str!("../../migrations/021_add_knowledge.sql"),
        ),
        (
            "022_add_knowledge_quick_notes",
            include_str!("../../migrations/022_add_knowledge_quick_notes.sql"),
        ),
        (
            "023_add_knowledge_search_fts",
            include_str!("../../migrations/023_add_knowledge_search_fts.sql"),
        ),
        (
            "024_add_ai_chat",
            include_str!("../../migrations/024_add_ai_chat.sql"),
        ),
    ];

    // 执行每个迁移
    for (name, sql) in migrations {
        // 检查迁移是否已应用
        let already_applied: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM _migrations WHERE name = ?1)",
                [name],
                |row| row.get(0),
            )
            .map_err(|e| DbError::MigrationFailed(format!("检查迁移状态失败: {}", e)))?;

        if !already_applied {
            // 执行迁移
            conn.execute_batch(sql)
                .map_err(|e| DbError::MigrationFailed(format!("执行迁移 {} 失败: {}", name, e)))?;

            // 记录迁移
            conn.execute("INSERT INTO _migrations (name) VALUES (?1)", [name])
                .map_err(|e| DbError::MigrationFailed(format!("记录迁移 {} 失败: {}", name, e)))?;

            println!("✓ 迁移 {} 已应用", name);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_run_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        let result = run_migrations(&conn);
        assert!(result.is_ok());

        // 验证迁移表已创建
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert!(count > 0);
    }
}
