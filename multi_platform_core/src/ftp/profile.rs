use anyhow::{anyhow, Result};
use uuid::Uuid;

use super::credentials::encrypt_credential;
use super::*;

impl super::FtpManager {
    pub fn list_profiles(&self) -> Result<Vec<FtpProfile>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT s.id, s.label, s.protocol, s.host, s.port, s.username, s.auth_type, s.save_password,
                                c.private_key_path, c.certificate_path, s.host_ca_key_path, s.ssh_profile_id,
                                s.folder_id, s.sort_order, s.default_remote_path, s.default_local_path,
                                s.max_concurrent, s.created_at, s.updated_at
                         FROM ftp_sessions s
                         LEFT JOIN ftp_credentials c ON c.session_id = s.id
                         ORDER BY s.sort_order ASC, s.created_at ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(FtpProfile {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            protocol: row.get(2)?,
                            host: row.get(3)?,
                            port: row.get::<_, i64>(4)? as u32,
                            username: row.get(5)?,
                            auth_type: row.get(6)?,
                            save_password: row.get::<_, i64>(7)? != 0,
                            private_key_path: row.get(8)?,
                            certificate_path: row.get(9)?,
                            host_ca_key_path: row.get(10)?,
                            ssh_profile_id: row.get(11)?,
                            folder_id: row.get(12)?,
                            sort_order: row.get(13)?,
                            default_remote_path: row.get(14)?,
                            default_local_path: row.get(15)?,
                            max_concurrent: row.get::<_, i64>(16)? as u32,
                            created_at: row.get(17)?,
                            updated_at: row.get(18)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn list_folders(&self) -> Result<Vec<FtpSessionFolder>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, label, parent_id, sort_order, created_at
                         FROM ftp_session_folders
                         ORDER BY sort_order ASC, created_at ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(FtpSessionFolder {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            parent_id: row.get(2)?,
                            sort_order: row.get(3)?,
                            created_at: row.get(4)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn create_folder(&self, input: CreateFtpSessionFolderInput) -> Result<FtpSessionFolder> {
        let id = Uuid::new_v4().to_string();
        let created_at = unix_now();
        let parent_id = normalize_optional_id(input.parent_id.as_deref());
        self.validate_folder_parent(None, parent_id.as_deref())?;
        let sort_order = self.next_folder_sort_order(parent_id.as_deref())?;

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ftp_session_folders (id, label, parent_id, sort_order, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![id, input.label.trim(), parent_id, sort_order, created_at],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_folder(&id)
    }

    pub fn update_folder(&self, input: UpdateFtpSessionFolderInput) -> Result<FtpSessionFolder> {
        self.validate_folder_parent(
            Some(&input.id),
            normalize_optional_id(input.parent_id.as_deref()).as_deref(),
        )?;
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "UPDATE ftp_session_folders SET
                        label = COALESCE(?2, label),
                        parent_id = CASE
                            WHEN ?3 IS NULL THEN parent_id
                            WHEN ?3 = '' THEN NULL
                            ELSE ?3
                        END,
                        sort_order = COALESCE(?4, sort_order)
                     WHERE id = ?1",
                    rusqlite::params![input.id, input.label, input.parent_id, input.sort_order],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_folder(&input.id)
    }

    pub fn delete_folder(&self, id: String) -> Result<()> {
        let folders = self.list_folders()?;
        let mut stack = vec![id.clone()];
        let mut folder_ids = Vec::new();

        while let Some(current_id) = stack.pop() {
            folder_ids.push(current_id.clone());
            for folder in folders
                .iter()
                .filter(|folder| folder.parent_id.as_deref() == Some(current_id.as_str()))
            {
                stack.push(folder.id.clone());
            }
        }

        self.inner
            .db
            .with_connection(|conn| {
                for folder_id in &folder_ids {
                    conn.execute(
                        "UPDATE ftp_sessions SET folder_id = NULL WHERE folder_id = ?1",
                        rusqlite::params![folder_id],
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                }

                for folder_id in folder_ids.iter().rev() {
                    conn.execute(
                        "DELETE FROM ftp_session_folders WHERE id = ?1",
                        rusqlite::params![folder_id],
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                }

                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn get_folder(&self, id: &str) -> Result<FtpSessionFolder> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT id, label, parent_id, sort_order, created_at
                     FROM ftp_session_folders
                     WHERE id = ?1",
                    rusqlite::params![id],
                    |row| {
                        Ok(FtpSessionFolder {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            parent_id: row.get(2)?,
                            sort_order: row.get(3)?,
                            created_at: row.get(4)?,
                        })
                    },
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn validate_folder_parent(
        &self,
        folder_id: Option<&str>,
        parent_id: Option<&str>,
    ) -> Result<()> {
        let Some(parent_id) = parent_id else {
            return Ok(());
        };

        let folders = self.list_folders()?;
        if !folders.iter().any(|folder| folder.id == parent_id) {
            return Err(anyhow!("Parent FTP folder '{}' not found", parent_id));
        }

        if let Some(folder_id) = folder_id {
            if folder_id == parent_id {
                return Err(anyhow!("A folder cannot be moved into itself"));
            }

            let mut stack = vec![parent_id.to_string()];
            while let Some(current_id) = stack.pop() {
                if current_id == folder_id {
                    return Err(anyhow!(
                        "A folder cannot be moved into one of its descendants"
                    ));
                }
                for folder in folders
                    .iter()
                    .filter(|folder| folder.parent_id.as_deref() == Some(current_id.as_str()))
                {
                    stack.push(folder.id.clone());
                }
            }
        }

        Ok(())
    }

    pub fn get_profile(&self, id: &str) -> Result<FtpProfile> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT s.id, s.label, s.protocol, s.host, s.port, s.username, s.auth_type, s.save_password,
                            c.private_key_path, c.certificate_path, s.host_ca_key_path, s.ssh_profile_id,
                            s.folder_id, s.sort_order, s.default_remote_path, s.default_local_path,
                            s.max_concurrent, s.created_at, s.updated_at
                     FROM ftp_sessions s
                     LEFT JOIN ftp_credentials c ON c.session_id = s.id
                     WHERE s.id = ?1",
                    rusqlite::params![id],
                    |row| {
                        Ok(FtpProfile {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            protocol: row.get(2)?,
                            host: row.get(3)?,
                            port: row.get::<_, i64>(4)? as u32,
                            username: row.get(5)?,
                            auth_type: row.get(6)?,
                            save_password: row.get::<_, i64>(7)? != 0,
                            private_key_path: row.get(8)?,
                            certificate_path: row.get(9)?,
                            host_ca_key_path: row.get(10)?,
                            ssh_profile_id: row.get(11)?,
                            folder_id: row.get(12)?,
                            sort_order: row.get(13)?,
                            default_remote_path: row.get(14)?,
                            default_local_path: row.get(15)?,
                            max_concurrent: row.get::<_, i64>(16)? as u32,
                            created_at: row.get(17)?,
                            updated_at: row.get(18)?,
                        })
                    },
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn create_profile(&self, input: CreateFtpProfileInput) -> Result<FtpProfile> {
        let protocol = if input.protocol.trim().is_empty() {
            "sftp".to_string()
        } else {
            input.protocol.trim().to_lowercase()
        };
        if !matches!(protocol.as_str(), "sftp" | "ftp" | "ftps") {
            return Err(anyhow!("unsupported FTP protocol '{}'", protocol));
        }

        let id = Uuid::new_v4().to_string();
        let now = unix_now();
        let sort_order = self.next_sort_order()?;
        let auth_type = input
            .auth_type
            .clone()
            .unwrap_or_else(|| "password".to_string());
        let supports_ssh_auth = protocol == "sftp";
        if supports_ssh_auth {
            if !matches!(
                auth_type.as_str(),
                "password" | "privateKey" | "keyboardInteractive"
            ) {
                return Err(anyhow!("unsupported FTP auth type '{}'", auth_type));
            }
        } else if auth_type != "password" {
            return Err(anyhow!("unsupported FTP auth type '{}'", auth_type));
        }
        let host = input.host.clone().unwrap_or_default();
        let username = input.username.clone().unwrap_or_default();
        let save_password =
            input.save_password.unwrap_or(false) && auth_type != "keyboardInteractive";

        if input.ssh_profile_id.is_none() && (host.is_empty() || username.is_empty()) {
            return Err(anyhow!(
                "Host and username are required for direct FTP profiles"
            ));
        }

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ftp_sessions
                        (id, label, protocol, host, port, username, auth_type, save_password,
                         host_ca_key_path, ssh_profile_id, folder_id, sort_order,
                         default_remote_path, default_local_path, max_concurrent, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                    rusqlite::params![
                        id,
                        input.label,
                        protocol,
                        host,
                        input.port.unwrap_or(default_port_for_protocol(&protocol)) as i64,
                        username,
                        auth_type,
                        save_password as i64,
                        input.host_ca_key_path,
                        input.ssh_profile_id,
                        normalize_optional_id(input.folder_id.as_deref()),
                        sort_order,
                        normalize_remote_path(input.default_remote_path.as_deref().unwrap_or("/")),
                        input.default_local_path.clone().unwrap_or_default(),
                        input.max_concurrent.unwrap_or(3).clamp(1, 10) as i64,
                        now,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                if input.ssh_profile_id.is_none() {
                    self.persist_profile_credentials(
                        conn,
                        &id,
                        &auth_type,
                        save_password,
                        input.password.as_deref(),
                        input.private_key_path.as_deref(),
                        input.certificate_path.as_deref(),
                        input.private_key_passphrase.as_deref(),
                    )?;
                }

                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_profile(&id)
    }

    pub fn update_profile(&self, input: UpdateFtpProfileInput) -> Result<FtpProfile> {
        let existing = self.get_profile(&input.id)?;
        let protocol = input
            .protocol
            .clone()
            .unwrap_or_else(|| existing.protocol.clone());
        if !matches!(protocol.as_str(), "sftp" | "ftp" | "ftps") {
            return Err(anyhow!("unsupported FTP protocol '{}'", protocol));
        }

        let host = input.host.clone().unwrap_or(existing.host.clone());
        let username = input.username.clone().unwrap_or(existing.username.clone());
        let ssh_profile_id = input
            .ssh_profile_id
            .clone()
            .or(existing.ssh_profile_id.clone());
        if ssh_profile_id.is_none() && (host.is_empty() || username.is_empty()) {
            return Err(anyhow!(
                "Host and username are required for direct FTP profiles"
            ));
        }

        let auth_type = input
            .auth_type
            .clone()
            .unwrap_or_else(|| existing.auth_type.clone());
        let supports_ssh_auth = protocol == "sftp";
        if supports_ssh_auth {
            if !matches!(
                auth_type.as_str(),
                "password" | "privateKey" | "keyboardInteractive"
            ) {
                return Err(anyhow!("unsupported FTP auth type '{}'", auth_type));
            }
        } else if auth_type != "password" {
            return Err(anyhow!("unsupported FTP auth type '{}'", auth_type));
        }
        let save_password = input.save_password.unwrap_or(existing.save_password)
            && auth_type != "keyboardInteractive";

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "UPDATE ftp_sessions SET
                        label = COALESCE(?2, label),
                        protocol = COALESCE(?3, protocol),
                        host = COALESCE(?4, host),
                        port = COALESCE(?5, port),
                        username = COALESCE(?6, username),
                        auth_type = COALESCE(?7, auth_type),
                        save_password = COALESCE(?8, save_password),
                        host_ca_key_path = COALESCE(?9, host_ca_key_path),
                        ssh_profile_id = COALESCE(?10, ssh_profile_id),
                        folder_id = CASE
                            WHEN ?11 IS NULL THEN folder_id
                            WHEN ?11 = '' THEN NULL
                            ELSE ?11
                        END,
                        sort_order = COALESCE(?12, sort_order),
                        default_remote_path = COALESCE(?13, default_remote_path),
                        default_local_path = COALESCE(?14, default_local_path),
                        max_concurrent = COALESCE(?15, max_concurrent),
                        updated_at = ?16
                     WHERE id = ?1",
                    rusqlite::params![
                        input.id,
                        input.label,
                        input.protocol,
                        input.host,
                        input.port.map(|value| value as i64),
                        input.username,
                        input.auth_type,
                        input.save_password.map(|value| value as i64),
                        input.host_ca_key_path,
                        input.ssh_profile_id,
                        input.folder_id,
                        input.sort_order,
                        input
                            .default_remote_path
                            .as_deref()
                            .map(normalize_remote_path),
                        input.default_local_path,
                        input.max_concurrent.map(|value| value.clamp(1, 10) as i64),
                        unix_now(),
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                match ssh_profile_id {
                    Some(_) => {
                        conn.execute(
                            "DELETE FROM ftp_credentials WHERE session_id = ?1",
                            rusqlite::params![input.id],
                        )
                        .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                    }
                    None => {
                        self.persist_profile_credentials(
                            conn,
                            &input.id,
                            &auth_type,
                            save_password,
                            input.password.as_deref(),
                            input.private_key_path.as_deref(),
                            input.certificate_path.as_deref(),
                            input.private_key_passphrase.as_deref(),
                        )?;
                    }
                }

                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_profile(&input.id)
    }

    pub fn delete_profile(&self, id: &str) -> Result<()> {
        let active_count = {
            let sessions = self
                .inner
                .sessions
                .read()
                .map_err(|_| anyhow!("ftp sessions lock poisoned"))?;
            sessions
                .values()
                .filter(|session| {
                    session
                        .descriptor
                        .lock()
                        .ok()
                        .is_some_and(|descriptor| descriptor.profile_id == id)
                })
                .count()
        };

        if active_count > 0 {
            return Err(anyhow!(
                "Disconnect active file transfer sessions before deleting this profile"
            ));
        }

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ftp_restore_state WHERE session_id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                conn.execute(
                    "DELETE FROM ftp_sessions WHERE id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn list_restore_states(&self) -> Result<Vec<FtpRestoreState>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, session_id, tab_order, remote_path, local_path, panel_layout_json, updated_at
                         FROM ftp_restore_state
                         ORDER BY tab_order ASC, updated_at ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(FtpRestoreState {
                            id: row.get(0)?,
                            session_id: row.get(1)?,
                            tab_order: row.get(2)?,
                            remote_path: row.get(3)?,
                            local_path: row.get(4)?,
                            panel_layout_json: row.get(5)?,
                            updated_at: row.get(6)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn upsert_restore_state(
        &self,
        input: UpsertFtpRestoreStateInput,
    ) -> Result<FtpRestoreState> {
        let updated_at = unix_now();
        let id = input.session_id.clone();
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ftp_restore_state
                        (id, session_id, tab_order, remote_path, local_path, panel_layout_json, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                     ON CONFLICT(id) DO UPDATE SET
                        session_id = excluded.session_id,
                        tab_order = excluded.tab_order,
                        remote_path = excluded.remote_path,
                        local_path = excluded.local_path,
                        panel_layout_json = excluded.panel_layout_json,
                        updated_at = excluded.updated_at",
                    rusqlite::params![
                        id,
                        input.session_id,
                        input.tab_order,
                        normalize_remote_path(&input.remote_path),
                        input.local_path,
                        input.panel_layout_json,
                        updated_at,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.list_restore_states()?
            .into_iter()
            .find(|state| state.id == id)
            .ok_or_else(|| anyhow!("Upserted FTP restore state '{}' not found", id))
    }

    pub fn delete_restore_state(&self, session_id: &str) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ftp_restore_state WHERE session_id = ?1 OR id = ?1",
                    rusqlite::params![session_id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn next_sort_order(&self) -> Result<i64> {
        self.inner
            .db
            .with_connection(|conn| {
                let max_value = conn
                    .query_row(
                        "SELECT COALESCE(MAX(sort_order), 0) FROM ftp_sessions",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap_or(0);
                Ok(max_value + 1)
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn next_folder_sort_order(&self, parent_id: Option<&str>) -> Result<i64> {
        let parent_id = normalize_optional_id(parent_id);
        self.inner
            .db
            .with_connection(|conn| {
                let max_value = if let Some(parent_id) = parent_id.as_deref() {
                    conn.query_row(
                        "SELECT COALESCE(MAX(sort_order), 0) FROM ftp_session_folders WHERE parent_id = ?1",
                        rusqlite::params![parent_id],
                        |row| row.get::<_, i64>(0),
                    )
                } else {
                    conn.query_row(
                        "SELECT COALESCE(MAX(sort_order), 0) FROM ftp_session_folders WHERE parent_id IS NULL",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                }
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(max_value + 1)
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn persist_profile_credentials(
        &self,
        conn: &rusqlite::Connection,
        session_id: &str,
        auth_type: &str,
        save_password: bool,
        password: Option<&str>,
        private_key_path: Option<&str>,
        certificate_path: Option<&str>,
        private_key_passphrase: Option<&str>,
    ) -> crate::db::DbResult<()> {
        if auth_type == "keyboardInteractive" {
            conn.execute(
                "DELETE FROM ftp_credentials WHERE session_id = ?1",
                rusqlite::params![session_id],
            )
            .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
            return Ok(());
        }

        if !save_password
            && private_key_path.is_none()
            && certificate_path.is_none()
            && password.is_none()
            && private_key_passphrase.is_none()
        {
            conn.execute(
                "DELETE FROM ftp_credentials WHERE session_id = ?1",
                rusqlite::params![session_id],
            )
            .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
            return Ok(());
        }

        let (credential_type, encrypted_value) = if auth_type == "privateKey" {
            let encrypted = if save_password {
                private_key_passphrase
                    .map(encrypt_credential)
                    .transpose()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?
            } else {
                None
            };
            ("privateKeyPassphrase", encrypted)
        } else {
            let encrypted = if save_password {
                password
                    .map(encrypt_credential)
                    .transpose()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?
            } else {
                None
            };
            ("password", encrypted)
        };

        conn.execute(
            "INSERT INTO ftp_credentials
                (session_id, credential_type, encrypted_value, private_key_path, certificate_path)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(session_id) DO UPDATE SET
                credential_type = excluded.credential_type,
                encrypted_value = excluded.encrypted_value,
                private_key_path = excluded.private_key_path,
                certificate_path = excluded.certificate_path",
            rusqlite::params![
                session_id,
                credential_type,
                encrypted_value,
                private_key_path,
                certificate_path
            ],
        )
        .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

        Ok(())
    }
}
