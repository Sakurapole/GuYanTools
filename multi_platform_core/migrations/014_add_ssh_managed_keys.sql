CREATE TABLE IF NOT EXISTS ssh_managed_keys (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    source TEXT NOT NULL,
    comment TEXT,
    fingerprint TEXT NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssh_managed_keys_fingerprint
ON ssh_managed_keys(fingerprint);
