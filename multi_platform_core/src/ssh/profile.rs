use anyhow::{anyhow, Result};
use rusqlite::OptionalExtension;
use uuid::Uuid;

use super::credentials::{encrypt_credential, unix_now};
use super::models::*;

impl super::SshConnectionManager {
    // ----------------------------------------------------------
    // Profile CRUD
    // ----------------------------------------------------------

    /// List all SSH profiles ordered by sort_order.
    pub fn list_profiles(&self) -> Result<Vec<SshProfile>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT p.id, p.label, p.host, p.port, p.username, p.auth_type, p.save_password,
                            c.private_key_path, c.certificate_path, p.host_ca_key_path, p.jump_host_json,
                            p.auto_reconnect, p.sort_order, p.color, p.tags, p.created_at, p.updated_at
                     FROM ssh_profiles p
                     LEFT JOIN ssh_credentials c ON c.profile_id = p.id
                     ORDER BY p.sort_order ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(SshProfile {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            host: row.get(2)?,
                            port: row.get::<_, i64>(3)? as u32,
                            username: row.get(4)?,
                            auth_type: row.get(5)?,
                            save_password: row.get::<_, i64>(6)? != 0,
                            private_key_path: row.get(7)?,
                            certificate_path: row.get(8)?,
                            host_ca_key_path: row.get(9)?,
                            jump_host_json: row.get(10)?,
                            auto_reconnect: row.get::<_, i64>(11)? != 0,
                            sort_order: row.get(12)?,
                            color: row.get(13)?,
                            tags: row.get(14)?,
                            created_at: row.get(15)?,
                            updated_at: row.get(16)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    /// Get a single SSH profile by ID.
    pub fn get_profile(&self, id: &str) -> Result<SshProfile> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT p.id, p.label, p.host, p.port, p.username, p.auth_type, p.save_password,
                        c.private_key_path, c.certificate_path, p.host_ca_key_path, p.jump_host_json,
                        p.auto_reconnect, p.sort_order, p.color, p.tags, p.created_at, p.updated_at
                 FROM ssh_profiles p
                 LEFT JOIN ssh_credentials c ON c.profile_id = p.id
                 WHERE p.id = ?1",
                    rusqlite::params![id],
                    |row| {
                        Ok(SshProfile {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            host: row.get(2)?,
                            port: row.get::<_, i64>(3)? as u32,
                            username: row.get(4)?,
                            auth_type: row.get(5)?,
                            save_password: row.get::<_, i64>(6)? != 0,
                            private_key_path: row.get(7)?,
                            certificate_path: row.get(8)?,
                            host_ca_key_path: row.get(9)?,
                            jump_host_json: row.get(10)?,
                            auto_reconnect: row.get::<_, i64>(11)? != 0,
                            sort_order: row.get(12)?,
                            color: row.get(13)?,
                            tags: row.get(14)?,
                            created_at: row.get(15)?,
                            updated_at: row.get(16)?,
                        })
                    },
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    /// Create a new SSH profile and optionally persist the credential.
    pub fn create_profile(&self, input: CreateSshProfileInput) -> Result<SshProfile> {
        let id = Uuid::new_v4().to_string();
        let now = unix_now();
        let port = if input.port == 0 { 22 } else { input.port };
        let sort_order = self.next_sort_order()?;

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ssh_profiles
                    (id, label, host, port, username, auth_type, save_password,
                     host_ca_key_path, jump_host_json, auto_reconnect, sort_order, color,
                     tags, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
                    rusqlite::params![
                        id,
                        input.label,
                        input.host,
                        port as i64,
                        input.username,
                        input.auth_type,
                        input.save_password as i64,
                        input.host_ca_key_path,
                        input.jump_host_json,
                        input.auto_reconnect as i64,
                        sort_order,
                        input.color,
                        input.tags,
                        now,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                // Persist credential record if save_password is set
                if input.save_password {
                    let (cred_type, encrypted, key_path, certificate_path) =
                        if input.auth_type == "privateKey" {
                        let encrypted = input
                            .private_key_passphrase
                            .as_deref()
                            .map(|p| encrypt_credential(p))
                            .transpose()
                            .unwrap_or(None);
                        (
                            "privateKeyPassphrase",
                            encrypted,
                            input.private_key_path.clone(),
                            input.certificate_path.clone(),
                        )
                    } else {
                        let encrypted = input
                            .password
                            .as_deref()
                            .map(|p| encrypt_credential(p))
                            .transpose()
                            .unwrap_or(None);
                        ("password", encrypted, None, None)
                    };

                    conn.execute(
                        "INSERT OR REPLACE INTO ssh_credentials
                        (profile_id, credential_type, encrypted_value, private_key_path, certificate_path)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![id, cred_type, encrypted, key_path, certificate_path],
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                } else if input.auth_type == "privateKey" {
                    // Even without saving password, store the private key path
                    conn.execute(
                        "INSERT OR REPLACE INTO ssh_credentials
                        (profile_id, credential_type, encrypted_value, private_key_path, certificate_path)
                     VALUES (?1, 'privateKeyPassphrase', NULL, ?2, ?3)",
                        rusqlite::params![id, input.private_key_path, input.certificate_path],
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                }

                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_profile(&id)
    }

    /// Update an existing SSH profile.
    pub fn update_profile(&self, input: UpdateSshProfileInput) -> Result<SshProfile> {
        let now = unix_now();

        self.inner
            .db
            .with_connection(|conn| {
                let existing = conn
                    .query_row(
                        "SELECT * FROM ssh_profiles WHERE id = ?1",
                        rusqlite::params![input.id],
                        |row| row.get::<_, String>(0),
                    )
                    .map_err(|_| {
                        crate::db::DbError::QueryFailed(format!(
                            "SSH profile '{}' not found",
                            input.id
                        ))
                    })?;
                let _ = existing;

                conn.execute(
                    "UPDATE ssh_profiles SET
                    label       = COALESCE(?2, label),
                    host        = COALESCE(?3, host),
                    port        = COALESCE(?4, port),
                    username    = COALESCE(?5, username),
                    auth_type   = COALESCE(?6, auth_type),
                    save_password = COALESCE(?7, save_password),
                    host_ca_key_path = COALESCE(?8, host_ca_key_path),
                    jump_host_json = COALESCE(?9, jump_host_json),
                    auto_reconnect = COALESCE(?10, auto_reconnect),
                    color       = COALESCE(?11, color),
                    tags        = COALESCE(?12, tags),
                    updated_at  = ?13
                 WHERE id = ?1",
                    rusqlite::params![
                        input.id,
                        input.label,
                        input.host,
                        input.port.map(|p| p as i64),
                        input.username,
                        input.auth_type,
                        input.save_password.map(|b| b as i64),
                        input.host_ca_key_path,
                        input.jump_host_json,
                        input.auto_reconnect.map(|b| b as i64),
                        input.color,
                        input.tags,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                // Update credential if provided
                let should_save = input.save_password.unwrap_or(false);
                let auth_type = input.auth_type.as_deref().unwrap_or("password");
                if should_save {
                    if auth_type == "privateKey" {
                        let encrypted = input
                            .private_key_passphrase
                            .as_deref()
                            .map(|p| encrypt_credential(p))
                            .transpose()
                            .unwrap_or(None);
                        conn.execute(
                            "INSERT OR REPLACE INTO ssh_credentials
                            (profile_id, credential_type, encrypted_value, private_key_path, certificate_path)
                         VALUES (?1, 'privateKeyPassphrase', ?2, ?3, ?4)",
                            rusqlite::params![
                                input.id,
                                encrypted,
                                input.private_key_path,
                                input.certificate_path
                            ],
                        )
                        .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                    } else if input.password.is_some() {
                        let encrypted = input
                            .password
                            .as_deref()
                            .map(|p| encrypt_credential(p))
                            .transpose()
                            .unwrap_or(None);
                        conn.execute(
                            "INSERT OR REPLACE INTO ssh_credentials
                            (profile_id, credential_type, encrypted_value, private_key_path, certificate_path)
                         VALUES (?1, 'password', ?2, NULL, NULL)",
                            rusqlite::params![input.id, encrypted],
                        )
                        .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                    }
                } else if input.private_key_path.is_some() || input.certificate_path.is_some() {
                    conn.execute(
                        "UPDATE ssh_credentials
                         SET private_key_path = COALESCE(?2, private_key_path),
                             certificate_path = COALESCE(?3, certificate_path)
                         WHERE profile_id = ?1",
                        rusqlite::params![input.id, input.private_key_path, input.certificate_path],
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                }

                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_profile(&input.id)
    }

    /// Delete an SSH profile and terminate any active sessions for it.
    pub fn delete_profile(&self, id: &str) -> Result<()> {
        // Terminate active sessions for this profile
        let session_ids: Vec<String> = {
            let sessions = self
                .inner
                .sessions
                .read()
                .map_err(|_| anyhow!("sessions lock poisoned"))?;
            sessions
                .values()
                .filter(|s| {
                    s.descriptor
                        .lock()
                        .map(|d| d.profile_id == id)
                        .unwrap_or(false)
                })
                .map(|s| {
                    s.descriptor
                        .lock()
                        .map(|d| d.session_id.clone())
                        .unwrap_or_default()
                })
                .collect()
        };
        for session_id in session_ids {
            let _ = self.disconnect(&session_id);
        }

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ssh_profiles WHERE id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    // ----------------------------------------------------------
    // Credential resolution helpers
    // ----------------------------------------------------------

    pub(super) fn resolve_password(
        &self,
        profile: &SshProfile,
        override_password: Option<&str>,
    ) -> Result<Option<String>> {
        if let Some(pwd) = override_password {
            return Ok(Some(pwd.to_string()));
        }
        if profile.save_password && profile.auth_type == "password" {
            return self.load_credential(&profile.id, "password");
        }
        Ok(None)
    }

    pub(super) fn resolve_key_path(&self, profile: &SshProfile) -> Result<Option<String>> {
        if profile.auth_type != "privateKey" {
            return Ok(None);
        }
        self.inner
            .db
            .with_connection(|conn| {
                let path: Option<String> = conn
                    .query_row(
                        "SELECT private_key_path FROM ssh_credentials WHERE profile_id = ?1",
                        rusqlite::params![profile.id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?
                    .flatten();
                Ok(path)
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub(super) fn resolve_key_passphrase(&self, profile: &SshProfile) -> Result<Option<String>> {
        if !profile.save_password || profile.auth_type != "privateKey" {
            return Ok(None);
        }
        self.load_credential(&profile.id, "privateKeyPassphrase")
    }

    pub(super) fn resolve_certificate_path(&self, profile: &SshProfile) -> Result<Option<String>> {
        if profile.auth_type != "privateKey" {
            return Ok(None);
        }
        self.inner
            .db
            .with_connection(|conn| {
                let path: Option<String> = conn
                    .query_row(
                        "SELECT certificate_path FROM ssh_credentials WHERE profile_id = ?1",
                        rusqlite::params![profile.id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?
                    .flatten();
                Ok(path)
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub(super) fn load_credential(
        &self,
        profile_id: &str,
        cred_type: &str,
    ) -> Result<Option<String>> {
        use super::credentials::decrypt_credential;

        let encrypted_opt: Option<String> = self.inner.db.with_connection(|conn| {
            conn
                .query_row(
                    "SELECT encrypted_value FROM ssh_credentials WHERE profile_id=?1 AND credential_type=?2",
                    rusqlite::params![profile_id, cred_type],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
                .map(|outer| outer.flatten())
        })
        .map_err(|e| anyhow!("{}", e))?;

        match encrypted_opt {
            Some(enc) => Ok(Some(decrypt_credential(&enc)?)),
            None => Ok(None),
        }
    }

    pub(super) fn next_sort_order(&self) -> Result<i64> {
        self.inner
            .db
            .with_connection(|conn| {
                let max: i64 = conn
                    .query_row(
                        "SELECT COALESCE(MAX(sort_order), 0) FROM ssh_profiles",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);
                Ok(max + 1)
            })
            .map_err(|e| anyhow!("{}", e))
    }
}
