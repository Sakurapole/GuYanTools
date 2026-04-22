use anyhow::{anyhow, Result};
use uuid::Uuid;

use super::credentials::unix_now;
use super::models::*;

impl super::SshConnectionManager {
    // ----------------------------------------------------------
    // Port forwarding CRUD
    // ----------------------------------------------------------

    /// List all port forward rules for a given profile.
    pub fn list_port_forwards(&self, profile_id: &str) -> Result<Vec<SshPortForward>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, profile_id, label, forward_type, local_host, local_port,
                            remote_host, remote_port, auto_start, enabled, sort_order,
                            created_at, updated_at
                     FROM ssh_port_forwards WHERE profile_id = ?1 ORDER BY sort_order ASC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map(rusqlite::params![profile_id], |row| {
                        Ok(SshPortForward {
                            id: row.get(0)?,
                            profile_id: row.get(1)?,
                            label: row.get(2)?,
                            forward_type: row.get(3)?,
                            local_host: row.get(4)?,
                            local_port: row.get::<_, i64>(5)? as u32,
                            remote_host: row.get(6)?,
                            remote_port: row.get::<_, Option<i64>>(7)?.map(|v| v as u32),
                            auto_start: row.get::<_, i64>(8)? != 0,
                            enabled: row.get::<_, i64>(9)? != 0,
                            sort_order: row.get(10)?,
                            created_at: row.get(11)?,
                            updated_at: row.get(12)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    /// Get a single port forward rule by ID.
    pub fn get_port_forward(&self, id: &str) -> Result<SshPortForward> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT id, profile_id, label, forward_type, local_host, local_port,
                        remote_host, remote_port, auto_start, enabled, sort_order,
                        created_at, updated_at
                 FROM ssh_port_forwards WHERE id = ?1",
                    rusqlite::params![id],
                    |row| {
                        Ok(SshPortForward {
                            id: row.get(0)?,
                            profile_id: row.get(1)?,
                            label: row.get(2)?,
                            forward_type: row.get(3)?,
                            local_host: row.get(4)?,
                            local_port: row.get::<_, i64>(5)? as u32,
                            remote_host: row.get(6)?,
                            remote_port: row.get::<_, Option<i64>>(7)?.map(|v| v as u32),
                            auto_start: row.get::<_, i64>(8)? != 0,
                            enabled: row.get::<_, i64>(9)? != 0,
                            sort_order: row.get(10)?,
                            created_at: row.get(11)?,
                            updated_at: row.get(12)?,
                        })
                    },
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    /// Create a new port forwarding rule.
    pub fn create_port_forward(&self, input: CreatePortForwardInput) -> Result<SshPortForward> {
        let id = Uuid::new_v4().to_string();
        let now = unix_now();
        let local_host = input.local_host.unwrap_or_else(|| "127.0.0.1".to_string());

        let sort_order: i64 = self.inner.db.with_connection(|conn| {
            let max: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), 0) FROM ssh_port_forwards WHERE profile_id = ?1",
                    rusqlite::params![input.profile_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            Ok(max + 1)
        })
        .map_err(|e| anyhow!("{}", e))?;

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ssh_port_forwards
                    (id, profile_id, label, forward_type, local_host, local_port,
                     remote_host, remote_port, auto_start, enabled, sort_order,
                     created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?11,?12)",
                    rusqlite::params![
                        id,
                        input.profile_id,
                        input.label,
                        input.forward_type,
                        local_host,
                        input.local_port as i64,
                        input.remote_host,
                        input.remote_port.map(|p| p as i64),
                        input.auto_start as i64,
                        sort_order,
                        now,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_port_forward(&id)
    }

    /// Update an existing port forwarding rule.
    pub fn update_port_forward(&self, input: UpdatePortForwardInput) -> Result<SshPortForward> {
        let now = unix_now();
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "UPDATE ssh_port_forwards SET
                    label       = COALESCE(?2, label),
                    forward_type = COALESCE(?3, forward_type),
                    local_host  = COALESCE(?4, local_host),
                    local_port  = COALESCE(?5, local_port),
                    remote_host = COALESCE(?6, remote_host),
                    remote_port = COALESCE(?7, remote_port),
                    auto_start  = COALESCE(?8, auto_start),
                    enabled     = COALESCE(?9, enabled),
                    updated_at  = ?10
                 WHERE id = ?1",
                    rusqlite::params![
                        input.id,
                        input.label,
                        input.forward_type,
                        input.local_host,
                        input.local_port.map(|p| p as i64),
                        input.remote_host,
                        input.remote_port.map(|p| p as i64),
                        input.auto_start.map(|b| b as i64),
                        input.enabled.map(|b| b as i64),
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_port_forward(&input.id)
    }

    /// Delete a port forwarding rule.
    pub fn delete_port_forward(&self, id: &str) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ssh_port_forwards WHERE id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    // ----------------------------------------------------------
    // Port forward import/export
    // ----------------------------------------------------------

    /// Export all port forward rules for a profile as a JSON string.
    pub fn export_port_forwards(&self, profile_id: &str) -> Result<String> {
        let profile = self.get_profile(profile_id)?;
        let rules_db = self.list_port_forwards(profile_id)?;

        let export_data = ExportPortForwardData {
            version: 1,
            profile_label: profile.label.clone(),
            profile_host: format!("{}:{}", profile.host, profile.port),
            rules: rules_db
                .iter()
                .map(|r| ExportPortForwardRule {
                    label: r.label.clone(),
                    forward_type: r.forward_type.clone(),
                    local_host: r.local_host.clone(),
                    local_port: r.local_port,
                    remote_host: r.remote_host.clone(),
                    remote_port: r.remote_port,
                    auto_start: r.auto_start,
                })
                .collect(),
        };

        serde_json::to_string_pretty(&export_data)
            .map_err(|e| anyhow!("failed to serialize export data: {}", e))
    }

    /// Import port forward rules from a JSON string into the specified profile.
    /// Returns the number of rules imported.
    pub fn import_port_forwards(&self, profile_id: &str, json_data: &str) -> Result<u32> {
        let export_data: ExportPortForwardData = serde_json::from_str(json_data)
            .map_err(|e| anyhow!("invalid import data format: {}", e))?;

        if export_data.version != 1 {
            return Err(anyhow!(
                "unsupported export version: {}",
                export_data.version
            ));
        }

        let mut count = 0u32;
        for rule in &export_data.rules {
            let input = CreatePortForwardInput {
                profile_id: profile_id.to_string(),
                label: rule.label.clone(),
                forward_type: rule.forward_type.clone(),
                local_host: Some(rule.local_host.clone()),
                local_port: rule.local_port,
                remote_host: rule.remote_host.clone(),
                remote_port: rule.remote_port,
                auto_start: rule.auto_start,
            };
            self.create_port_forward(input)?;
            count += 1;
        }

        Ok(count)
    }
}
