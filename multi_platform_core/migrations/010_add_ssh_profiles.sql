-- Migration 010: Add SSH client tables
-- Creates ssh_profiles, ssh_credentials, and ssh_known_hosts tables.

-- SSH connection profile table
CREATE TABLE IF NOT EXISTS ssh_profiles (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    username TEXT NOT NULL,
    -- Authentication type: 'password' | 'privateKey' | 'agent'
    auth_type TEXT NOT NULL DEFAULT 'password',
    -- Whether to persist the encrypted password / passphrase
    save_password INTEGER NOT NULL DEFAULT 0,
    -- Optional jump host config stored as JSON
    jump_host_json TEXT,
    -- Whether to auto-reconnect on disconnect
    auto_reconnect INTEGER NOT NULL DEFAULT 0,
    -- Display sort order (for drag-and-drop reordering)
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- Optional color label (hex string)
    color TEXT,
    -- Optional grouping tags stored as JSON array string
    tags TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- SSH credential table (encrypted password / key passphrase).
-- Only created when save_password=1 on the parent profile.
CREATE TABLE IF NOT EXISTS ssh_credentials (
    profile_id TEXT PRIMARY KEY REFERENCES ssh_profiles(id) ON DELETE CASCADE,
    -- Credential type: 'password' | 'privateKeyPassphrase'
    credential_type TEXT NOT NULL,
    -- AES-256-GCM encrypted value (base64 encoded)
    encrypted_value TEXT,
    -- Path to the private key file (not stored, only path)
    private_key_path TEXT
);

-- Known SSH host fingerprints table
CREATE TABLE IF NOT EXISTS ssh_known_hosts (
    id TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 22,
    -- Key algorithm, e.g. 'ssh-ed25519', 'ecdsa-sha2-nistp256'
    algorithm TEXT NOT NULL,
    -- Host key fingerprint (SHA-256 base64)
    fingerprint TEXT NOT NULL,
    -- Trust mode: 'permanent' | 'session'
    trust_mode TEXT NOT NULL DEFAULT 'permanent',
    added_at INTEGER NOT NULL,
    UNIQUE(host, port, algorithm)
);

CREATE INDEX IF NOT EXISTS idx_ssh_profiles_sort ON ssh_profiles(sort_order);
CREATE INDEX IF NOT EXISTS idx_ssh_known_hosts_lookup ON ssh_known_hosts(host, port);
