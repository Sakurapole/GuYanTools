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

    pub fn list_scheduled_tasks(&self) -> Result<Vec<FtpScheduledTask>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, label, session_id, direction, local_path, remote_path,
                                schedule_type, conflict_strategy, enabled, include_subdirs,
                                once_at, interval_hours, time_of_day, day_of_week, cron_expression,
                                next_run_at, last_run_at, last_run_status, last_result,
                                last_task_id, created_at, updated_at
                         FROM ftp_scheduled_tasks
                         ORDER BY next_run_at IS NULL, next_run_at ASC, created_at ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(FtpScheduledTask {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            profile_id: row.get(2)?,
                            direction: row.get(3)?,
                            local_path: row.get(4)?,
                            remote_path: row.get(5)?,
                            schedule_type: row.get(6)?,
                            conflict_policy: row.get(7)?,
                            enabled: row.get::<_, i64>(8)? != 0,
                            include_subdirectories: row.get::<_, i64>(9)? != 0,
                            once_at: row.get(10)?,
                            interval_hours: row.get(11)?,
                            time_of_day: row.get(12)?,
                            day_of_week: row.get(13)?,
                            cron_expression: row.get(14)?,
                            next_run_at: row.get(15)?,
                            last_run_at: row.get(16)?,
                            last_status: row.get(17)?,
                            last_result: row.get(18)?,
                            last_task_id: row.get(19)?,
                            created_at: row.get(20)?,
                            updated_at: row.get(21)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn upsert_scheduled_task(
        &self,
        input: UpsertFtpScheduledTaskInput,
    ) -> Result<FtpScheduledTask> {
        let id = input
            .id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let label = non_empty_or_default(&input.label, "未命名计划任务");
        let profile_id = input.profile_id.trim().to_string();
        if profile_id.is_empty() {
            return Err(anyhow!("FTP scheduled task profile_id is required"));
        }
        if input.local_path.trim().is_empty() {
            return Err(anyhow!("FTP scheduled task local_path is required"));
        }
        if input.remote_path.trim().is_empty() {
            return Err(anyhow!("FTP scheduled task remote_path is required"));
        }
        let direction = normalize_ftp_direction(&input.direction)?;
        let schedule_type = normalize_ftp_schedule_type(&input.schedule_type)?;
        let conflict_policy = normalize_ftp_conflict_policy(input.conflict_policy.as_deref());
        let last_status = input
            .last_status
            .as_deref()
            .and_then(normalize_ftp_schedule_status);
        let now = unix_now();

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ftp_scheduled_tasks
                        (id, session_id, label, direction, local_path, remote_path, schedule_type,
                         cron_expression, next_run_at, last_run_at, last_run_status,
                         conflict_strategy, include_subdirs, enabled, created_at,
                         once_at, interval_hours, time_of_day, day_of_week, last_result,
                         last_task_id, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                             ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
                     ON CONFLICT(id) DO UPDATE SET
                        session_id = excluded.session_id,
                        label = excluded.label,
                        direction = excluded.direction,
                        local_path = excluded.local_path,
                        remote_path = excluded.remote_path,
                        schedule_type = excluded.schedule_type,
                        cron_expression = excluded.cron_expression,
                        next_run_at = excluded.next_run_at,
                        last_run_at = excluded.last_run_at,
                        last_run_status = excluded.last_run_status,
                        conflict_strategy = excluded.conflict_strategy,
                        include_subdirs = excluded.include_subdirs,
                        enabled = excluded.enabled,
                        once_at = excluded.once_at,
                        interval_hours = excluded.interval_hours,
                        time_of_day = excluded.time_of_day,
                        day_of_week = excluded.day_of_week,
                        last_result = excluded.last_result,
                        last_task_id = excluded.last_task_id,
                        updated_at = excluded.updated_at",
                    rusqlite::params![
                        id,
                        profile_id,
                        label,
                        direction,
                        input.local_path.trim(),
                        normalize_remote_path(&input.remote_path),
                        schedule_type,
                        trim_optional_string(input.cron_expression.as_deref()),
                        input.next_run_at,
                        input.last_run_at,
                        last_status,
                        conflict_policy,
                        input.include_subdirectories.unwrap_or(true) as i64,
                        input.enabled.unwrap_or(true) as i64,
                        now,
                        input.once_at,
                        input.interval_hours,
                        trim_optional_string(input.time_of_day.as_deref()),
                        input.day_of_week,
                        trim_optional_string(input.last_result.as_deref()),
                        trim_optional_string(input.last_task_id.as_deref()),
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_scheduled_task(&id)
    }

    pub fn delete_scheduled_task(&self, id: &str) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ftp_scheduled_tasks WHERE id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn list_filter_presets(&self) -> Result<Vec<FtpFilterPreset>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, label, rules_json, is_builtin, created_at
                         FROM ftp_filter_presets
                         ORDER BY is_builtin DESC, created_at ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(FtpFilterPreset {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            rules_json: row.get(2)?,
                            is_builtin: row.get::<_, i64>(3)? != 0,
                            created_at: row.get(4)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn upsert_filter_preset(
        &self,
        input: UpsertFtpFilterPresetInput,
    ) -> Result<FtpFilterPreset> {
        serde_json::from_str::<serde_json::Value>(&input.rules_json)
            .map_err(|e| anyhow!("invalid FTP filter preset rules_json: {}", e))?;
        let id = input
            .id
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let label = non_empty_or_default(&input.label, "未命名预设");
        let now = unix_now();

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ftp_filter_presets (id, label, rules_json, is_builtin, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(id) DO UPDATE SET
                        label = excluded.label,
                        rules_json = excluded.rules_json,
                        is_builtin = excluded.is_builtin",
                    rusqlite::params![
                        id,
                        label,
                        input.rules_json,
                        input.is_builtin.unwrap_or(false) as i64,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_filter_preset(&id)
    }

    pub fn delete_filter_preset(&self, id: &str) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ftp_filter_presets WHERE id = ?1 AND is_builtin = 0",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn get_scheduled_task(&self, id: &str) -> Result<FtpScheduledTask> {
        self.list_scheduled_tasks()?
            .into_iter()
            .find(|task| task.id == id)
            .ok_or_else(|| anyhow!("FTP scheduled task '{}' not found", id))
    }

    fn get_filter_preset(&self, id: &str) -> Result<FtpFilterPreset> {
        self.list_filter_presets()?
            .into_iter()
            .find(|preset| preset.id == id)
            .ok_or_else(|| anyhow!("FTP filter preset '{}' not found", id))
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

fn non_empty_or_default(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn trim_optional_string(value: Option<&str>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_ftp_direction(value: &str) -> Result<String> {
    match value.trim().to_lowercase().as_str() {
        "upload" => Ok("upload".to_string()),
        "download" => Ok("download".to_string()),
        other => Err(anyhow!("unsupported FTP scheduled task direction '{}'", other)),
    }
}

fn normalize_ftp_schedule_type(value: &str) -> Result<String> {
    match value.trim().to_lowercase().as_str() {
        "once" => Ok("once".to_string()),
        "hourly" => Ok("hourly".to_string()),
        "daily" => Ok("daily".to_string()),
        "weekly" => Ok("weekly".to_string()),
        "cron" => Ok("cron".to_string()),
        other => Err(anyhow!("unsupported FTP schedule type '{}'", other)),
    }
}

fn normalize_ftp_conflict_policy(value: Option<&str>) -> String {
    match value.map(str::trim) {
        Some("parallel") => "parallel".to_string(),
        _ => "skip".to_string(),
    }
}

fn normalize_ftp_schedule_status(value: &str) -> Option<String> {
    match value.trim() {
        "idle" => Some("idle".to_string()),
        "running" => Some("running".to_string()),
        "success" => Some("success".to_string()),
        "failed" => Some("failed".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn create_test_manager() -> FtpManager {
        let db = Database::new_in_memory().unwrap();
        FtpManager::new(std::sync::Arc::new(db))
    }

    #[test]
    fn scheduled_tasks_round_trip_through_sqlite() {
        let manager = create_test_manager();
        let profile = manager
            .create_profile(CreateFtpProfileInput {
                label: "Test FTP".to_string(),
                protocol: "sftp".to_string(),
                host: Some("example.test".to_string()),
                port: Some(22),
                username: Some("tester".to_string()),
                ..Default::default()
            })
            .unwrap();

        let task = manager
            .upsert_scheduled_task(UpsertFtpScheduledTaskInput {
                id: Some("schedule-1".to_string()),
                label: "Nightly upload".to_string(),
                profile_id: profile.id.clone(),
                direction: "upload".to_string(),
                local_path: "C:\\work\\build".to_string(),
                remote_path: "/srv/build".to_string(),
                schedule_type: "weekly".to_string(),
                conflict_policy: Some("parallel".to_string()),
                enabled: Some(true),
                include_subdirectories: Some(false),
                once_at: Some(1_735_689_600_000),
                interval_hours: Some(6),
                time_of_day: Some("23:30".to_string()),
                day_of_week: Some(5),
                cron_expression: Some("30 23 * * 5".to_string()),
                next_run_at: Some(1_735_689_600_000),
                last_run_at: Some(1_735_603_200_000),
                last_status: Some("success".to_string()),
                last_result: Some("recent run ok".to_string()),
                last_task_id: Some("transfer-1".to_string()),
            })
            .unwrap();

        assert_eq!(task.id, "schedule-1");
        assert_eq!(task.profile_id, profile.id);
        assert_eq!(task.conflict_policy.as_deref(), Some("parallel"));
        assert_eq!(task.include_subdirectories, false);
        assert_eq!(task.time_of_day.as_deref(), Some("23:30"));
        assert_eq!(task.day_of_week, Some(5));
        assert_eq!(task.last_result.as_deref(), Some("recent run ok"));
        assert_eq!(task.last_task_id.as_deref(), Some("transfer-1"));
        assert!(task.updated_at >= task.created_at);

        let listed = manager.list_scheduled_tasks().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "schedule-1");

        manager.delete_scheduled_task("schedule-1").unwrap();
        assert!(manager.list_scheduled_tasks().unwrap().is_empty());
    }

    #[test]
    fn filter_presets_round_trip_through_sqlite() {
        let manager = create_test_manager();
        let preset = manager
            .upsert_filter_preset(UpsertFtpFilterPresetInput {
                id: Some("preset-1".to_string()),
                label: "Logs".to_string(),
                rules_json: r#"{"mode":"files","extensionQuery":".log"}"#.to_string(),
                is_builtin: Some(false),
            })
            .unwrap();

        assert_eq!(preset.id, "preset-1");
        assert_eq!(preset.label, "Logs");
        assert_eq!(preset.rules_json, r#"{"mode":"files","extensionQuery":".log"}"#);
        assert!(!preset.is_builtin);

        let listed = manager.list_filter_presets().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "preset-1");

        manager.delete_filter_preset("preset-1").unwrap();
        assert!(manager.list_filter_presets().unwrap().is_empty());
    }
}
