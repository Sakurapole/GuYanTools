ALTER TABLE ssh_credentials
ADD COLUMN certificate_path TEXT;

ALTER TABLE ftp_credentials
ADD COLUMN certificate_path TEXT;
