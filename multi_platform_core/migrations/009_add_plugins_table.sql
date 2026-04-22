CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    manifest TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'discovered',
    install_source TEXT NOT NULL,
    resolved_entry_path TEXT NOT NULL,
    package_name TEXT,
    local_path TEXT,
    error TEXT,
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);
