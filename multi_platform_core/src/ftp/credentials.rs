use anyhow::{anyhow, Result};

use crate::crypto::decrypt_credential;
pub(super) use crate::crypto::encrypt_credential;

impl super::FtpManager {
    pub(super) fn load_credential_from_table(
        &self,
        table: &str,
        id_column: &str,
        id: &str,
        credential_type: &str,
    ) -> Result<Option<String>> {
        let encrypted = self
            .inner
            .db
            .with_connection(|conn| {
                use rusqlite::OptionalExtension;

                let sql = format!(
                    "SELECT encrypted_value FROM {} WHERE {} = ?1 AND credential_type = ?2",
                    table, id_column
                );
                conn.query_row(&sql, rusqlite::params![id, credential_type], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
                .map(|value| value.flatten())
            })
            .map_err(|e| anyhow!("{}", e))?;

        encrypted
            .map(|ciphertext| decrypt_credential(&ciphertext))
            .transpose()
    }

    pub(super) fn load_private_key_path(
        &self,
        table: &str,
        id_column: &str,
        id: &str,
    ) -> Result<Option<String>> {
        self.inner
            .db
            .with_connection(|conn| {
                use rusqlite::OptionalExtension;

                let sql = format!(
                    "SELECT private_key_path FROM {} WHERE {} = ?1",
                    table, id_column
                );
                conn.query_row(&sql, rusqlite::params![id], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
                .map(|value| value.flatten())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub(super) fn load_certificate_path(
        &self,
        table: &str,
        id_column: &str,
        id: &str,
    ) -> Result<Option<String>> {
        self.inner
            .db
            .with_connection(|conn| {
                use rusqlite::OptionalExtension;

                let sql = format!(
                    "SELECT certificate_path FROM {} WHERE {} = ?1",
                    table, id_column
                );
                conn.query_row(&sql, rusqlite::params![id], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
                .map(|value| value.flatten())
            })
            .map_err(|e| anyhow!("{}", e))
    }
}
