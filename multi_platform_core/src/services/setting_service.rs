use crate::db::{Database, DbResult};
use crate::models::{Setting, UpsertSettingInput};
use rusqlite::params;

/// 设置服务
pub struct SettingService;

impl SettingService {
    /// 获取设置
    pub fn get(db: &Database, key: &str) -> DbResult<Setting> {
        db.with_connection(|conn| {
            let setting = conn.query_row(
                "SELECT id, key, value, description, created_at, updated_at FROM settings WHERE key = ?1",
                params![key],
                |row| {
                    Ok(Setting {
                        id: row.get(0)?,
                        key: row.get(1)?,
                        value: row.get(2)?,
                        description: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )?;
            Ok(setting)
        })
    }

    /// 获取设置值（简化版）
    pub fn get_value(db: &Database, key: &str) -> DbResult<String> {
        db.with_connection(|conn| {
            let value: String = conn.query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )?;
            Ok(value)
        })
    }

    /// 列出所有设置
    pub fn list(db: &Database) -> DbResult<Vec<Setting>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, key, value, description, created_at, updated_at 
                 FROM settings 
                 ORDER BY key",
            )?;

            let settings = stmt
                .query_map([], |row| {
                    Ok(Setting {
                        id: row.get(0)?,
                        key: row.get(1)?,
                        value: row.get(2)?,
                        description: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(settings)
        })
    }

    /// 创建或更新设置
    pub fn upsert(db: &Database, input: UpsertSettingInput) -> DbResult<Setting> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value, description) VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET 
                    value = excluded.value,
                    description = excluded.description,
                    updated_at = datetime('now')",
                params![input.key, input.value, input.description],
            )?;

            // 在同一连接中查询设置
            let setting = conn.query_row(
                "SELECT id, key, value, description, created_at, updated_at FROM settings WHERE key = ?1",
                params![input.key],
                |row| {
                    Ok(Setting {
                        id: row.get(0)?,
                        key: row.get(1)?,
                        value: row.get(2)?,
                        description: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )?;
            Ok(setting)
        })
    }

    /// 删除设置
    pub fn delete(db: &Database, key: &str) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_setting_operations() {
        let db = Database::new_in_memory().unwrap();

        // 列出默认设置
        let settings = SettingService::list(&db).unwrap();
        assert!(settings.len() >= 3); // 至少有 3 个默认设置

        // 获取设置
        let theme = SettingService::get(&db, "theme").unwrap();
        assert_eq!(theme.value, "light");

        // 更新设置
        let updated = SettingService::upsert(
            &db,
            UpsertSettingInput {
                key: "theme".to_string(),
                value: "dark".to_string(),
                description: Some("主题设置".to_string()),
            },
        )
        .unwrap();
        assert_eq!(updated.value, "dark");

        // 创建新设置
        let new_setting = SettingService::upsert(
            &db,
            UpsertSettingInput {
                key: "font_size".to_string(),
                value: "14".to_string(),
                description: Some("字体大小".to_string()),
            },
        )
        .unwrap();
        assert_eq!(new_setting.key, "font_size");

        // 获取设置值
        let value = SettingService::get_value(&db, "font_size").unwrap();
        assert_eq!(value, "14");

        // 删除设置
        SettingService::delete(&db, "font_size").unwrap();
        let result = SettingService::get(&db, "font_size");
        assert!(result.is_err());
    }
}
