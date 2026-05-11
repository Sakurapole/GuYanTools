use super::{DiscoveryBackend, MdnsDiscoveryBackend};
use crate::db::{Database, DbResult};
use crate::models::{
    MultiDeviceClipboardDevice, MultiDeviceClipboardDiscoveredDevice,
    MultiDeviceClipboardDeviceStatus, MultiDeviceClipboardDiscoveryConfig,
    MultiDeviceClipboardEvent, MultiDeviceClipboardItem, UpsertMultiDeviceClipboardDeviceInput,
    UpsertMultiDeviceClipboardItemInput,
};
use rusqlite::{params, OptionalExtension};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[cfg(feature = "napi")]
use crate::event::{emit_serialized_event, register_event_sink, EventSink};

pub struct MultiDeviceClipboardManager {
    db: Arc<Database>,
    discovery: Mutex<Box<dyn DiscoveryBackend + Send>>,
    discovered: Arc<Mutex<HashMap<String, MultiDeviceClipboardDiscoveredDevice>>>,
    #[cfg(feature = "napi")]
    event_sink: Arc<Mutex<Option<EventSink>>>,
}

impl MultiDeviceClipboardManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            discovery: Mutex::new(Box::new(MdnsDiscoveryBackend::new())),
            discovered: Arc::new(Mutex::new(HashMap::new())),
            #[cfg(feature = "napi")]
            event_sink: Arc::new(Mutex::new(None)),
        }
    }

    pub fn get_or_create_local_device(&self, name: String) -> DbResult<MultiDeviceClipboardDevice> {
        let trimmed_name = if name.trim().is_empty() {
            "GuYanTools".to_string()
        } else {
            name.trim().to_string()
        };

        let existing = self.db.with_connection(|conn| {
            conn.query_row(
                "SELECT id, name, platform, public_key, trusted, is_self, last_address, last_port, last_seen_at, created_at, updated_at
                 FROM multi_device_clipboard_devices WHERE is_self = 1 LIMIT 1",
                [],
                map_device,
            )
            .optional()
            .map_err(Into::into)
        })?;

        if let Some(device) = existing {
            if device.name == trimmed_name {
                return Ok(device);
            }
            return self.upsert_device(UpsertMultiDeviceClipboardDeviceInput {
                id: device.id,
                name: trimmed_name,
                platform: Some(device.platform),
                public_key: device.public_key,
                trusted: Some(true),
                is_self: Some(true),
                last_address: device.last_address,
                last_port: device.last_port,
                last_seen_at: device.last_seen_at,
            });
        }

        self.upsert_device(UpsertMultiDeviceClipboardDeviceInput {
            id: Uuid::new_v4().to_string(),
            name: trimmed_name,
            platform: Some("desktop".to_string()),
            public_key: None,
            trusted: Some(true),
            is_self: Some(true),
            last_address: None,
            last_port: None,
            last_seen_at: Some(unix_now()),
        })
    }

    pub fn start_discovery(
        &self,
        config: MultiDeviceClipboardDiscoveryConfig,
    ) -> anyhow::Result<()> {
        let discovered = self.discovered.clone();
        let db = self.db.clone();
        #[cfg(feature = "napi")]
        let sink_store = self.event_sink.clone();
        let on_event = Arc::new(move |event: MultiDeviceClipboardEvent| {
            match &event {
                MultiDeviceClipboardEvent::DeviceFound { device } => {
                    if let Ok(mut map) = discovered.lock() {
                        let should_update = map
                            .get(&device.id)
                            .map(|existing| device.last_seen_at >= existing.last_seen_at)
                            .unwrap_or(true);
                        if should_update {
                            map.insert(device.id.clone(), device.clone());
                        }
                    }
                    let _ = upsert_discovered_device(&db, device);
                }
                MultiDeviceClipboardEvent::DeviceLost { service_name } => {
                    if let Ok(mut map) = discovered.lock() {
                        map.retain(|_, device| &device.service_name != service_name);
                    }
                }
            }
            #[cfg(feature = "napi")]
            emit_serialized_event(&sink_store, &event, "multi-device-clipboard");
        });

        let mut discovery = self
            .discovery
            .lock()
            .map_err(|_| anyhow::anyhow!("multi-device clipboard discovery poisoned"))?;
        discovery.start(config, on_event)
    }

    pub fn stop_discovery(&self) {
        if let Ok(mut discovery) = self.discovery.lock() {
            discovery.stop();
        }
        if let Ok(mut discovered) = self.discovered.lock() {
            discovered.clear();
        }
    }

    pub fn list_discovered_devices(&self) -> Vec<MultiDeviceClipboardDiscoveredDevice> {
        self.discovered
            .lock()
            .map(|map| map.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn list_device_statuses(
        &self,
        online_window_seconds: i64,
    ) -> DbResult<Vec<MultiDeviceClipboardDeviceStatus>> {
        let online_window_seconds = online_window_seconds.clamp(10, 600);
        let now = unix_now();
        let discovered = self
            .discovered
            .lock()
            .map(|map| map.clone())
            .unwrap_or_default();
        let mut devices = self.list_devices()?;
        let mut known_ids = std::collections::HashSet::new();
        let mut statuses = Vec::new();

        for device in devices.drain(..) {
            known_ids.insert(device.id.clone());
            let discovered_device = discovered.get(&device.id);
            let last_seen_at = latest_seen(device.last_seen_at, discovered_device);
            let seconds_since_seen = last_seen_at.map(|seen| (now - seen).max(0));
            let online = seconds_since_seen
                .map(|seconds| seconds <= online_window_seconds)
                .unwrap_or(false);
            let state = if device.is_self {
                "self"
            } else if device.trusted && online {
                "trustedOnline"
            } else if device.trusted {
                "trustedOffline"
            } else if online {
                "available"
            } else {
                "unknown"
            };

            statuses.push(MultiDeviceClipboardDeviceStatus {
                device_id: device.id,
                name: device.name,
                platform: device.platform,
                trusted: device.trusted,
                is_self: device.is_self,
                state: state.to_string(),
                online,
                last_address: discovered_device
                    .map(|value| value.address.clone())
                    .or(device.last_address),
                last_port: discovered_device.map(|value| value.port).or(device.last_port),
                last_seen_at,
                seconds_since_seen,
            });
        }

        for device in discovered.values() {
            if known_ids.contains(&device.id) {
                continue;
            }
            let seconds_since_seen = (now - device.last_seen_at).max(0);
            let online = seconds_since_seen <= online_window_seconds;
            statuses.push(MultiDeviceClipboardDeviceStatus {
                device_id: device.id.clone(),
                name: device.name.clone(),
                platform: device.platform.clone(),
                trusted: false,
                is_self: false,
                state: if online { "available" } else { "unknown" }.to_string(),
                online,
                last_address: Some(device.address.clone()),
                last_port: Some(device.port),
                last_seen_at: Some(device.last_seen_at),
                seconds_since_seen: Some(seconds_since_seen),
            });
        }

        statuses.sort_by(|a, b| {
            device_status_rank(&a.state)
                .cmp(&device_status_rank(&b.state))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(statuses)
    }

    pub fn list_devices(&self) -> DbResult<Vec<MultiDeviceClipboardDevice>> {
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, platform, public_key, trusted, is_self, last_address, last_port, last_seen_at, created_at, updated_at
                 FROM multi_device_clipboard_devices
                 ORDER BY is_self DESC, trusted DESC, COALESCE(last_seen_at, 0) DESC, name ASC",
            )?;
            let rows = stmt
                .query_map([], map_device)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn upsert_device(
        &self,
        input: UpsertMultiDeviceClipboardDeviceInput,
    ) -> DbResult<MultiDeviceClipboardDevice> {
        let now = input.last_seen_at.unwrap_or_else(unix_now);
        let platform = input.platform.unwrap_or_else(|| "desktop".to_string());
        let trusted = input.trusted.unwrap_or(false);
        let is_self = input.is_self.unwrap_or(false);
        self.db.with_connection(|conn| {
            if is_self {
                conn.execute(
                    "UPDATE multi_device_clipboard_devices SET is_self = 0 WHERE is_self = 1 AND id <> ?1",
                    params![input.id],
                )?;
            }
            conn.execute(
                "INSERT INTO multi_device_clipboard_devices
                 (id, name, platform, public_key, trusted, is_self, last_address, last_port, last_seen_at, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   platform = excluded.platform,
                   public_key = COALESCE(excluded.public_key, multi_device_clipboard_devices.public_key),
                   trusted = CASE WHEN excluded.trusted = 1 THEN 1 ELSE multi_device_clipboard_devices.trusted END,
                   is_self = excluded.is_self,
                   last_address = COALESCE(excluded.last_address, multi_device_clipboard_devices.last_address),
                   last_port = COALESCE(excluded.last_port, multi_device_clipboard_devices.last_port),
                   last_seen_at = COALESCE(excluded.last_seen_at, multi_device_clipboard_devices.last_seen_at),
                   updated_at = excluded.updated_at",
                params![
                    input.id,
                    input.name,
                    platform,
                    input.public_key,
                    bool_to_i64(trusted),
                    bool_to_i64(is_self),
                    input.last_address,
                    input.last_port.map(|v| v as i64),
                    now
                ],
            )?;
            get_device_with_conn(conn, &input.id)
        })
    }

    pub fn set_device_trusted(
        &self,
        id: String,
        trusted: bool,
    ) -> DbResult<MultiDeviceClipboardDevice> {
        self.db.with_connection(|conn| {
            conn.execute(
                "UPDATE multi_device_clipboard_devices
                 SET trusted = ?2, updated_at = unixepoch()
                 WHERE id = ?1",
                params![id, bool_to_i64(trusted)],
            )?;
            get_device_with_conn(conn, &id)
        })
    }

    pub fn forget_device(&self, id: String) -> DbResult<()> {
        self.db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM multi_device_clipboard_devices WHERE id = ?1 AND is_self = 0",
                params![id],
            )?;
            Ok(())
        })
    }

    pub fn list_items(&self, limit: i64) -> DbResult<Vec<MultiDeviceClipboardItem>> {
        let normalized_limit = limit.clamp(1, 1000);
        self.db.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, source_device_id, source_device_name, content_type, mime_type, text, file_name, asset_path, preview_path,
                        byte_size, content_hash, tags_json, local_only, created_at, updated_at
                 FROM multi_device_clipboard_items
                 ORDER BY created_at DESC, updated_at DESC
                 LIMIT ?1",
            )?;
            let rows = stmt
                .query_map(params![normalized_limit], map_item)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn get_item(&self, id: String) -> DbResult<MultiDeviceClipboardItem> {
        self.db
            .with_connection(|conn| get_item_with_conn(conn, &id))
    }

    pub fn upsert_item(
        &self,
        input: UpsertMultiDeviceClipboardItemInput,
    ) -> DbResult<MultiDeviceClipboardItem> {
        let created_at = input.created_at.unwrap_or_else(unix_now);
        let byte_size = input.byte_size.unwrap_or(0).max(0);
        let tags_json = input.tags_json.unwrap_or_else(|| "[]".to_string());
        let local_only = input.local_only.unwrap_or(false);
        self.db.with_connection(|conn| {
            conn.execute(
                "INSERT INTO multi_device_clipboard_items
                 (id, source_device_id, source_device_name, content_type, mime_type, text, file_name, asset_path, preview_path,
                  byte_size, content_hash, tags_json, local_only, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, unixepoch())
                 ON CONFLICT(source_device_id, content_hash) DO UPDATE SET
                   source_device_name = excluded.source_device_name,
                   content_type = excluded.content_type,
                   mime_type = excluded.mime_type,
                   text = excluded.text,
                   file_name = excluded.file_name,
                   asset_path = COALESCE(excluded.asset_path, multi_device_clipboard_items.asset_path),
                   preview_path = COALESCE(excluded.preview_path, multi_device_clipboard_items.preview_path),
                   byte_size = excluded.byte_size,
                   tags_json = excluded.tags_json,
                   local_only = excluded.local_only,
                   updated_at = unixepoch()",
                params![
                    input.id,
                    input.source_device_id,
                    input.source_device_name,
                    input.content_type,
                    input.mime_type,
                    input.text,
                    input.file_name,
                    input.asset_path,
                    input.preview_path,
                    byte_size,
                    input.content_hash,
                    tags_json,
                    bool_to_i64(local_only),
                    created_at,
                ],
            )?;
            get_item_by_hash_with_conn(conn, &input.source_device_id, &input.content_hash)
        })
    }

    pub fn delete_item(&self, id: String) -> DbResult<()> {
        self.db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM multi_device_clipboard_items WHERE id = ?1",
                params![id],
            )?;
            Ok(())
        })
    }

    pub fn clear_history(&self) -> DbResult<()> {
        self.db.with_connection(|conn| {
            conn.execute("DELETE FROM multi_device_clipboard_items", [])?;
            Ok(())
        })
    }

    pub fn prune_history(&self, history_limit: i64) -> DbResult<()> {
        let normalized_limit = history_limit.clamp(1, 5000);
        self.db.with_connection(|conn| {
            conn.execute(
                "DELETE FROM multi_device_clipboard_items
                 WHERE id NOT IN (
                   SELECT id FROM multi_device_clipboard_items
                   ORDER BY created_at DESC, updated_at DESC
                   LIMIT ?1
                 )",
                params![normalized_limit],
            )?;
            Ok(())
        })
    }

    pub fn compute_content_hash(parts: Vec<String>) -> String {
        let mut hasher = Sha256::new();
        for part in parts {
            hasher.update((part.len() as u64).to_le_bytes());
            hasher.update(part.as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }

    #[cfg(feature = "napi")]
    pub fn register_event_sink(&self, sink: EventSink) -> anyhow::Result<()> {
        register_event_sink(&self.event_sink, sink, "multi-device clipboard")
    }
}

fn get_device_with_conn(
    conn: &rusqlite::Connection,
    id: &str,
) -> DbResult<MultiDeviceClipboardDevice> {
    let device = conn.query_row(
        "SELECT id, name, platform, public_key, trusted, is_self, last_address, last_port, last_seen_at, created_at, updated_at
         FROM multi_device_clipboard_devices WHERE id = ?1",
        params![id],
        map_device,
    )?;
    Ok(device)
}

fn upsert_discovered_device(
    db: &Database,
    device: &MultiDeviceClipboardDiscoveredDevice,
) -> DbResult<MultiDeviceClipboardDevice> {
    db.with_connection(|conn| {
        conn.execute(
            "INSERT INTO multi_device_clipboard_devices
             (id, name, platform, public_key, trusted, is_self, last_address, last_port, last_seen_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, NULL, 0, 0, ?4, ?5, ?6, ?6, ?6)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               platform = excluded.platform,
               trusted = multi_device_clipboard_devices.trusted,
               is_self = multi_device_clipboard_devices.is_self,
               last_address = excluded.last_address,
               last_port = excluded.last_port,
               last_seen_at = excluded.last_seen_at,
               updated_at = excluded.updated_at",
            params![
                device.id,
                device.name,
                device.platform,
                device.address,
                device.port as i64,
                device.last_seen_at,
            ],
        )?;
        get_device_with_conn(conn, &device.id)
    })
}

fn latest_seen(
    stored_last_seen_at: Option<i64>,
    discovered: Option<&MultiDeviceClipboardDiscoveredDevice>,
) -> Option<i64> {
    match (stored_last_seen_at, discovered.map(|device| device.last_seen_at)) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn device_status_rank(state: &str) -> u8 {
    match state {
        "self" => 0,
        "trustedOnline" => 1,
        "available" => 2,
        "trustedOffline" => 3,
        _ => 4,
    }
}

fn get_item_with_conn(conn: &rusqlite::Connection, id: &str) -> DbResult<MultiDeviceClipboardItem> {
    let item = conn.query_row(
        "SELECT id, source_device_id, source_device_name, content_type, mime_type, text, file_name, asset_path, preview_path,
                byte_size, content_hash, tags_json, local_only, created_at, updated_at
         FROM multi_device_clipboard_items WHERE id = ?1",
        params![id],
        map_item,
    )?;
    Ok(item)
}

fn get_item_by_hash_with_conn(
    conn: &rusqlite::Connection,
    source_device_id: &str,
    content_hash: &str,
) -> DbResult<MultiDeviceClipboardItem> {
    let item = conn.query_row(
        "SELECT id, source_device_id, source_device_name, content_type, mime_type, text, file_name, asset_path, preview_path,
                byte_size, content_hash, tags_json, local_only, created_at, updated_at
         FROM multi_device_clipboard_items
         WHERE source_device_id = ?1 AND content_hash = ?2",
        params![source_device_id, content_hash],
        map_item,
    )?;
    Ok(item)
}

fn map_device(row: &rusqlite::Row<'_>) -> rusqlite::Result<MultiDeviceClipboardDevice> {
    let last_port: Option<i64> = row.get(7)?;
    Ok(MultiDeviceClipboardDevice {
        id: row.get(0)?,
        name: row.get(1)?,
        platform: row.get(2)?,
        public_key: row.get(3)?,
        trusted: int_to_bool(row.get(4)?),
        is_self: int_to_bool(row.get(5)?),
        last_address: row.get(6)?,
        last_port: last_port.map(|value| value as u32),
        last_seen_at: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn map_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<MultiDeviceClipboardItem> {
    Ok(MultiDeviceClipboardItem {
        id: row.get(0)?,
        source_device_id: row.get(1)?,
        source_device_name: row.get(2)?,
        content_type: row.get(3)?,
        mime_type: row.get(4)?,
        text: row.get(5)?,
        file_name: row.get(6)?,
        asset_path: row.get(7)?,
        preview_path: row.get(8)?,
        byte_size: row.get(9)?,
        content_hash: row.get(10)?,
        tags_json: row.get(11)?,
        local_only: int_to_bool(row.get(12)?),
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
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

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_devices_and_items() {
        let db = Arc::new(Database::new_in_memory().unwrap());
        let manager = MultiDeviceClipboardManager::new(db);
        let device = manager
            .get_or_create_local_device("Laptop".to_string())
            .unwrap();
        assert!(device.is_self);
        assert!(device.trusted);

        let hash = MultiDeviceClipboardManager::compute_content_hash(vec![
            "text".to_string(),
            "hello".to_string(),
        ]);
        let item = manager
            .upsert_item(UpsertMultiDeviceClipboardItemInput {
                id: Uuid::new_v4().to_string(),
                source_device_id: device.id.clone(),
                source_device_name: device.name.clone(),
                content_type: "text".to_string(),
                text: Some("hello".to_string()),
                content_hash: hash.clone(),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(item.content_hash, hash);

        let items = manager.list_items(10).unwrap();
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn content_hash_is_stable() {
        let a = MultiDeviceClipboardManager::compute_content_hash(vec![
            "text".to_string(),
            "hello".to_string(),
        ]);
        let b = MultiDeviceClipboardManager::compute_content_hash(vec![
            "text".to_string(),
            "hello".to_string(),
        ]);
        let c = MultiDeviceClipboardManager::compute_content_hash(vec![
            "text".to_string(),
            "world".to_string(),
        ]);
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn list_device_statuses_classifies_trusted_and_available_devices() {
        let db = Arc::new(Database::new_in_memory().unwrap());
        let manager = MultiDeviceClipboardManager::new(db.clone());
        let local = manager
            .get_or_create_local_device("Laptop".to_string())
            .unwrap();
        let now = unix_now();
        let trusted_online = manager
            .upsert_device(UpsertMultiDeviceClipboardDeviceInput {
                id: "trusted-online".to_string(),
                name: "Phone".to_string(),
                platform: Some("android".to_string()),
                trusted: Some(true),
                is_self: Some(false),
                last_address: Some("192.168.0.50".to_string()),
                last_port: Some(49649),
                last_seen_at: Some(now),
                public_key: None,
            })
            .unwrap();
        manager
            .upsert_device(UpsertMultiDeviceClipboardDeviceInput {
                id: "trusted-offline".to_string(),
                name: "Tablet".to_string(),
                platform: Some("android".to_string()),
                trusted: Some(true),
                is_self: Some(false),
                last_address: Some("192.168.0.51".to_string()),
                last_port: Some(49649),
                last_seen_at: Some(now - 120),
                public_key: None,
            })
            .unwrap();
        upsert_discovered_device(
            &db,
            &MultiDeviceClipboardDiscoveredDevice {
                id: "available".to_string(),
                name: "Desktop".to_string(),
                platform: "desktop".to_string(),
                address: "192.168.0.52".to_string(),
                port: 49649,
                service_name: "http://192.168.0.52:49649".to_string(),
                last_seen_at: now,
            },
        )
        .unwrap();

        let statuses = manager.list_device_statuses(60).unwrap();
        assert_eq!(
            statuses
                .iter()
                .find(|status| status.device_id == local.id)
                .unwrap()
                .state,
            "self"
        );
        assert_eq!(
            statuses
                .iter()
                .find(|status| status.device_id == trusted_online.id)
                .unwrap()
                .state,
            "trustedOnline"
        );
        assert_eq!(
            statuses
                .iter()
                .find(|status| status.device_id == "trusted-offline")
                .unwrap()
                .state,
            "trustedOffline"
        );
        assert_eq!(
            statuses
                .iter()
                .find(|status| status.device_id == "available")
                .unwrap()
                .state,
            "available"
        );
    }
}
