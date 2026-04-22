-- Migration 011: Add SFTP / FTP client persistence tables

CREATE TABLE IF NOT EXISTS ftp_sessions (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'sftp',
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'password',
    save_password INTEGER NOT NULL DEFAULT 0,
    ssh_profile_id TEXT,
    folder_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    default_remote_path TEXT NOT NULL DEFAULT '/',
    default_local_path TEXT NOT NULL DEFAULT '',
    max_concurrent INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ftp_session_folders (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ftp_credentials (
    session_id TEXT PRIMARY KEY REFERENCES ftp_sessions(id) ON DELETE CASCADE,
    credential_type TEXT NOT NULL,
    encrypted_value TEXT,
    private_key_path TEXT
);

CREATE TABLE IF NOT EXISTS ftp_transfer_history (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ftp_sessions(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    local_path TEXT NOT NULL,
    remote_path TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    transferred_size INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ftp_scheduled_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ftp_sessions(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    direction TEXT NOT NULL,
    local_path TEXT NOT NULL,
    remote_path TEXT NOT NULL,
    schedule_type TEXT NOT NULL,
    cron_expression TEXT,
    next_run_at INTEGER,
    last_run_at INTEGER,
    last_run_status TEXT,
    conflict_strategy TEXT NOT NULL DEFAULT 'overwrite',
    include_subdirs INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ftp_filter_presets (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    rules_json TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ftp_restore_state (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES ftp_sessions(id) ON DELETE CASCADE,
    tab_order INTEGER NOT NULL DEFAULT 0,
    remote_path TEXT NOT NULL,
    local_path TEXT NOT NULL,
    panel_layout_json TEXT,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ftp_sessions_sort ON ftp_sessions(sort_order);
CREATE INDEX IF NOT EXISTS idx_ftp_transfer_history_session ON ftp_transfer_history(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ftp_restore_state_session ON ftp_restore_state(session_id);
