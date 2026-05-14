-- Migration 019: Add SSH profile folders.

CREATE TABLE IF NOT EXISTS ssh_profile_folders (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    parent_id TEXT REFERENCES ssh_profile_folders(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

ALTER TABLE ssh_profiles
ADD COLUMN folder_id TEXT REFERENCES ssh_profile_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ssh_profile_folders_parent
    ON ssh_profile_folders(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ssh_profiles_folder
    ON ssh_profiles(folder_id, sort_order);
