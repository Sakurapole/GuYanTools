use super::error::{DbError, DbResult};
use super::migration::run_migrations;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::Arc;

/// 数据库连接池封装
#[derive(Clone)]
pub struct Database {
    pool: Arc<Pool<SqliteConnectionManager>>,
}

impl Database {
    /// 创建新的数据库实例
    ///
    /// # 参数
    /// - `path`: 数据库文件路径
    ///
    /// # 示例
    /// ```no_run
    /// use multi_platform_core::Database;
    ///
    /// let db = Database::new("./data.db").unwrap();
    /// ```
    pub fn new<P: AsRef<Path>>(path: P) -> DbResult<Self> {
        let path_str = path
            .as_ref()
            .to_str()
            .ok_or_else(|| DbError::InvalidParameter("无效的数据库路径".to_string()))?;

        // 创建连接管理器
        let manager = SqliteConnectionManager::file(path_str)
            .with_flags(
                OpenFlags::SQLITE_OPEN_READ_WRITE
                    | OpenFlags::SQLITE_OPEN_CREATE
                    | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .with_init(|conn| {
                // 启用外键约束
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                // 设置 WAL 模式以提高并发性能
                conn.execute_batch("PRAGMA journal_mode = WAL;")?;
                Ok(())
            });

        // 创建连接池
        let pool = Pool::builder()
            .max_size(15) // 最大连接数
            .build(manager)
            .map_err(|e| DbError::ConnectionFailed(e.to_string()))?;

        let db = Database {
            pool: Arc::new(pool),
        };

        // 运行数据库迁移
        db.with_connection(|conn| run_migrations(conn))?;

        Ok(db)
    }

    /// 在内存中创建数据库（用于测试）
    pub fn new_in_memory() -> DbResult<Self> {
        let manager = SqliteConnectionManager::memory().with_init(|conn| {
            conn.execute_batch("PRAGMA foreign_keys = ON;")?;
            Ok(())
        });

        let pool = Pool::builder()
            .max_size(1)
            .connection_timeout(std::time::Duration::from_secs(5))
            .build(manager)
            .map_err(|e| DbError::ConnectionFailed(e.to_string()))?;

        let db = Database {
            pool: Arc::new(pool),
        };

        db.with_connection(|conn| run_migrations(conn))?;

        Ok(db)
    }

    /// 执行需要数据库连接的闭包
    ///
    /// # 参数
    /// - `f`: 接收 `&Connection` 的闭包
    ///
    /// # 示例
    /// ```no_run
    /// # use multi_platform_core::Database;
    /// # let db = Database::new_in_memory().unwrap();
    /// db.with_connection(|conn| {
    ///     conn.execute("INSERT INTO users (name) VALUES (?1)", ["Alice"])?;
    ///     Ok(())
    /// }).unwrap();
    /// ```
    pub fn with_connection<F, T>(&self, f: F) -> DbResult<T>
    where
        F: FnOnce(&Connection) -> DbResult<T>,
    {
        let conn = self.pool.get()?;
        f(&conn)
    }

    /// 执行事务
    ///
    /// # 参数
    /// - `f`: 接收 `&Connection` 的闭包，在事务中执行
    ///
    /// # 示例
    /// ```no_run
    /// # use multi_platform_core::Database;
    /// # let db = Database::new_in_memory().unwrap();
    /// db.transaction(|conn| {
    ///     conn.execute("INSERT INTO users (name) VALUES (?1)", ["Alice"])?;
    ///     conn.execute("INSERT INTO users (name) VALUES (?1)", ["Bob"])?;
    ///     Ok(())
    /// }).unwrap();
    /// ```
    pub fn transaction<F, T>(&self, f: F) -> DbResult<T>
    where
        F: FnOnce(&Connection) -> DbResult<T>,
    {
        let mut conn = self.pool.get()?;
        let tx = conn
            .transaction()
            .map_err(|e| DbError::QueryFailed(e.to_string()))?;

        let result = f(&tx)?;

        tx.commit()
            .map_err(|e| DbError::QueryFailed(e.to_string()))?;

        Ok(result)
    }
}

// 实现 Send 和 Sync，使其可以在多线程环境中使用
unsafe impl Send for Database {}
unsafe impl Sync for Database {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_in_memory_db() {
        let db = Database::new_in_memory();
        assert!(db.is_ok());
    }

    #[test]
    fn test_with_connection() {
        let db = Database::new_in_memory().unwrap();
        let result = db.with_connection(|conn| {
            let _: i32 = conn.query_row("SELECT 1", [], |row| row.get(0))?;
            Ok(42)
        });
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn test_transaction() {
        let db = Database::new_in_memory().unwrap();
        let result = db.transaction(|conn| {
            let _: i32 = conn.query_row("SELECT 1", [], |row| row.get(0))?;
            Ok(100)
        });
        assert_eq!(result.unwrap(), 100);
    }
}
