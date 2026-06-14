-- Migration 028: Complete persisted FTP scheduler configuration

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

ALTER TABLE ftp_scheduled_tasks ADD COLUMN once_at INTEGER;
ALTER TABLE ftp_scheduled_tasks ADD COLUMN interval_hours INTEGER;
ALTER TABLE ftp_scheduled_tasks ADD COLUMN time_of_day TEXT;
ALTER TABLE ftp_scheduled_tasks ADD COLUMN day_of_week INTEGER;
ALTER TABLE ftp_scheduled_tasks ADD COLUMN last_result TEXT;
ALTER TABLE ftp_scheduled_tasks ADD COLUMN last_task_id TEXT;
ALTER TABLE ftp_scheduled_tasks ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

UPDATE ftp_scheduled_tasks
SET updated_at = created_at
WHERE updated_at = 0;
