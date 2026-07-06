CREATE TABLE IF NOT EXISTS sync_devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_profiles (
  profile_id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL,
  owner_device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  is_local INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_object_state (
  collection TEXT NOT NULL,
  object_id TEXT NOT NULL,
  owner_device_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  base_rev TEXT,
  local_rev TEXT,
  remote_rev TEXT,
  payload_hash TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection, object_id)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  op_id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  object_id TEXT NOT NULL,
  op_kind TEXT NOT NULL,
  base_rev TEXT,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  conflict_id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  object_id TEXT NOT NULL,
  title TEXT NOT NULL,
  local_payload_json TEXT NOT NULL,
  remote_payload_json TEXT NOT NULL,
  base_payload_json TEXT,
  local_updated_at INTEGER NOT NULL,
  remote_updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_provider_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_status
  ON sync_outbox(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status
  ON sync_conflicts(status, created_at);
