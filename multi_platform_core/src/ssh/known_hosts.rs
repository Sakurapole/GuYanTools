use anyhow::{anyhow, Result};
use rusqlite::OptionalExtension;
use uuid::Uuid;

use super::credentials::unix_now;
use super::models::*;

impl super::SshConnectionManager {
    // ----------------------------------------------------------
    // Known hosts
    // ----------------------------------------------------------

    /// List all stored known host fingerprints.
    pub fn list_known_hosts(&self) -> Result<Vec<SshKnownHost>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, host, port, algorithm, fingerprint, trust_mode, added_at
                     FROM ssh_known_hosts ORDER BY added_at DESC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(SshKnownHost {
                            id: row.get(0)?,
                            host: row.get(1)?,
                            port: row.get::<_, i64>(2)? as u32,
                            algorithm: row.get(3)?,
                            fingerprint: row.get(4)?,
                            trust_mode: row.get(5)?,
                            added_at: row.get(6)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    /// Verify whether a host fingerprint is trusted.
    pub fn verify_host_fingerprint(
        &self,
        host: &str,
        port: u32,
        algorithm: &str,
        fingerprint: &str,
    ) -> Result<HostVerifyResult> {
        self.inner.db.with_connection(|conn| {
            let stored: Option<String> = conn
                .query_row(
                    "SELECT fingerprint FROM ssh_known_hosts WHERE host=?1 AND port=?2 AND algorithm=?3",
                    rusqlite::params![host, port as i64, algorithm],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

            let result = match stored {
                None => HostVerifyResult {
                    status: "unknown".to_string(),
                    stored_fingerprint: None,
                },
                Some(ref stored_fp) if stored_fp == fingerprint => HostVerifyResult {
                    status: "trusted".to_string(),
                    stored_fingerprint: None,
                },
                Some(stored_fp) => HostVerifyResult {
                    status: "mismatch".to_string(),
                    stored_fingerprint: Some(stored_fp),
                },
            };
            Ok(result)
        })
        .map_err(|e| anyhow!("{}", e))
    }

    /// Trust a host fingerprint (insert or replace).
    pub fn trust_host(&self, input: TrustHostInput) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let now = unix_now();
        self.inner.db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO ssh_known_hosts (id, host, port, algorithm, fingerprint, trust_mode, added_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(host, port, algorithm) DO UPDATE SET
                     fingerprint = excluded.fingerprint,
                     trust_mode  = excluded.trust_mode,
                     added_at    = excluded.added_at",
                rusqlite::params![
                    id,
                    input.host,
                    input.port as i64,
                    input.algorithm,
                    input.fingerprint,
                    input.trust_mode,
                    now,
                ],
            )
            .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
            Ok(())
        })
        .map_err(|e| anyhow!("{}", e))
    }

    /// Delete a known host fingerprint by ID.
    pub fn delete_known_host(&self, id: &str) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ssh_known_hosts WHERE id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    // ----------------------------------------------------------
    // SSH Agent
    // ----------------------------------------------------------

    /// List available identities from the system SSH agent.
    pub fn list_agent_identities(&self) -> Result<Vec<SshAgentIdentity>> {
        // Platform SSH agent enumeration requires OS-specific IPC.
        // Returns empty list as a safe stub; full implementation per-platform.
        Ok(Vec::new())
    }
}
