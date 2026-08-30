use crate::db::{Database, DbError, DbResult};
use crate::models::{
    CreatePluginFileGrantInput, CreatePluginJobInput, PluginFileGrant, PluginInstallation,
    PluginJob, PluginMarketplaceCache, UpdatePluginJobInput, UpsertPluginInstallationInput,
    UpsertPluginMarketplaceInput,
};
use rusqlite::{params, Connection, OptionalExtension};

pub struct PluginService;

impl PluginService {
    pub fn upsert_installation(
        db: &Database,
        input: UpsertPluginInstallationInput,
    ) -> DbResult<PluginInstallation> {
        if input.plugin_id.trim().is_empty() || input.current_path.trim().is_empty() {
            return Err(DbError::InvalidParameter(
                "plugin installation id and current path are required".to_string(),
            ));
        }
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO plugin_installations (plugin_id, manifest_json, source_json, resolved_commit, package_sha256, approved_permissions_json, capabilities_json, current_path, previous_path, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(plugin_id) DO UPDATE SET manifest_json=excluded.manifest_json, source_json=excluded.source_json, resolved_commit=excluded.resolved_commit, package_sha256=excluded.package_sha256, approved_permissions_json=excluded.approved_permissions_json, capabilities_json=excluded.capabilities_json, current_path=excluded.current_path, previous_path=excluded.previous_path, status=excluded.status, updated_at=datetime('now')",
                params![input.plugin_id, input.manifest_json, input.source_json, input.resolved_commit, input.package_sha256, input.approved_permissions_json, input.capabilities_json, input.current_path, input.previous_path, input.status],
            )?;
            Self::get_installation_conn(conn, &input.plugin_id)?.ok_or_else(|| DbError::NotFound(input.plugin_id))
        })
    }

    pub fn get_installation(
        db: &Database,
        plugin_id: &str,
    ) -> DbResult<Option<PluginInstallation>> {
        db.with_connection(|conn| Self::get_installation_conn(conn, plugin_id))
    }

    pub fn delete_installation(db: &Database, plugin_id: &str) -> DbResult<()> {
        db.transaction(|conn| {
            conn.execute(
                "DELETE FROM plugin_installations WHERE plugin_id = ?1",
                params![plugin_id],
            )?;
            Ok(())
        })
    }

    pub fn create_file_grant(
        db: &Database,
        input: CreatePluginFileGrantInput,
    ) -> DbResult<PluginFileGrant> {
        if input.id.trim().is_empty()
            || input.plugin_id.trim().is_empty()
            || input.root_path.trim().is_empty()
        {
            return Err(DbError::InvalidParameter(
                "plugin file grant fields are required".to_string(),
            ));
        }
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO plugin_file_grants (id, plugin_id, purpose, root_path, access_mode, expires_at, max_bytes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![input.id, input.plugin_id, input.purpose, input.root_path, input.access_mode, input.expires_at, input.max_bytes],
            )?;
            Self::get_file_grant_conn(conn, &input.id)?.ok_or_else(|| DbError::NotFound(input.id))
        })
    }

    pub fn revoke_file_grant(db: &Database, plugin_id: &str, id: &str) -> DbResult<()> {
        db.transaction(|conn| {
            let changed = conn.execute(
                "UPDATE plugin_file_grants SET revoked = 1 WHERE id = ?1 AND plugin_id = ?2",
                params![id, plugin_id],
            )?;
            if changed == 0 {
                return Err(DbError::NotFound(id.to_string()));
            }
            Ok(())
        })
    }

    pub fn list_marketplaces(db: &Database) -> DbResult<Vec<PluginMarketplaceCache>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare("SELECT id, url, ref, catalog_json, catalog_sha256, enabled, refreshed_at FROM plugin_marketplaces ORDER BY id")?;
            let rows = stmt.query_map([], |row| Ok(PluginMarketplaceCache {
                id: row.get(0)?, url: row.get(1)?, ref_name: row.get(2)?, catalog_json: row.get(3)?, catalog_sha256: row.get(4)?, enabled: row.get::<_, i64>(5)? != 0, refreshed_at: row.get(6)?
            }))?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_marketplace(
        db: &Database,
        input: UpsertPluginMarketplaceInput,
    ) -> DbResult<PluginMarketplaceCache> {
        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO plugin_marketplaces (id, url, ref, catalog_json, catalog_sha256, enabled, refreshed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET url=excluded.url, ref=excluded.ref, catalog_json=excluded.catalog_json, catalog_sha256=excluded.catalog_sha256, enabled=excluded.enabled, refreshed_at=datetime('now')",
                params![input.id, input.url, input.ref_name, input.catalog_json, input.catalog_sha256, input.enabled as i64],
            )?;
            conn.query_row("SELECT id, url, ref, catalog_json, catalog_sha256, enabled, refreshed_at FROM plugin_marketplaces WHERE id = ?1", params![input.id], |row| Ok(PluginMarketplaceCache {
                id: row.get(0)?, url: row.get(1)?, ref_name: row.get(2)?, catalog_json: row.get(3)?, catalog_sha256: row.get(4)?, enabled: row.get::<_, i64>(5)? != 0, refreshed_at: row.get(6)?
            })).map_err(Into::into)
        })
    }

    fn get_file_grant_conn(conn: &Connection, id: &str) -> DbResult<Option<PluginFileGrant>> {
        conn.query_row("SELECT id, plugin_id, purpose, root_path, access_mode, expires_at, max_bytes, revoked, created_at FROM plugin_file_grants WHERE id = ?1", params![id], |row| Ok(PluginFileGrant {
            id: row.get(0)?, plugin_id: row.get(1)?, purpose: row.get(2)?, root_path: row.get(3)?, access_mode: row.get(4)?, expires_at: row.get(5)?, max_bytes: row.get(6)?, revoked: row.get::<_, i64>(7)? != 0, created_at: row.get(8)?
        })).optional().map_err(Into::into)
    }
    pub fn create_job(db: &Database, input: CreatePluginJobInput) -> DbResult<PluginJob> {
        if input.id.trim().is_empty()
            || input.plugin_id.trim().is_empty()
            || input.kind.trim().is_empty()
        {
            return Err(DbError::InvalidParameter(
                "plugin job id, plugin id, and kind are required".to_string(),
            ));
        }

        db.transaction(|conn| {
            conn.execute(
                "INSERT INTO plugin_jobs (id, plugin_id, parent_job_id, kind, status, input_json)
                 VALUES (?1, ?2, ?3, ?4, 'queued', ?5)",
                params![
                    input.id,
                    input.plugin_id,
                    input.parent_job_id,
                    input.kind,
                    input.input_json
                ],
            )?;
            Self::get_job_conn(conn, &input.id)?.ok_or_else(|| DbError::NotFound(input.id))
        })
    }

    pub fn get_job(db: &Database, id: &str) -> DbResult<Option<PluginJob>> {
        db.with_connection(|conn| Self::get_job_conn(conn, id))
    }

    pub fn list_jobs(db: &Database, plugin_id: &str) -> DbResult<Vec<PluginJob>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, plugin_id, parent_job_id, kind, status, progress, current_step,
                        input_json, output_json, error_json, created_at, updated_at
                 FROM plugin_jobs
                 WHERE plugin_id = ?1
                 ORDER BY updated_at DESC, id DESC",
            )?;
            let rows = stmt
                .query_map(params![plugin_id], Self::map_job)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn update_job(db: &Database, id: &str, input: UpdatePluginJobInput) -> DbResult<PluginJob> {
        db.transaction(|conn| {
            let current = Self::get_job_conn(conn, id)?
                .ok_or_else(|| DbError::NotFound(format!("plugin job {}", id)))?;
            let next_status = input.status.unwrap_or_else(|| current.status.clone());
            if next_status != current.status && !is_valid_transition(&current.status, &next_status)
            {
                return Err(DbError::InvalidParameter(format!(
                    "invalid job transition: {} -> {}",
                    current.status, next_status
                )));
            }

            conn.execute(
                "UPDATE plugin_jobs
                 SET status = ?1,
                     progress = COALESCE(?2, progress),
                     current_step = COALESCE(?3, current_step),
                     output_json = COALESCE(?4, output_json),
                     error_json = COALESCE(?5, error_json),
                     updated_at = datetime('now')
                 WHERE id = ?6",
                params![
                    next_status,
                    input.progress,
                    input.current_step,
                    input.output_json,
                    input.error_json,
                    id,
                ],
            )?;

            Self::get_job_conn(conn, id)?
                .ok_or_else(|| DbError::NotFound(format!("plugin job {}", id)))
        })
    }

    pub fn upsert_job(db: &Database, input: CreatePluginJobInput) -> DbResult<PluginJob> {
        if let Some(existing) = Self::get_job(db, &input.id)? {
            return Ok(existing);
        }
        Self::create_job(db, input)
    }

    pub fn retry_job(db: &Database, source_id: &str, new_id: &str) -> DbResult<PluginJob> {
        let source = Self::get_job(db, source_id)?
            .ok_or_else(|| DbError::NotFound(source_id.to_string()))?;
        Self::create_job(
            db,
            CreatePluginJobInput {
                id: new_id.to_string(),
                plugin_id: source.plugin_id,
                parent_job_id: Some(source.id),
                kind: source.kind,
                input_json: source.input_json,
            },
        )
    }

    fn get_job_conn(conn: &Connection, id: &str) -> DbResult<Option<PluginJob>> {
        conn.query_row(
            "SELECT id, plugin_id, parent_job_id, kind, status, progress, current_step,
                    input_json, output_json, error_json, created_at, updated_at
             FROM plugin_jobs WHERE id = ?1",
            params![id],
            Self::map_job,
        )
        .optional()
        .map_err(Into::into)
    }

    fn get_installation_conn(
        conn: &Connection,
        plugin_id: &str,
    ) -> DbResult<Option<PluginInstallation>> {
        conn.query_row("SELECT plugin_id, manifest_json, source_json, resolved_commit, package_sha256, approved_permissions_json, capabilities_json, current_path, previous_path, status, installed_at, updated_at FROM plugin_installations WHERE plugin_id = ?1", params![plugin_id], |row| Ok(PluginInstallation {
            plugin_id: row.get(0)?, manifest_json: row.get(1)?, source_json: row.get(2)?, resolved_commit: row.get(3)?, package_sha256: row.get(4)?, approved_permissions_json: row.get(5)?, capabilities_json: row.get(6)?, current_path: row.get(7)?, previous_path: row.get(8)?, status: row.get(9)?, installed_at: row.get(10)?, updated_at: row.get(11)?,
        })).optional().map_err(Into::into)
    }

    fn map_job(row: &rusqlite::Row<'_>) -> rusqlite::Result<PluginJob> {
        Ok(PluginJob {
            id: row.get(0)?,
            plugin_id: row.get(1)?,
            parent_job_id: row.get(2)?,
            kind: row.get(3)?,
            status: row.get(4)?,
            progress: row.get(5)?,
            current_step: row.get(6)?,
            input_json: row.get(7)?,
            output_json: row.get(8)?,
            error_json: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }
}

fn is_valid_transition(current: &str, next: &str) -> bool {
    matches!(
        (current, next),
        ("queued", "running")
            | ("queued", "cancelled")
            | ("running", "paused")
            | ("running", "completed")
            | ("running", "failed")
            | ("running", "cancelled")
            | ("paused", "running")
            | ("paused", "cancelled")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Database;

    #[test]
    fn creates_and_lists_plugin_jobs_by_owner() {
        let db = Database::new_in_memory().unwrap();
        let job = PluginService::create_job(
            &db,
            CreatePluginJobInput {
                id: "job-1".to_string(),
                plugin_id: "guyantools.example".to_string(),
                parent_job_id: None,
                kind: "download".to_string(),
                input_json: "{}".to_string(),
            },
        )
        .unwrap();

        assert_eq!(job.status, "queued");
        assert_eq!(
            PluginService::list_jobs(&db, "guyantools.example")
                .unwrap()
                .len(),
            1
        );
        assert!(PluginService::list_jobs(&db, "other.plugin")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn rejects_invalid_job_state_transitions() {
        let db = Database::new_in_memory().unwrap();
        PluginService::create_job(
            &db,
            CreatePluginJobInput {
                id: "job-2".to_string(),
                plugin_id: "guyantools.example".to_string(),
                parent_job_id: None,
                kind: "media".to_string(),
                input_json: "{}".to_string(),
            },
        )
        .unwrap();

        let error = PluginService::update_job(
            &db,
            "job-2",
            UpdatePluginJobInput {
                status: Some("completed".to_string()),
                progress: Some(1.0),
                current_step: None,
                output_json: None,
                error_json: None,
            },
        )
        .unwrap_err();

        assert!(error.to_string().contains("invalid job transition"));
    }

    #[test]
    fn owns_file_grants_and_marketplace_cache() {
        let db = Database::new_in_memory().unwrap();
        let grant = PluginService::create_file_grant(
            &db,
            CreatePluginFileGrantInput {
                id: "grant-1".into(),
                plugin_id: "plugin.one".into(),
                purpose: "data".into(),
                root_path: "C:/data".into(),
                access_mode: "read-write".into(),
                expires_at: "2099-01-01T00:00:00Z".into(),
                max_bytes: 1024,
            },
        )
        .unwrap();
        assert_eq!(grant.plugin_id, "plugin.one");
        assert!(PluginService::revoke_file_grant(&db, "other.plugin", "grant-1").is_err());
        PluginService::revoke_file_grant(&db, "plugin.one", "grant-1").unwrap();
        let cache = PluginService::upsert_marketplace(
            &db,
            UpsertPluginMarketplaceInput {
                id: "official".into(),
                url: "https://example.com/catalog.json".into(),
                ref_name: "main".into(),
                catalog_json: "{}".into(),
                catalog_sha256: "abc".into(),
                enabled: true,
            },
        )
        .unwrap();
        assert_eq!(cache.id, "official");
        assert_eq!(PluginService::list_marketplaces(&db).unwrap().len(), 1);
    }

    #[test]
    fn upserts_installations_and_retries_with_a_child_job() {
        let db = Database::new_in_memory().unwrap();
        let installation = PluginService::upsert_installation(
            &db,
            UpsertPluginInstallationInput {
                plugin_id: "plugin.one".into(),
                manifest_json: "{}".into(),
                source_json: "{}".into(),
                resolved_commit: Some("abc1234".into()),
                package_sha256: None,
                approved_permissions_json: "[]".into(),
                capabilities_json: "[]".into(),
                current_path: "C:/current".into(),
                previous_path: None,
                status: "resolved".into(),
            },
        )
        .unwrap();
        assert_eq!(installation.resolved_commit.as_deref(), Some("abc1234"));
        assert!(PluginService::get_installation(&db, "plugin.one")
            .unwrap()
            .is_some());

        let job = PluginService::create_job(
            &db,
            CreatePluginJobInput {
                id: "job-parent".into(),
                plugin_id: "plugin.one".into(),
                parent_job_id: None,
                kind: "download".into(),
                input_json: "{}".into(),
            },
        )
        .unwrap();
        let retry = PluginService::retry_job(&db, &job.id, "job-retry").unwrap();
        assert_eq!(retry.parent_job_id.as_deref(), Some("job-parent"));
    }
}
