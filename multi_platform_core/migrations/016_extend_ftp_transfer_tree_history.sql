-- Migration 016: Persist FTP directory transfer tree metadata

ALTER TABLE ftp_transfer_history ADD COLUMN transfer_method TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE ftp_transfer_history ADD COLUMN transfer_tree_json TEXT;
ALTER TABLE ftp_transfer_history ADD COLUMN current_relative_path TEXT;
