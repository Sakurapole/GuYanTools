use crate::db::{Database, DbResult};
use crate::models::{SyncConflict, SyncObjectState, SyncOutboxItem, SyncProfile};
use rusqlite::params;

pub struct SyncService;

impl SyncService {
    pub fn list_profiles(db: &Database) -> DbResult<Vec<SyncProfile>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT profile_id, profile_name, owner_device_id, schema_version, app_version,
                        payload_hash, is_local, is_active, is_default, payload_json, created_at, updated_at
                 FROM sync_profiles
                 ORDER BY is_active DESC, is_default DESC, updated_at DESC, profile_name ASC",
            )?;
            let rows = stmt
                .query_map([], map_profile)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_profile(db: &Database, profile: SyncProfile) -> DbResult<SyncProfile> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO sync_profiles
                 (profile_id, profile_name, owner_device_id, schema_version, app_version, payload_hash,
                  is_local, is_active, is_default, payload_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(profile_id) DO UPDATE SET
                   profile_name = excluded.profile_name,
                   owner_device_id = excluded.owner_device_id,
                   schema_version = excluded.schema_version,
                   app_version = excluded.app_version,
                   payload_hash = excluded.payload_hash,
                   is_local = excluded.is_local,
                   is_active = excluded.is_active,
                   is_default = excluded.is_default,
                   payload_json = excluded.payload_json,
                   updated_at = excluded.updated_at",
                params![
                    profile.profile_id,
                    profile.profile_name,
                    profile.owner_device_id,
                    profile.schema_version,
                    profile.app_version,
                    profile.payload_hash,
                    bool_to_i64(profile.is_local),
                    bool_to_i64(profile.is_active),
                    bool_to_i64(profile.is_default),
                    profile.payload_json,
                    profile.created_at,
                    profile.updated_at,
                ],
            )?;
            get_profile_with_conn(conn, &profile.profile_id)
        })
    }

    pub fn set_active_profile(db: &Database, profile_id: &str) -> DbResult<()> {
        db.transaction(|tx| {
            tx.execute("UPDATE sync_profiles SET is_active = 0", [])?;
            tx.execute(
                "UPDATE sync_profiles SET is_active = 1, updated_at = MAX(updated_at, unixepoch())
                 WHERE profile_id = ?1",
                params![profile_id],
            )?;
            Ok(())
        })
    }

    pub fn set_default_profile(db: &Database, profile_id: &str) -> DbResult<()> {
        db.transaction(|tx| {
            tx.execute("UPDATE sync_profiles SET is_default = 0", [])?;
            tx.execute(
                "UPDATE sync_profiles SET is_default = 1, updated_at = MAX(updated_at, unixepoch())
                 WHERE profile_id = ?1",
                params![profile_id],
            )?;
            Ok(())
        })
    }

    pub fn list_conflicts(db: &Database) -> DbResult<Vec<SyncConflict>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT conflict_id, collection, object_id, title, local_payload_json, remote_payload_json,
                        base_payload_json, local_updated_at, remote_updated_at, status, created_at, resolved_at
                 FROM sync_conflicts
                 WHERE status = 'pending'
                 ORDER BY created_at DESC",
            )?;
            let rows = stmt
                .query_map([], map_conflict)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn list_object_states(db: &Database) -> DbResult<Vec<SyncObjectState>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT collection, object_id, owner_device_id, schema_version, base_rev,
                        local_rev, remote_rev, payload_hash, dirty, deleted, updated_at
                 FROM sync_object_state
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt
                .query_map([], map_object_state)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn list_pending_outbox(db: &Database) -> DbResult<Vec<SyncOutboxItem>> {
        db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT op_id, collection, object_id, op_kind, base_rev, payload_json, payload_hash,
                        status, retry_count, last_error, created_at, updated_at
                 FROM sync_outbox
                 WHERE status = 'pending'
                 ORDER BY created_at ASC",
            )?;
            let rows = stmt
                .query_map([], map_outbox_item)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_object_state(db: &Database, state: SyncObjectState) -> DbResult<SyncObjectState> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO sync_object_state
                 (collection, object_id, owner_device_id, schema_version, base_rev, local_rev,
                  remote_rev, payload_hash, dirty, deleted, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(collection, object_id) DO UPDATE SET
                   owner_device_id = excluded.owner_device_id,
                   schema_version = excluded.schema_version,
                   base_rev = excluded.base_rev,
                   local_rev = excluded.local_rev,
                   remote_rev = excluded.remote_rev,
                   payload_hash = excluded.payload_hash,
                   dirty = excluded.dirty,
                   deleted = excluded.deleted,
                   updated_at = excluded.updated_at",
                params![
                    state.collection,
                    state.object_id,
                    state.owner_device_id,
                    state.schema_version,
                    state.base_rev,
                    state.local_rev,
                    state.remote_rev,
                    state.payload_hash,
                    bool_to_i64(state.dirty),
                    bool_to_i64(state.deleted),
                    state.updated_at,
                ],
            )?;
            get_object_state_with_conn(conn, &state.collection, &state.object_id)
        })
    }

    pub fn upsert_outbox_item(db: &Database, item: SyncOutboxItem) -> DbResult<SyncOutboxItem> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO sync_outbox
                 (op_id, collection, object_id, op_kind, base_rev, payload_json, payload_hash,
                  status, retry_count, last_error, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(op_id) DO UPDATE SET
                   collection = excluded.collection,
                   object_id = excluded.object_id,
                   op_kind = excluded.op_kind,
                   base_rev = excluded.base_rev,
                   payload_json = excluded.payload_json,
                   payload_hash = excluded.payload_hash,
                   status = excluded.status,
                   retry_count = excluded.retry_count,
                   last_error = excluded.last_error,
                   updated_at = excluded.updated_at",
                params![
                    item.op_id,
                    item.collection,
                    item.object_id,
                    item.op_kind,
                    item.base_rev,
                    item.payload_json,
                    item.payload_hash,
                    item.status,
                    item.retry_count,
                    item.last_error,
                    item.created_at,
                    item.updated_at,
                ],
            )?;
            get_outbox_item_with_conn(conn, &item.op_id)
        })
    }

    pub fn mark_outbox_items_synced(
        db: &Database,
        op_ids: Vec<String>,
        updated_at: i64,
    ) -> DbResult<()> {
        db.transaction(|tx| {
            for op_id in op_ids {
                tx.execute(
                    "UPDATE sync_outbox SET status = 'synced', updated_at = ?2 WHERE op_id = ?1",
                    params![op_id, updated_at],
                )?;
            }
            Ok(())
        })
    }

    pub fn mark_outbox_items_synced_by_object(
        db: &Database,
        collection: &str,
        object_id: &str,
        updated_at: i64,
    ) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "UPDATE sync_outbox
                 SET status = 'synced', updated_at = ?3
                 WHERE collection = ?1 AND object_id = ?2 AND status = 'pending'",
                params![collection, object_id, updated_at],
            )?;
            Ok(())
        })
    }

    pub fn upsert_conflict(db: &Database, conflict: SyncConflict) -> DbResult<SyncConflict> {
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO sync_conflicts
                 (conflict_id, collection, object_id, title, local_payload_json, remote_payload_json,
                  base_payload_json, local_updated_at, remote_updated_at, status, created_at, resolved_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(conflict_id) DO UPDATE SET
                   title = excluded.title,
                   local_payload_json = excluded.local_payload_json,
                   remote_payload_json = excluded.remote_payload_json,
                   base_payload_json = excluded.base_payload_json,
                   local_updated_at = excluded.local_updated_at,
                   remote_updated_at = excluded.remote_updated_at,
                   status = excluded.status,
                   resolved_at = excluded.resolved_at",
                params![
                    conflict.conflict_id,
                    conflict.collection,
                    conflict.object_id,
                    conflict.title,
                    conflict.local_payload_json,
                    conflict.remote_payload_json,
                    conflict.base_payload_json,
                    conflict.local_updated_at,
                    conflict.remote_updated_at,
                    conflict.status,
                    conflict.created_at,
                    conflict.resolved_at,
                ],
            )?;
            get_conflict_with_conn(conn, &conflict.conflict_id)
        })
    }

    pub fn resolve_conflict(db: &Database, conflict_id: &str, resolved_at: i64) -> DbResult<()> {
        db.with_connection(|conn| {
            conn.execute(
                "UPDATE sync_conflicts SET status = 'resolved', resolved_at = ?2 WHERE conflict_id = ?1",
                params![conflict_id, resolved_at],
            )?;
            Ok(())
        })
    }
}

fn get_profile_with_conn(
    conn: &rusqlite::Connection,
    profile_id: &str,
) -> DbResult<SyncProfile> {
    let profile = conn.query_row(
        "SELECT profile_id, profile_name, owner_device_id, schema_version, app_version,
                payload_hash, is_local, is_active, is_default, payload_json, created_at, updated_at
         FROM sync_profiles WHERE profile_id = ?1",
        params![profile_id],
        map_profile,
    )?;
    Ok(profile)
}

fn map_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncProfile> {
    Ok(SyncProfile {
        profile_id: row.get(0)?,
        profile_name: row.get(1)?,
        owner_device_id: row.get(2)?,
        schema_version: row.get(3)?,
        app_version: row.get(4)?,
        payload_hash: row.get(5)?,
        is_local: int_to_bool(row.get(6)?),
        is_active: int_to_bool(row.get(7)?),
        is_default: int_to_bool(row.get(8)?),
        payload_json: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn map_conflict(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncConflict> {
    Ok(SyncConflict {
        conflict_id: row.get(0)?,
        collection: row.get(1)?,
        object_id: row.get(2)?,
        title: row.get(3)?,
        local_payload_json: row.get(4)?,
        remote_payload_json: row.get(5)?,
        base_payload_json: row.get(6)?,
        local_updated_at: row.get(7)?,
        remote_updated_at: row.get(8)?,
        status: row.get(9)?,
        created_at: row.get(10)?,
        resolved_at: row.get(11)?,
    })
}

fn get_object_state_with_conn(
    conn: &rusqlite::Connection,
    collection: &str,
    object_id: &str,
) -> DbResult<SyncObjectState> {
    let state = conn.query_row(
        "SELECT collection, object_id, owner_device_id, schema_version, base_rev,
                local_rev, remote_rev, payload_hash, dirty, deleted, updated_at
         FROM sync_object_state
         WHERE collection = ?1 AND object_id = ?2",
        params![collection, object_id],
        map_object_state,
    )?;
    Ok(state)
}

fn get_outbox_item_with_conn(
    conn: &rusqlite::Connection,
    op_id: &str,
) -> DbResult<SyncOutboxItem> {
    let item = conn.query_row(
        "SELECT op_id, collection, object_id, op_kind, base_rev, payload_json, payload_hash,
                status, retry_count, last_error, created_at, updated_at
         FROM sync_outbox
         WHERE op_id = ?1",
        params![op_id],
        map_outbox_item,
    )?;
    Ok(item)
}

fn get_conflict_with_conn(
    conn: &rusqlite::Connection,
    conflict_id: &str,
) -> DbResult<SyncConflict> {
    let conflict = conn.query_row(
        "SELECT conflict_id, collection, object_id, title, local_payload_json, remote_payload_json,
                base_payload_json, local_updated_at, remote_updated_at, status, created_at, resolved_at
         FROM sync_conflicts
         WHERE conflict_id = ?1",
        params![conflict_id],
        map_conflict,
    )?;
    Ok(conflict)
}

fn map_object_state(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncObjectState> {
    Ok(SyncObjectState {
        collection: row.get(0)?,
        object_id: row.get(1)?,
        owner_device_id: row.get(2)?,
        schema_version: row.get(3)?,
        base_rev: row.get(4)?,
        local_rev: row.get(5)?,
        remote_rev: row.get(6)?,
        payload_hash: row.get(7)?,
        dirty: int_to_bool(row.get(8)?),
        deleted: int_to_bool(row.get(9)?),
        updated_at: row.get(10)?,
    })
}

fn map_outbox_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<SyncOutboxItem> {
    Ok(SyncOutboxItem {
        op_id: row.get(0)?,
        collection: row.get(1)?,
        object_id: row.get(2)?,
        op_kind: row.get(3)?,
        base_rev: row.get(4)?,
        payload_json: row.get(5)?,
        payload_hash: row.get(6)?,
        status: row.get(7)?,
        retry_count: row.get(8)?,
        last_error: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn int_to_bool(value: i64) -> bool {
    value != 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upserts_and_selects_active_profile() {
        let db = Database::new_in_memory().unwrap();
        let first = sample_profile("profile-a", true, false);
        let second = sample_profile("profile-b", false, false);

        SyncService::upsert_profile(&db, first).unwrap();
        SyncService::upsert_profile(&db, second).unwrap();
        SyncService::set_active_profile(&db, "profile-b").unwrap();

        let profiles = SyncService::list_profiles(&db).unwrap();
        assert_eq!(profiles.len(), 2);
        assert!(profiles
            .iter()
            .any(|profile| profile.profile_id == "profile-b" && profile.is_active));
        assert!(profiles
            .iter()
            .all(|profile| profile.profile_id == "profile-b" || !profile.is_active));
    }

    #[test]
    fn selects_one_default_profile() {
        let db = Database::new_in_memory().unwrap();
        SyncService::upsert_profile(&db, sample_profile("profile-a", false, true)).unwrap();
        SyncService::upsert_profile(&db, sample_profile("profile-b", false, false)).unwrap();

        SyncService::set_default_profile(&db, "profile-b").unwrap();

        let profiles = SyncService::list_profiles(&db).unwrap();
        assert!(profiles
            .iter()
            .any(|profile| profile.profile_id == "profile-b" && profile.is_default));
        assert!(profiles
            .iter()
            .all(|profile| profile.profile_id == "profile-b" || !profile.is_default));
    }

    #[test]
    fn lists_pending_conflicts_only() {
        let db = Database::new_in_memory().unwrap();
        db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO sync_conflicts
                 (conflict_id, collection, object_id, title, local_payload_json, remote_payload_json,
                  base_payload_json, local_updated_at, remote_updated_at, status, created_at, resolved_at)
                 VALUES
                 ('pending-1', 'app.appearance', 'default', 'Theme', '{}', '{}', NULL, 10, 20, 'pending', 30, NULL),
                 ('resolved-1', 'app.appearance', 'default', 'Theme', '{}', '{}', NULL, 10, 20, 'resolved', 20, 40)",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        let conflicts = SyncService::list_conflicts(&db).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_id, "pending-1");
    }

    #[test]
    fn upserts_object_state_and_pending_outbox() {
        let db = Database::new_in_memory().unwrap();
        SyncService::upsert_object_state(
            &db,
            SyncObjectState {
                collection: "app.appearance".to_string(),
                object_id: "appearance".to_string(),
                owner_device_id: "device-a".to_string(),
                schema_version: 1,
                base_rev: Some("base".to_string()),
                local_rev: Some("local".to_string()),
                remote_rev: Some("remote".to_string()),
                payload_hash: "local".to_string(),
                dirty: true,
                deleted: false,
                updated_at: 100,
            },
        )
        .unwrap();
        SyncService::upsert_outbox_item(
            &db,
            SyncOutboxItem {
                op_id: "op-1".to_string(),
                collection: "app.appearance".to_string(),
                object_id: "appearance".to_string(),
                op_kind: "upsert".to_string(),
                base_rev: Some("base".to_string()),
                payload_json: "{\"theme\":\"dark\"}".to_string(),
                payload_hash: "local".to_string(),
                status: "pending".to_string(),
                retry_count: 0,
                last_error: None,
                created_at: 100,
                updated_at: 100,
            },
        )
        .unwrap();

        let states = SyncService::list_object_states(&db).unwrap();
        assert_eq!(states.len(), 1);
        assert!(states[0].dirty);

        let pending = SyncService::list_pending_outbox(&db).unwrap();
        assert_eq!(pending.len(), 1);
        SyncService::mark_outbox_items_synced(&db, vec!["op-1".to_string()], 200).unwrap();
        assert!(SyncService::list_pending_outbox(&db).unwrap().is_empty());
    }

    #[test]
    fn marks_pending_outbox_synced_by_object() {
        let db = Database::new_in_memory().unwrap();
        SyncService::upsert_outbox_item(&db, sample_outbox_item("op-1", "app.appearance", "appearance"))
            .unwrap();
        SyncService::upsert_outbox_item(&db, sample_outbox_item("op-2", "app.shortcuts", "shortcuts"))
            .unwrap();

        SyncService::mark_outbox_items_synced_by_object(&db, "app.appearance", "appearance", 200)
            .unwrap();

        let pending = SyncService::list_pending_outbox(&db).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].op_id, "op-2");
    }

    #[test]
    fn resolves_sync_conflict() {
        let db = Database::new_in_memory().unwrap();
        SyncService::upsert_conflict(
            &db,
            SyncConflict {
                conflict_id: "conflict-1".to_string(),
                collection: "app.appearance".to_string(),
                object_id: "appearance".to_string(),
                title: "Theme".to_string(),
                local_payload_json: "{}".to_string(),
                remote_payload_json: "{}".to_string(),
                base_payload_json: None,
                local_updated_at: 10,
                remote_updated_at: 20,
                status: "pending".to_string(),
                created_at: 30,
                resolved_at: None,
            },
        )
        .unwrap();

        assert_eq!(SyncService::list_conflicts(&db).unwrap().len(), 1);
        SyncService::resolve_conflict(&db, "conflict-1", 40).unwrap();
        assert!(SyncService::list_conflicts(&db).unwrap().is_empty());
    }

    fn sample_profile(profile_id: &str, active: bool, default: bool) -> SyncProfile {
        SyncProfile {
            profile_id: profile_id.to_string(),
            profile_name: format!("Profile {profile_id}"),
            owner_device_id: "device-a".to_string(),
            schema_version: 1,
            app_version: "0.0.3".to_string(),
            payload_hash: format!("hash-{profile_id}"),
            is_local: profile_id == "profile-a",
            is_active: active,
            is_default: default,
            payload_json: "{}".to_string(),
            created_at: 100,
            updated_at: 100,
        }
    }

    fn sample_outbox_item(op_id: &str, collection: &str, object_id: &str) -> SyncOutboxItem {
        SyncOutboxItem {
            op_id: op_id.to_string(),
            collection: collection.to_string(),
            object_id: object_id.to_string(),
            op_kind: "upsert".to_string(),
            base_rev: Some("base".to_string()),
            payload_json: "{}".to_string(),
            payload_hash: format!("hash-{op_id}"),
            status: "pending".to_string(),
            retry_count: 0,
            last_error: None,
            created_at: 100,
            updated_at: 100,
        }
    }
}
