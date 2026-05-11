CREATE TABLE IF NOT EXISTS multi_device_clipboard_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'desktop',
  public_key TEXT,
  trusted INTEGER NOT NULL DEFAULT 0,
  is_self INTEGER NOT NULL DEFAULT 0,
  last_address TEXT,
  last_port INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_multi_device_clipboard_devices_trusted
  ON multi_device_clipboard_devices(trusted, last_seen_at);

CREATE TABLE IF NOT EXISTS multi_device_clipboard_items (
  id TEXT PRIMARY KEY,
  source_device_id TEXT NOT NULL,
  source_device_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  mime_type TEXT,
  text TEXT,
  file_name TEXT,
  asset_path TEXT,
  preview_path TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  local_only INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_multi_device_clipboard_items_created_at
  ON multi_device_clipboard_items(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_multi_device_clipboard_items_hash_source
  ON multi_device_clipboard_items(source_device_id, content_hash);
