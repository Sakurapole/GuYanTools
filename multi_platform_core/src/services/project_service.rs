use crate::db::{Database, DbResult};
use crate::models::{CreateProjectInput, Project, UpdateProjectInput};
use rusqlite::params;

/// 项目服务
pub struct ProjectService;

impl ProjectService {
    /// 创建项目
    pub fn create(db: &Database, input: CreateProjectInput) -> DbResult<Project> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO projects (name, description, owner_id) VALUES (?1, ?2, ?3)",
                params![input.name, input.description, input.owner_id],
            )?;

            let id = conn.last_insert_rowid();

            // 在同一连接中查询刚创建的项目
            let project = conn.query_row(
                "SELECT id, name, description, owner_id, status, created_at, updated_at 
                 FROM projects WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Project {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        owner_id: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )?;
            Ok(project)
        })
    }

    /// 根据 ID 获取项目
    pub fn get_by_id(db: &Database, id: i64) -> DbResult<Project> {
        db.with_connection(|conn| {
            let project = conn.query_row(
                "SELECT id, name, description, owner_id, status, created_at, updated_at 
                 FROM projects WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Project {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        owner_id: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )?;
            Ok(project)
        })
    }

    /// 根据所有者 ID 列出项目
    pub fn list_by_owner(
        db: &Database,
        owner_id: i64,
        offset: i64,
        limit: i64,
    ) -> DbResult<Vec<Project>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, description, owner_id, status, created_at, updated_at 
                 FROM projects 
                 WHERE owner_id = ?1
                 ORDER BY created_at DESC 
                 LIMIT ?2 OFFSET ?3",
            )?;

            let projects = stmt
                .query_map(params![owner_id, limit, offset], |row| {
                    Ok(Project {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        owner_id: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(projects)
        })
    }

    /// 列出所有项目
    pub fn list(db: &Database, offset: i64, limit: i64) -> DbResult<Vec<Project>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, description, owner_id, status, created_at, updated_at 
                 FROM projects 
                 ORDER BY created_at DESC 
                 LIMIT ?1 OFFSET ?2",
            )?;

            let projects = stmt
                .query_map(params![limit, offset], |row| {
                    Ok(Project {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        owner_id: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;

            Ok(projects)
        })
    }

    /// 更新项目
    pub fn update(db: &Database, id: i64, input: UpdateProjectInput) -> DbResult<Project> {
        db.with_connection(|conn| {
            let mut updates = Vec::new();
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

            if let Some(name) = input.name {
                updates.push("name = ?");
                params_vec.push(Box::new(name));
            }
            if let Some(description) = input.description {
                updates.push("description = ?");
                params_vec.push(Box::new(description));
            }
            if let Some(status) = input.status {
                updates.push("status = ?");
                params_vec.push(Box::new(status));
            }

            if !updates.is_empty() {
                updates.push("updated_at = datetime('now')");
                params_vec.push(Box::new(id));

                let sql = format!("UPDATE projects SET {} WHERE id = ?", updates.join(", "));

                let params_refs: Vec<&dyn rusqlite::ToSql> =
                    params_vec.iter().map(|p| p.as_ref()).collect();

                conn.execute(&sql, params_refs.as_slice())?;
            }

            // 在同一连接中查询更新后的项目
            let project = conn.query_row(
                "SELECT id, name, description, owner_id, status, created_at, updated_at 
                 FROM projects WHERE id = ?1",
                params![id],
                |row| {
                    Ok(Project {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        owner_id: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )?;
            Ok(project)
        })
    }

    /// 删除项目
    pub fn delete(db: &Database, id: i64) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CreateUserInput;
    use crate::services::UserService;

    #[test]
    fn test_project_crud() {
        let db = Database::new_in_memory().unwrap();

        // 先创建用户
        let user = UserService::create(
            &db,
            CreateUserInput {
                name: "Alice".to_string(),
                email: Some("alice@example.com".to_string()),
                avatar: None,
            },
        )
        .unwrap();

        // 创建项目
        let project = ProjectService::create(
            &db,
            CreateProjectInput {
                name: "Test Project".to_string(),
                description: Some("A test project".to_string()),
                owner_id: user.id,
            },
        )
        .unwrap();

        assert_eq!(project.name, "Test Project");
        assert_eq!(project.owner_id, user.id);

        // 列出项目
        let projects = ProjectService::list_by_owner(&db, user.id, 0, 10).unwrap();
        assert_eq!(projects.len(), 1);

        // 更新项目
        let updated = ProjectService::update(
            &db,
            project.id,
            UpdateProjectInput {
                name: Some("Updated Project".to_string()),
                description: None,
                status: Some("completed".to_string()),
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Updated Project");
        assert_eq!(updated.status, "completed");

        // 删除项目
        ProjectService::delete(&db, project.id).unwrap();
        let projects = ProjectService::list(&db, 0, 10).unwrap();
        assert_eq!(projects.len(), 0);
    }
}
