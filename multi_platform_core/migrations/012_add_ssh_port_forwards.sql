-- Migration 012: SSH Port Forwarding Rules
-- Stores persistent port forwarding configurations associated with SSH profiles.

CREATE TABLE IF NOT EXISTS ssh_port_forwards (
    id TEXT PRIMARY KEY,
    -- Parent SSH profile
    profile_id TEXT NOT NULL REFERENCES ssh_profiles(id) ON DELETE CASCADE,
    -- User-defined label (e.g. "MySQL DB", "Redis Cache")
    label TEXT,
    -- Forwarding type: 'local' | 'remote' | 'dynamic'
    forward_type TEXT NOT NULL DEFAULT 'local',
    -- Local listening address (default 127.0.0.1 for security)
    local_host TEXT NOT NULL DEFAULT '127.0.0.1',
    -- Local listening port
    local_port INTEGER NOT NULL,
    -- Remote destination host (required for local/remote types)
    remote_host TEXT,
    -- Remote destination port (required for local/remote types)
    remote_port INTEGER,
    -- Automatically start when SSH session connects
    auto_start INTEGER NOT NULL DEFAULT 0,
    -- Whether this rule is enabled
    enabled INTEGER NOT NULL DEFAULT 1,
    -- Display sort order
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ssh_port_forwards_profile
    ON ssh_port_forwards(profile_id);
