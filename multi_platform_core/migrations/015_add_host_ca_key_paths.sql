ALTER TABLE ssh_profiles
ADD COLUMN host_ca_key_path TEXT;

ALTER TABLE ftp_sessions
ADD COLUMN host_ca_key_path TEXT;
