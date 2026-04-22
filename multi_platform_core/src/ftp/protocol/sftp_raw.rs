use anyhow::{anyhow, Result};
use russh_sftp::client::SftpSession;
use std::sync::Arc;

use super::super::*;

impl super::super::FtpManager {
    pub(in crate::ftp) async fn ensure_remote_dir_recursive(
        &self,
        sftp: Arc<SftpSession>,
        path: &str,
    ) -> Result<()> {
        let normalized = normalize_remote_path(path);
        if normalized == "/" {
            return Ok(());
        }

        let mut current = String::from("/");
        for segment in normalized.split('/').filter(|segment| !segment.is_empty()) {
            current = if current == "/" {
                format!("/{}", segment)
            } else {
                format!("{}/{}", current.trim_end_matches('/'), segment)
            };

            match sftp.symlink_metadata(current.clone()).await {
                Ok(metadata) => {
                    if !metadata.is_dir() {
                        return Err(anyhow!("remote path '{}' is not a directory", current));
                    }
                }
                Err(_) => {
                    sftp.create_dir(current.clone()).await.map_err(|e| {
                        anyhow!("failed to create remote directory '{}': {}", current, e)
                    })?;
                }
            }
        }

        Ok(())
    }
}
