use crate::db::{Database, DbResult};
use crate::models::{CreateUserInput, UpdateUserInput, User};
use rusqlite::params;

/// 用户服务
pub struct UserService;

impl UserService {
    /// 创建用户
    pub fn create(db: &Database, input: CreateUserInput) -> DbResult<User> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO users (name, email, avatar) VALUES (?1, ?2, ?3)",
                params![input.name, input.email, input.avatar],
            )?;

            let id = conn.last_insert_rowid();

            // 在同一连接中查询刚创建的用户
            let user = conn.query_row(
                "SELECT id, name, email, avatar, created_at, updated_at FROM users WHERE id = ?1",
                params![id],
                |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        email: row.get(2)?,
                        avatar: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )?;
            Ok(user)
        })
    }

    /// 根据 ID 获取用户
    pub fn get_by_id(db: &Database, id: i64) -> DbResult<User> {
        db.with_connection(|conn| {
            let user = conn.query_row(
                "SELECT id, name, email, avatar, created_at, updated_at FROM users WHERE id = ?1",
                params![id],
                |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        email: row.get(2)?,
                        avatar: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )?;
            Ok(user)
        })
    }

    /// 根据邮箱获取用户
    pub fn get_by_email(db: &Database, email: &str) -> DbResult<User> {
        db.with_connection(|conn| {
            let user = conn.query_row(
                "SELECT id, name, email, avatar, created_at, updated_at FROM users WHERE email = ?1",
                params![email],
                |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        email: row.get(2)?,
                        avatar: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )?;
            Ok(user)
        })
    }

    /// 列出所有用户（支持分页）
    pub fn list(db: &Database, offset: i64, limit: i64) -> DbResult<Vec<User>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, email, avatar, created_at, updated_at 
                 FROM users 
                 ORDER BY created_at DESC 
                 LIMIT ?1 OFFSET ?2",
            )?;

            let users = stmt
                .query_map(params![limit, offset], |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        email: row.get(2)?,
                        avatar: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(users)
        })
    }

    /// 更新用户
    pub fn update(db: &Database, id: i64, input: UpdateUserInput) -> DbResult<User> {
        db.with_connection(|conn| {
            // 构建动态更新 SQL
            let mut updates = Vec::new();
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

            if let Some(name) = input.name {
                updates.push("name = ?");
                params_vec.push(Box::new(name));
            }
            if let Some(email) = input.email {
                updates.push("email = ?");
                params_vec.push(Box::new(email));
            }
            if let Some(avatar) = input.avatar {
                updates.push("avatar = ?");
                params_vec.push(Box::new(avatar));
            }

            if !updates.is_empty() {
                updates.push("updated_at = datetime('now')");
                params_vec.push(Box::new(id));

                let sql = format!("UPDATE users SET {} WHERE id = ?", updates.join(", "));

                let params_refs: Vec<&dyn rusqlite::ToSql> =
                    params_vec.iter().map(|p| p.as_ref()).collect();

                conn.execute(&sql, params_refs.as_slice())?;
            }

            // 在同一连接中查询更新后的用户
            let user = conn.query_row(
                "SELECT id, name, email, avatar, created_at, updated_at FROM users WHERE id = ?1",
                params![id],
                |row| {
                    Ok(User {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        email: row.get(2)?,
                        avatar: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )?;
            Ok(user)
        })
    }

    /// 删除用户
    pub fn delete(db: &Database, id: i64) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM users WHERE id = ?1", params![id])?;
            Ok(())
        })
    }

    /// 统计用户总数
    pub fn count(db: &Database) -> DbResult<i64> {
        db.with_connection(|conn| {
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
            Ok(count)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_crud() {
        let db = Database::new_in_memory().unwrap();

        // 创建用户
        let user = UserService::create(
            &db,
            CreateUserInput {
                name: "Alice".to_string(),
                email: Some("alice@example.com".to_string()),
                avatar: None,
            },
        )
        .unwrap();

        assert_eq!(user.name, "Alice");
        assert_eq!(user.email, Some("alice@example.com".to_string()));

        // 获取用户
        let fetched = UserService::get_by_id(&db, user.id).unwrap();
        assert_eq!(fetched.id, user.id);

        // 更新用户
        let updated = UserService::update(
            &db,
            user.id,
            UpdateUserInput {
                name: Some("Alice Updated".to_string()),
                email: None,
                avatar: None,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Alice Updated");

        // 列出用户
        let users = UserService::list(&db, 0, 10).unwrap();
        assert_eq!(users.len(), 1);

        // 删除用户
        UserService::delete(&db, user.id).unwrap();
        let count = UserService::count(&db).unwrap();
        assert_eq!(count, 0);
    }
}
