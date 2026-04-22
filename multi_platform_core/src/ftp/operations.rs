use anyhow::{anyhow, Context, Result};
use async_std::io::ReadExt as AsyncStdReadExt;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, OpenFlags};
use sha2::{Digest, Sha256};
use std::io::Read as StdRead;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::*;

impl super::FtpManager {
    pub async fn list_remote_directory(
        &self,
        session_id: String,
        path: String,
    ) -> Result<Vec<FileTransferEntry>> {
        let session = self.get_session(&session_id)?;
        let requested_path = if path.trim().is_empty() {
            session
                .descriptor
                .lock()
                .map(|descriptor| descriptor.remote_root.clone())
                .unwrap_or_else(|_| "/".to_string())
        } else {
            normalize_remote_path(&path)
        };
        if session.resolved.protocol != "sftp" {
            return self
                .list_ftp_directory(&session.resolved, &requested_path)
                .await;
        }
        let sftp = session.require_sftp()?;
        let canonical = sftp
            .canonicalize(requested_path.clone())
            .await
            .unwrap_or(requested_path);

        let mut entries = sftp
            .read_dir(canonical.clone())
            .await
            .map_err(|e| anyhow!("failed to read remote directory: {}", e))?
            .filter_map(|entry| {
                let name = entry.file_name().to_string();
                if name == "." || name == ".." {
                    return None;
                }
                let metadata = entry.metadata();
                Some(FileTransferEntry {
                    name: name.clone(),
                    path: join_remote_path(&canonical, &name),
                    is_dir: metadata.is_dir(),
                    size: u64_to_i64(metadata.len()),
                    modified_at: metadata.modified().ok().map(system_time_to_millis),
                    permissions: metadata
                        .permissions
                        .map(|value| format!("{:o}", value & 0o777)),
                    owner: metadata
                        .user
                        .clone()
                        .or(metadata.uid.map(|value| value.to_string())),
                    source: "remote".to_string(),
                })
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            right
                .is_dir
                .cmp(&left.is_dir)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });
        Ok(entries)
    }

    pub async fn create_remote_dir(&self, session_id: String, path: String) -> Result<()> {
        let session = self.get_session(&session_id)?;
        let normalized_path = normalize_remote_path(&path);
        if session.resolved.protocol != "sftp" {
            let mut ftp = self.connect_ftp_control_session(&session.resolved).await?;
            let result = self
                .ensure_ftp_dir_recursive(&mut ftp, &normalized_path)
                .await;
            ftp.quit().await;
            return result;
        }
        session
            .require_sftp()?
            .create_dir(normalized_path)
            .await
            .map_err(|e| anyhow!("failed to create remote directory: {}", e))
    }

    pub async fn compute_remote_file_sha256(
        &self,
        session_id: String,
        path: String,
    ) -> Result<Option<String>> {
        let session = self.get_session(&session_id)?;
        let normalized_path = normalize_remote_path(&path);
        if session.resolved.protocol != "sftp" {
            let metadata = self
                .inspect_ftp_remote_path(&session.resolved, &normalized_path)
                .await?;
            if metadata.is_dir {
                return Ok(None);
            }
            let mut ftp = self.connect_ftp_control_session(&session.resolved).await?;
            let result = async {
                let mut remote_file = ftp.retr_stream(&normalized_path).await?;
                let digest = hash_async_std_reader_sha256(&mut remote_file).await;
                let finalize_result = ftp
                    .finalize_retr_stream(remote_file, &normalized_path)
                    .await;
                match (digest, finalize_result) {
                    (Ok(value), Ok(())) => Ok(Some(value)),
                    (Err(error), _) => Err(error),
                    (_, Err(error)) => Err(error),
                }
            }
            .await;
            ftp.quit().await;
            return result;
        }

        let sftp = session.require_sftp()?;
        let metadata = sftp
            .metadata(normalized_path.clone())
            .await
            .map_err(|e| anyhow!("failed to stat remote file: {}", e))?;
        if metadata.is_dir() {
            return Ok(None);
        }
        let mut remote_file = sftp
            .open(normalized_path)
            .await
            .map_err(|e| anyhow!("failed to open remote file: {}", e))?;
        hash_tokio_reader_sha256(&mut remote_file).await.map(Some)
    }

    pub async fn rename_remote_path(
        &self,
        session_id: String,
        old_path: String,
        new_path: String,
    ) -> Result<()> {
        let session = self.get_session(&session_id)?;
        let old_path = normalize_remote_path(&old_path);
        let new_path = normalize_remote_path(&new_path);
        if session.resolved.protocol != "sftp" {
            let mut ftp = self.connect_ftp_control_session(&session.resolved).await?;
            let result = ftp.rename(&old_path, &new_path).await;
            ftp.quit().await;
            return result;
        }
        session
            .require_sftp()?
            .rename(old_path, new_path)
            .await
            .map_err(|e| anyhow!("failed to rename remote path: {}", e))
    }

    pub async fn delete_remote_path(&self, session_id: String, path: String) -> Result<()> {
        let session = self.get_session(&session_id)?;
        let normalized_path = normalize_remote_path(&path);
        if session.resolved.protocol != "sftp" {
            let mut ftp = self.connect_ftp_control_session(&session.resolved).await?;
            let result = self
                .remove_ftp_entry_recursive(&mut ftp, normalized_path)
                .await;
            ftp.quit().await;
            return result;
        }
        self.remove_remote_entry_recursive(session.require_sftp()?, normalized_path)
            .await
    }

    pub async fn chmod_remote_path(
        &self,
        session_id: String,
        path: String,
        mode: String,
    ) -> Result<()> {
        let session = self.get_session(&session_id)?;
        if session.resolved.protocol != "sftp" {
            return Err(anyhow!(
                "remote chmod is only supported for SFTP sessions in the current phase"
            ));
        }
        let sftp = session.require_sftp()?;
        let normalized_path = normalize_remote_path(&path);
        let parsed_mode = u32::from_str_radix(mode.trim(), 8)
            .map_err(|_| anyhow!("invalid chmod mode '{}'", mode))?;
        let metadata = sftp
            .metadata(normalized_path.clone())
            .await
            .map_err(|e| anyhow!("failed to stat remote path: {}", e))?;
        let file_type_bits = metadata.permissions.unwrap_or(0) & 0o170000;
        let attrs = FileAttributes {
            permissions: Some(file_type_bits | (parsed_mode & 0o7777)),
            ..FileAttributes::empty()
        };
        sftp.set_metadata(normalized_path, attrs)
            .await
            .map_err(|e| anyhow!("failed to update remote permissions: {}", e))
    }

    pub async fn load_remote_image_preview(
        &self,
        session_id: String,
        path: String,
        max_bytes: Option<u32>,
    ) -> Result<Option<String>> {
        let session = self.get_session(&session_id)?;
        let normalized_path = normalize_remote_path(&path);
        let Some(mime) = image_mime_for_path(&normalized_path) else {
            return Ok(None);
        };
        let max_bytes = max_bytes.unwrap_or(DEFAULT_IMAGE_PREVIEW_MAX_BYTES as u32) as u64;
        let buffer = if session.resolved.protocol != "sftp" {
            let metadata = self
                .inspect_ftp_remote_path(&session.resolved, &normalized_path)
                .await?;
            if metadata.is_dir || metadata.size > max_bytes {
                return Ok(None);
            }
            self.load_ftp_file_bytes(&session.resolved, &normalized_path)
                .await?
        } else {
            let sftp = session.require_sftp()?;
            let metadata = sftp
                .metadata(normalized_path.clone())
                .await
                .map_err(|e| anyhow!("failed to stat remote image: {}", e))?;
            if metadata.is_dir() || metadata.len() > max_bytes {
                return Ok(None);
            }
            let mut remote_file = sftp
                .open(normalized_path)
                .await
                .map_err(|e| anyhow!("failed to open remote image: {}", e))?;
            let mut buffer = Vec::with_capacity(metadata.len().min(max_bytes) as usize);
            remote_file.read_to_end(&mut buffer).await?;
            buffer
        };
        Ok(Some(format!(
            "data:{};base64,{}",
            mime,
            encode_base64(&buffer)
        )))
    }

    pub async fn load_remote_text_file(
        &self,
        session_id: String,
        path: String,
        max_bytes: Option<u32>,
    ) -> Result<String> {
        let session = self.get_session(&session_id)?;
        let normalized_path = normalize_remote_path(&path);
        let max_bytes = max_bytes.unwrap_or(DEFAULT_REMOTE_TEXT_MAX_BYTES as u32) as u64;
        let buffer = if session.resolved.protocol != "sftp" {
            let metadata = self
                .inspect_ftp_remote_path(&session.resolved, &normalized_path)
                .await?;
            if metadata.is_dir {
                return Err(anyhow!("remote path '{}' is a directory", normalized_path));
            }
            if metadata.size > max_bytes {
                return Err(anyhow!(
                    "remote file exceeds editable size limit ({} bytes)",
                    max_bytes
                ));
            }
            self.load_ftp_file_bytes(&session.resolved, &normalized_path)
                .await?
        } else {
            let sftp = session.require_sftp()?;
            let metadata = sftp
                .metadata(normalized_path.clone())
                .await
                .map_err(|e| anyhow!("failed to stat remote file: {}", e))?;
            if metadata.is_dir() {
                return Err(anyhow!("remote path '{}' is a directory", normalized_path));
            }
            if metadata.len() > max_bytes {
                return Err(anyhow!(
                    "remote file exceeds editable size limit ({} bytes)",
                    max_bytes
                ));
            }
            let mut remote_file = sftp
                .open(normalized_path)
                .await
                .map_err(|e| anyhow!("failed to open remote file: {}", e))?;
            let mut buffer = Vec::with_capacity(metadata.len() as usize);
            remote_file.read_to_end(&mut buffer).await?;
            buffer
        };
        Ok(String::from_utf8_lossy(&buffer).to_string())
    }

    pub async fn save_remote_text_file(
        &self,
        session_id: String,
        path: String,
        content: String,
    ) -> Result<()> {
        let session = self.get_session(&session_id)?;
        let normalized_path = normalize_remote_path(&path);
        if session.resolved.protocol != "sftp" {
            let mut ftp = self.connect_ftp_control_session(&session.resolved).await?;
            if let Some(parent) = remote_parent_path(&normalized_path) {
                self.ensure_ftp_dir_recursive(&mut ftp, &parent).await?;
            }
            let result = ftp
                .put_bytes(&normalized_path, content.as_bytes())
                .await
                .map(|_| ());
            ftp.quit().await;
            return result;
        }
        let sftp = session.require_sftp()?;
        if let Some(parent) = remote_parent_path(&normalized_path) {
            self.ensure_remote_dir_recursive(sftp.clone(), &parent)
                .await?;
        }
        let mut remote_file = sftp
            .open_with_flags(
                normalized_path,
                OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
            )
            .await
            .map_err(|e| anyhow!("failed to open remote file for write: {}", e))?;
        remote_file.write_all(content.as_bytes()).await?;
        remote_file.flush().await?;
        Ok(())
    }

    pub async fn export_remote_path_to_local(
        &self,
        session_id: String,
        remote_path: String,
        local_path: String,
    ) -> Result<()> {
        let session = self.get_session(&session_id)?;
        let normalized_remote_path = normalize_remote_path(&remote_path);
        let normalized_local_path = normalize_local_path(local_path);
        if session.resolved.protocol != "sftp" {
            let mut ftp = self.connect_ftp_control_session(&session.resolved).await?;
            let result = self
                .export_ftp_remote_path_to_local(
                    &mut ftp,
                    normalized_remote_path,
                    normalized_local_path,
                )
                .await;
            ftp.quit().await;
            return result;
        }

        self.export_sftp_remote_path_to_local(
            session.require_sftp()?,
            normalized_remote_path,
            normalized_local_path,
        )
        .await
    }

    async fn remove_remote_entry_recursive(
        &self,
        sftp: Arc<SftpSession>,
        path: String,
    ) -> Result<()> {
        let metadata = sftp
            .symlink_metadata(path.clone())
            .await
            .map_err(|e| anyhow!("failed to inspect remote path: {}", e))?;
        if metadata.is_dir() {
            let children = sftp
                .read_dir(path.clone())
                .await
                .map_err(|e| anyhow!("failed to read remote directory: {}", e))?
                .filter_map(|entry| {
                    let name = entry.file_name().to_string();
                    if name == "." || name == ".." {
                        return None;
                    }
                    Some(join_remote_path(&path, &name))
                })
                .collect::<Vec<_>>();
            for child in children {
                Box::pin(self.remove_remote_entry_recursive(sftp.clone(), child)).await?;
            }
            sftp.remove_dir(path)
                .await
                .map_err(|e| anyhow!("failed to remove remote directory: {}", e))?;
        } else {
            sftp.remove_file(path)
                .await
                .map_err(|e| anyhow!("failed to remove remote file: {}", e))?;
        }
        Ok(())
    }

    async fn export_sftp_remote_path_to_local(
        &self,
        sftp: Arc<SftpSession>,
        remote_path: String,
        local_path: PathBuf,
    ) -> Result<()> {
        let metadata = sftp
            .metadata(remote_path.clone())
            .await
            .map_err(|e| anyhow!("failed to inspect remote path '{}': {}", remote_path, e))?;
        if metadata.is_dir() {
            fs::create_dir_all(&local_path).await.with_context(|| {
                format!("failed to create local directory {}", local_path.display())
            })?;
            let entries = sftp
                .read_dir(remote_path.clone())
                .await
                .map_err(|e| anyhow!("failed to read remote directory '{}': {}", remote_path, e))?
                .collect::<Vec<_>>();
            for entry in entries {
                let name = entry.file_name().to_string();
                if name == "." || name == ".." {
                    continue;
                }
                let child_remote_path = join_remote_path(&remote_path, &name);
                let child_local_path = local_path.join(&name);
                Box::pin(self.export_sftp_remote_path_to_local(
                    sftp.clone(),
                    child_remote_path,
                    child_local_path,
                ))
                .await?;
            }
            return Ok(());
        }

        if let Some(parent) = local_path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).await.with_context(|| {
                    format!("failed to create local directory {}", parent.display())
                })?;
            }
        }
        let mut remote_file = sftp
            .open(remote_path.clone())
            .await
            .map_err(|e| anyhow!("failed to open remote file '{}': {}", remote_path, e))?;
        let mut local_file = fs::File::create(&local_path)
            .await
            .with_context(|| format!("failed to create local file {}", local_path.display()))?;
        let mut buffer = vec![0_u8; 64 * 1024];
        loop {
            let read = remote_file.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            local_file.write_all(&buffer[..read]).await?;
        }
        local_file.flush().await?;
        Ok(())
    }

    async fn export_ftp_remote_path_to_local(
        &self,
        ftp: &mut FtpControlSession,
        remote_path: String,
        local_path: PathBuf,
    ) -> Result<()> {
        let metadata = self
            .inspect_ftp_remote_path_with_client(ftp, &remote_path)
            .await?;
        if metadata.is_dir {
            fs::create_dir_all(&local_path).await.with_context(|| {
                format!("failed to create local directory {}", local_path.display())
            })?;
            let entries = self
                .list_ftp_directory_with_client(ftp, &remote_path)
                .await?;
            for entry in entries {
                let child_local_path = local_path.join(&entry.name);
                Box::pin(self.export_ftp_remote_path_to_local(ftp, entry.path, child_local_path))
                    .await?;
            }
            return Ok(());
        }

        if let Some(parent) = local_path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).await.with_context(|| {
                    format!("failed to create local directory {}", parent.display())
                })?;
            }
        }
        let mut remote_file = ftp.retr_stream(&remote_path).await?;
        let mut local_file = fs::File::create(&local_path)
            .await
            .with_context(|| format!("failed to create local file {}", local_path.display()))?;
        let mut buffer = vec![0_u8; 64 * 1024];
        loop {
            let read = remote_file.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            local_file.write_all(&buffer[..read]).await?;
        }
        local_file.flush().await?;
        ftp.finalize_retr_stream(remote_file, &remote_path).await?;
        Ok(())
    }

    pub(super) async fn list_ftp_directory(
        &self,
        resolved: &ResolvedProfileData,
        path: &str,
    ) -> Result<Vec<FileTransferEntry>> {
        let mut ftp = self.connect_ftp_control_session(resolved).await?;
        let result = self.list_ftp_directory_with_client(&mut ftp, path).await;
        ftp.quit().await;
        result
    }

    pub(super) async fn list_ftp_directory_with_client(
        &self,
        ftp: &mut FtpControlSession,
        path: &str,
    ) -> Result<Vec<FileTransferEntry>> {
        let canonical = self.change_ftp_directory(ftp, path).await?;
        let lines = match ftp.mlsd(None).await {
            Ok(lines) => lines,
            Err(_) => ftp.list(None).await?,
        };
        let mut entries = lines
            .into_iter()
            .filter_map(|line| parse_ftp_listing_line(&line).ok())
            .filter_map(|file| ftp_file_to_transfer_entry(&canonical, &file))
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            right
                .is_dir
                .cmp(&left.is_dir)
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        });
        Ok(entries)
    }

    pub(super) async fn change_ftp_directory(
        &self,
        ftp: &mut FtpControlSession,
        path: &str,
    ) -> Result<String> {
        let target = normalize_remote_path(path);
        ftp.cwd(&target).await?;
        ftp.pwd().await.map(|path| normalize_remote_path(&path))
    }

    pub(super) async fn inspect_ftp_remote_path(
        &self,
        resolved: &ResolvedProfileData,
        path: &str,
    ) -> Result<FtpRemoteMetadata> {
        let mut ftp = self.connect_ftp_control_session(resolved).await?;
        let result = self
            .inspect_ftp_remote_path_with_client(&mut ftp, path)
            .await;
        ftp.quit().await;
        result
    }

    pub(super) async fn inspect_ftp_remote_path_with_client(
        &self,
        ftp: &mut FtpControlSession,
        path: &str,
    ) -> Result<FtpRemoteMetadata> {
        let normalized = normalize_remote_path(path);
        if normalized == "/" {
            return Ok(FtpRemoteMetadata {
                is_dir: true,
                size: 0,
            });
        }

        if let Ok(line) = ftp.mlst(Some(&normalized)).await {
            if let Ok(file) = parse_ftp_listing_line(&line) {
                return Ok(FtpRemoteMetadata {
                    is_dir: file.is_directory(),
                    size: file.size() as u64,
                });
            }
        }

        if ftp.cwd(&normalized).await.is_ok() {
            return Ok(FtpRemoteMetadata {
                is_dir: true,
                size: 0,
            });
        }

        let size = ftp.size(&normalized).await.unwrap_or(0);
        Ok(FtpRemoteMetadata {
            is_dir: false,
            size,
        })
    }

    pub(super) async fn remove_ftp_entry_recursive(
        &self,
        ftp: &mut FtpControlSession,
        path: String,
    ) -> Result<()> {
        let metadata = self.inspect_ftp_remote_path_with_client(ftp, &path).await?;
        if metadata.is_dir {
            let children = self.list_ftp_directory_with_client(ftp, &path).await?;
            for child in children {
                Box::pin(self.remove_ftp_entry_recursive(ftp, child.path)).await?;
            }
            if let Some(parent) = remote_parent_path(&path) {
                let _ = ftp.cwd(&parent).await;
            }
            ftp.rmdir(&path).await?;
        } else {
            ftp.rm(&path).await?;
        }
        Ok(())
    }

    pub(super) async fn load_ftp_file_bytes(
        &self,
        resolved: &ResolvedProfileData,
        path: &str,
    ) -> Result<Vec<u8>> {
        let mut ftp = self.connect_ftp_control_session(resolved).await?;
        let result = ftp.retr_bytes(path).await;
        ftp.quit().await;
        result
    }

    pub fn compute_local_file_sha256(&self, path: String) -> Result<Option<String>> {
        let normalized_path = normalize_local_path(path);
        let metadata = std::fs::metadata(&normalized_path)
            .with_context(|| format!("failed to stat local file {}", normalized_path.display()))?;
        if metadata.is_dir() {
            return Ok(None);
        }
        let mut file = std::fs::File::open(&normalized_path)
            .with_context(|| format!("failed to open local file {}", normalized_path.display()))?;
        hash_std_reader_sha256(&mut file).map(Some)
    }
}

fn digest_hex(digest: impl AsRef<[u8]>) -> String {
    digest
        .as_ref()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect()
}

fn hash_std_reader_sha256(reader: &mut impl StdRead) -> Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| anyhow!("failed to read local file bytes: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(digest_hex(hasher.finalize()))
}

async fn hash_async_std_reader_sha256(
    reader: &mut (impl async_std::io::Read + Unpin),
) -> Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .await
            .map_err(|e| anyhow!("failed to read remote file bytes: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(digest_hex(hasher.finalize()))
}

async fn hash_tokio_reader_sha256(reader: &mut (impl tokio::io::AsyncRead + Unpin)) -> Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .await
            .map_err(|e| anyhow!("failed to read remote file bytes: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(digest_hex(hasher.finalize()))
}
