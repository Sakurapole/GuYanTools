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
