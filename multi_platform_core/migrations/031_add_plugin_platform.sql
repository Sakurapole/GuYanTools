CREATE TABLE IF NOT EXISTS plugin_marketplaces (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    ref TEXT NOT NULL,
    catalog_json TEXT NOT NULL,
    catalog_sha256 TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    refreshed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plugin_installations (
    plugin_id TEXT PRIMARY KEY,
    manifest_json TEXT NOT NULL,
    source_json TEXT NOT NULL,
    resolved_commit TEXT,
    package_sha256 TEXT,
    approved_permissions_json TEXT NOT NULL DEFAULT '[]',
    capabilities_json TEXT NOT NULL DEFAULT '[]',
    current_path TEXT NOT NULL,
    previous_path TEXT,
    status TEXT NOT NULL DEFAULT 'discovered',
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plugin_jobs (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    parent_job_id TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    current_step TEXT,
    input_json TEXT NOT NULL,
    output_json TEXT,
    error_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plugin_jobs_owner
    ON plugin_jobs(plugin_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_plugin_jobs_status
    ON plugin_jobs(status, updated_at);

CREATE TABLE IF NOT EXISTS plugin_file_grants (
    id TEXT PRIMARY KEY,
    plugin_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    root_path TEXT NOT NULL,
    access_mode TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    max_bytes INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plugin_file_grants_owner
    ON plugin_file_grants(plugin_id, revoked, expires_at);

CREATE TABLE IF NOT EXISTS plugin_secrets (
    plugin_id TEXT NOT NULL,
    key TEXT NOT NULL,
    ciphertext BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (plugin_id, key)
);
