use thiserror::Error;

/// 数据库错误类型
#[derive(Error, Debug)]
pub enum DbError {
    #[error("数据库连接失败: {0}")]
    ConnectionFailed(String),

    #[error("数据库查询失败: {0}")]
    QueryFailed(String),

    #[error("记录未找到: {0}")]
    NotFound(String),

    #[error("唯一约束冲突: {0}")]
    UniqueConstraintViolation(String),

    #[error("外键约束冲突: {0}")]
    ForeignKeyViolation(String),

    #[error("数据库迁移失败: {0}")]
    MigrationFailed(String),

    #[error("序列化/反序列化失败: {0}")]
    SerializationError(String),

    #[error("无效的参数: {0}")]
    InvalidParameter(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => {
                DbError::NotFound("查询未返回任何结果".to_string())
            }
            rusqlite::Error::SqliteFailure(err, msg) => {
                // 检查是否是唯一约束冲突
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    if let Some(ref msg_str) = msg {
                        if msg_str.contains("UNIQUE") {
                            return DbError::UniqueConstraintViolation(msg_str.clone());
                        } else if msg_str.contains("FOREIGN KEY") {
                            return DbError::ForeignKeyViolation(msg_str.clone());
                        }
                    }
                }
                DbError::QueryFailed(format!("{:?}: {:?}", err, msg))
            }
            _ => DbError::QueryFailed(err.to_string()),
        }
    }
}

impl From<r2d2::Error> for DbError {
    fn from(err: r2d2::Error) -> Self {
        DbError::ConnectionFailed(err.to_string())
    }
}

impl From<serde_json::Error> for DbError {
    fn from(err: serde_json::Error) -> Self {
        DbError::SerializationError(err.to_string())
    }
}

pub type DbResult<T> = Result<T, DbError>;
