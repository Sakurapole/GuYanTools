use anyhow::{anyhow, Context, Result};
use async_std::io::{ReadExt as AsyncStdReadExt, WriteExt as AsyncStdWriteExt};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::OpenFlags;
use suppaftp::Status;
use std::collections::HashMap;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use uuid::Uuid;

use super::*;

#[derive(Debug, Clone)]
pub(super) struct LocalTransferPlan {
    directories: Vec<PathBuf>,
    files: Vec<LocalTransferFile>,
    total_size: u64,
}

#[derive(Debug, Clone)]
pub(super) struct LocalTransferFile {
    source_path: PathBuf,
    relative_path: PathBuf,
    size: u64,
}

#[derive(Debug, Clone)]
pub(super) struct RemoteTransferPlan {
    directories: Vec<PathBuf>,
    files: Vec<RemoteTransferFile>,
    total_size: u64,
}

#[derive(Debug, Clone)]
pub(super) struct RemoteTransferFile {
    source_path: String,
    relative_path: PathBuf,
    size: u64,
}

#[derive(Clone)]
pub(super) enum TransferJobKind {
    UploadFile {
        sftp: Arc<SftpSession>,
        local_path: PathBuf,
        remote_path: String,
        total_size: u64,
    },
    UploadFileFtp {
        resolved: ResolvedProfileData,
        local_path: PathBuf,
        remote_path: String,
        total_size: u64,
    },
    UploadDirectory {
        sftp: Arc<SftpSession>,
        remote_root: String,
        plan: LocalTransferPlan,
    },
    UploadDirectoryFtp {
        resolved: ResolvedProfileData,
        remote_root: String,
        plan: LocalTransferPlan,
    },
    DownloadFile {
        sftp: Arc<SftpSession>,
        remote_path: String,
        local_path: PathBuf,
        total_size: u64,
    },
    DownloadFileFtp {
        resolved: ResolvedProfileData,
        remote_path: String,
        local_path: PathBuf,
        total_size: u64,
    },
    DownloadDirectory {
        sftp: Arc<SftpSession>,
        local_root: PathBuf,
        plan: RemoteTransferPlan,
    },
    DownloadDirectoryFtp {
        resolved: ResolvedProfileData,
        local_root: PathBuf,
        plan: RemoteTransferPlan,
    },
    FxpFile {
        source_resolved: ResolvedProfileData,
        target_resolved: ResolvedProfileData,
        source_path: String,
        target_path: String,
        total_size: u64,
    },
    FxpDirectory {
        source_resolved: ResolvedProfileData,
        target_resolved: ResolvedProfileData,
        target_root: String,
        plan: RemoteTransferPlan,
    },
    // Relay variants: data is piped through the client (source → client → target).
    // Used for SFTP→SFTP, SFTP→FTP, FTP→SFTP, and FTP→FTP-over-tunnel combinations
    // where a true server-side FXP data channel is not possible.
    RelayFile {
        source_resolved: ResolvedProfileData,
        source_sftp: Option<Arc<SftpSession>>,
        target_resolved: ResolvedProfileData,
        target_sftp: Option<Arc<SftpSession>>,
        source_path: String,
        target_path: String,
        total_size: u64,
    },
    RelayDirectory {
        source_resolved: ResolvedProfileData,
        source_sftp: Option<Arc<SftpSession>>,
        target_resolved: ResolvedProfileData,
        target_sftp: Option<Arc<SftpSession>>,
        target_root: String,
        plan: RemoteTransferPlan,
    },
}

#[derive(Clone)]
pub(super) struct QueuedTransferJob {
    task_id: String,
    session_id: String,
    max_concurrent: u32,
    operation: TransferJobKind,
}

pub(super) struct TransferControl {
    pause_requested: std::sync::atomic::AtomicBool,
}

impl TransferControl {
    fn new() -> Self {
        Self {
            pause_requested: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

pub(super) enum TransferRunResult {
    Completed(u64),
    Paused(u64),
}

pub(super) type PendingTaskMap = HashMap<String, QueuedTransferJob>;
pub(super) type TransferControlMap = HashMap<String, Arc<TransferControl>>;

impl super::FtpManager {
    pub fn list_transfer_tasks(&self) -> Result<Vec<TransferTask>> {
        let tasks = self
            .inner
            .tasks
            .read()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?;
        let mut merged = self
            .load_transfer_history()?
            .into_iter()
            .map(|task| (task.id.clone(), task))
            .collect::<HashMap<_, _>>();
        for task in tasks.values() {
            merged.insert(task.id.clone(), task.clone());
        }
        let mut items = merged.into_values().collect::<Vec<_>>();
        items.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        Ok(items)
    }

    pub fn get_retry_policy(&self) -> Result<FtpRetryPolicy> {
        self.inner
            .retry_policy
            .read()
            .map_err(|_| anyhow!("ftp retry policy lock poisoned"))
            .map(|policy| policy.clone())
    }

    pub fn update_retry_policy(&self, input: FtpRetryPolicy) -> Result<FtpRetryPolicy> {
        let mut policy = self
            .inner
            .retry_policy
            .write()
            .map_err(|_| anyhow!("ftp retry policy lock poisoned"))?;
        policy.max_retries = input.max_retries.clamp(0, 10);
        policy.base_delay_secs = input.base_delay_secs.clamp(1, 300);
        Ok(policy.clone())
    }

    pub fn delete_transfer_task(&self, task_id: String) -> Result<()> {
        {
            let tasks = self
                .inner
                .tasks
                .read()
                .map_err(|_| anyhow!("ftp tasks lock poisoned"))?;
            if let Some(task) = tasks.get(&task_id) {
                if matches!(task.status.as_str(), "pending" | "transferring" | "paused") {
                    return Err(anyhow!("Only completed or failed tasks can be deleted"));
                }
            }
        }

        if let Ok(mut tasks) = self.inner.tasks.write() {
            tasks.remove(&task_id);
        }
        self.unregister_transfer_job(&task_id);

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ftp_transfer_history WHERE id = ?1",
                    rusqlite::params![task_id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }
    pub async fn upload_file(
        &self,
        session_id: String,
        local_path: String,
        remote_path: String,
    ) -> Result<TransferTask> {
        let session = self.get_session(&session_id)?;
        let descriptor = session
            .descriptor
            .lock()
            .map_err(|_| anyhow!("ftp session descriptor poisoned"))?
            .clone();
        let local_path = normalize_local_path(local_path);
        let metadata = std::fs::metadata(&local_path)
            .with_context(|| format!("failed to stat local file {}", local_path.display()))?;
        let remote_path = normalize_remote_path(&remote_path);
        let max_concurrent = self
            .get_profile(&descriptor.profile_id)?
            .max_concurrent
            .max(1);

        let task_id = if session.resolved.protocol == "sftp" {
            let sftp = session.require_sftp()?;
            if metadata.is_dir() {
                let plan = self.build_local_transfer_plan(&local_path)?;
                self.ensure_remote_dir_recursive(sftp.clone(), &remote_path)
                    .await?;
                let task = self.register_task(
                    &descriptor,
                    "upload",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    plan.total_size,
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::UploadDirectory {
                        sftp,
                        remote_root: remote_path,
                        plan,
                    },
                )?;
                task.id
            } else {
                let task = self.register_task(
                    &descriptor,
                    "upload",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    metadata.len(),
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::UploadFile {
                        sftp,
                        local_path,
                        remote_path,
                        total_size: metadata.len(),
                    },
                )?;
                task.id
            }
        } else {
            let resolved = session.resolved.clone();
            if metadata.is_dir() {
                let plan = self.build_local_transfer_plan(&local_path)?;
                self.ensure_ftp_dir_recursive_for_resolved(&resolved, &remote_path)
                    .await?;
                let task = self.register_task(
                    &descriptor,
                    "upload",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    plan.total_size,
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::UploadDirectoryFtp {
                        resolved,
                        remote_root: remote_path,
                        plan,
                    },
                )?;
                task.id
            } else {
                let task = self.register_task(
                    &descriptor,
                    "upload",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    metadata.len(),
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::UploadFileFtp {
                        resolved,
                        local_path,
                        remote_path,
                        total_size: metadata.len(),
                    },
                )?;
                task.id
            }
        };

        self.schedule_pending_tasks()?;
        self.get_task(&task_id)
    }

    pub async fn download_file(
        &self,
        session_id: String,
        remote_path: String,
        local_path: String,
    ) -> Result<TransferTask> {
        let session = self.get_session(&session_id)?;
        let descriptor = session
            .descriptor
            .lock()
            .map_err(|_| anyhow!("ftp session descriptor poisoned"))?
            .clone();
        let remote_path = normalize_remote_path(&remote_path);
        let local_path = normalize_local_path(local_path);
        let max_concurrent = self
            .get_profile(&descriptor.profile_id)?
            .max_concurrent
            .max(1);
        let task_id = if session.resolved.protocol == "sftp" {
            let sftp = session.require_sftp()?;
            let remote_metadata = sftp
                .metadata(remote_path.clone())
                .await
                .map_err(|e| anyhow!("failed to stat remote file: {}", e))?;
            if remote_metadata.is_dir() {
                let plan = self
                    .build_remote_transfer_plan(sftp.clone(), remote_path.clone())
                    .await?;
                fs::create_dir_all(&local_path).await.with_context(|| {
                    format!("failed to create local directory {}", local_path.display())
                })?;
                let task = self.register_task(
                    &descriptor,
                    "download",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    plan.total_size,
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::DownloadDirectory {
                        sftp,
                        local_root: local_path,
                        plan,
                    },
                )?;
                task.id
            } else {
                let task = self.register_task(
                    &descriptor,
                    "download",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    remote_metadata.len(),
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::DownloadFile {
                        sftp,
                        remote_path,
                        local_path,
                        total_size: remote_metadata.len(),
                    },
                )?;
                task.id
            }
        } else {
            let resolved = session.resolved.clone();
            let remote_metadata = self
                .inspect_ftp_remote_path(&resolved, &remote_path)
                .await?;
            if remote_metadata.is_dir {
                let plan = self
                    .build_remote_transfer_plan_ftp(&resolved, remote_path.clone())
                    .await?;
                fs::create_dir_all(&local_path).await.with_context(|| {
                    format!("failed to create local directory {}", local_path.display())
                })?;
                let task = self.register_task(
                    &descriptor,
                    "download",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    plan.total_size,
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::DownloadDirectoryFtp {
                        resolved,
                        local_root: local_path,
                        plan,
                    },
                )?;
                task.id
            } else {
                let task = self.register_task(
                    &descriptor,
                    "download",
                    local_path.to_string_lossy().as_ref(),
                    &remote_path,
                    remote_metadata.size,
                )?;
                self.queue_transfer_job(
                    &task,
                    max_concurrent,
                    TransferJobKind::DownloadFileFtp {
                        resolved,
                        remote_path,
                        local_path,
                        total_size: remote_metadata.size,
                    },
                )?;
                task.id
            }
        };

        self.schedule_pending_tasks()?;
        self.get_task(&task_id)
    }

    pub async fn fxp_transfer(
        &self,
        source_session_id: String,
        source_path: String,
        target_session_id: String,
        target_path: String,
    ) -> Result<TransferTask> {
        if source_session_id == target_session_id {
            return Err(anyhow!("Remote copy requires two different sessions"));
        }

        let source_session = self.get_session(&source_session_id)?;
        let target_session = self.get_session(&target_session_id)?;
        let source_descriptor = source_session
            .descriptor
            .lock()
            .map_err(|_| anyhow!("ftp session descriptor poisoned"))?
            .clone();
        let source_resolved = source_session.resolved.clone();
        let target_resolved = target_session.resolved.clone();

        // Use true server-side FXP only when both ends are plain direct FTP.
        // All other protocol combinations (SFTP↔SFTP, SFTP↔FTP, FTP-over-tunnel)
        // fall back to relay mode where data is streamed through this client.
        let use_fxp = source_resolved.protocol == "ftp"
            && target_resolved.protocol == "ftp"
            && source_resolved.ssh_tunnel.is_none()
            && target_resolved.ssh_tunnel.is_none();

        let source_path = normalize_remote_path(&source_path);
        let target_path = normalize_remote_path(&target_path);

        if use_fxp {
            // True FXP: server-to-server, no client relay.
            let source_metadata = self
                .inspect_ftp_remote_path(&source_resolved, &source_path)
                .await?;
            let task_id = if source_metadata.is_dir {
                let plan = self
                    .build_remote_transfer_plan_ftp(&source_resolved, source_path.clone())
                    .await?;
                self.ensure_ftp_dir_recursive_for_resolved(&target_resolved, &target_path)
                    .await?;
                let task = self.register_task(
                    &source_descriptor,
                    "fxp",
                    &source_path,
                    &target_path,
                    plan.total_size,
                )?;
                self.queue_transfer_job(
                    &task,
                    1,
                    TransferJobKind::FxpDirectory {
                        source_resolved,
                        target_resolved,
                        target_root: target_path,
                        plan,
                    },
                )?;
                task.id
            } else {
                let task = self.register_task(
                    &source_descriptor,
                    "fxp",
                    &source_path,
                    &target_path,
                    source_metadata.size,
                )?;
                self.queue_transfer_job(
                    &task,
                    1,
                    TransferJobKind::FxpFile {
                        source_resolved,
                        target_resolved,
                        source_path,
                        target_path,
                        total_size: source_metadata.size,
                    },
                )?;
                task.id
            };
            self.schedule_pending_tasks()?;
            return self.get_task(&task_id);
        }

        // Relay mode: determine metadata using the correct protocol for each end.
        let (source_is_dir, source_total_size) = if source_resolved.protocol == "sftp" {
            let sftp = source_session.require_sftp()?;
            let meta = sftp
                .metadata(source_path.clone())
                .await
                .map_err(|e| anyhow!("failed to stat source path: {}", e))?;
            (meta.is_dir(), meta.len())
        } else {
            let meta = self
                .inspect_ftp_remote_path(&source_resolved, &source_path)
                .await?;
            (meta.is_dir, meta.size)
        };

        // Acquire optional SFTP handles for source and target (None for FTP ends).
        let source_sftp = if source_resolved.protocol == "sftp" {
            Some(source_session.require_sftp()?)
        } else {
            None
        };
        let target_sftp = if target_resolved.protocol == "sftp" {
            Some(target_session.require_sftp()?)
        } else {
            None
        };

        let task_id = if source_is_dir {
            let plan = if source_resolved.protocol == "sftp" {
                self.build_remote_transfer_plan(
                    source_sftp.clone().unwrap(),
                    source_path.clone(),
                )
                .await?
            } else {
                self.build_remote_transfer_plan_ftp(&source_resolved, source_path.clone())
                    .await?
            };
            // Pre-create target root directory.
            if target_resolved.protocol == "sftp" {
                self.ensure_remote_dir_recursive(
                    target_sftp.clone().unwrap(),
                    &target_path,
                )
                .await?;
            } else {
                self.ensure_ftp_dir_recursive_for_resolved(&target_resolved, &target_path)
                    .await?;
            }
            let task = self.register_task(
                &source_descriptor,
                "remote_copy",
                &source_path,
                &target_path,
                plan.total_size,
            )?;
            self.queue_transfer_job(
                &task,
                1,
                TransferJobKind::RelayDirectory {
                    source_resolved,
                    source_sftp,
                    target_resolved,
                    target_sftp,
                    target_root: target_path,
                    plan,
                },
            )?;
            task.id
        } else {
            let task = self.register_task(
                &source_descriptor,
                "remote_copy",
                &source_path,
                &target_path,
                source_total_size,
            )?;
            self.queue_transfer_job(
                &task,
                1,
                TransferJobKind::RelayFile {
                    source_resolved,
                    source_sftp,
                    target_resolved,
                    target_sftp,
                    source_path,
                    target_path,
                    total_size: source_total_size,
                },
            )?;
            task.id
        };

        self.schedule_pending_tasks()?;
        self.get_task(&task_id)
    }

    pub fn update_task_priority(&self, task_id: String, priority: String) -> Result<TransferTask> {
        let priority = normalize_transfer_priority(&priority);
        self.with_task_mut(&task_id, |task| {
            task.priority = priority.clone();
        })?;
        self.emit_task(
            &task_id,
            "taskState",
            Some(&format!("Priority updated to {}", priority)),
        );
        let _ = self.schedule_pending_tasks();
        self.get_task(&task_id)
    }

    pub fn pause_task(&self, task_id: String) -> Result<TransferTask> {
        let task = self.get_task(&task_id)?;
        match task.status.as_str() {
            "pending" | "retrying" => {
                self.with_task_mut(&task_id, |item| {
                    item.status = "paused".to_string();
                })?;
                self.emit_task(&task_id, "taskState", Some("Transfer paused"));
                self.get_task(&task_id)
            }
            "transferring" => {
                if task.direction == "fxp" {
                    self.emit_task(
                        &task_id,
                        "taskState",
                        Some("FXP transfers can only pause before the next file starts"),
                    );
                    return Ok(task);
                }
                self.get_task_control(&task_id)?
                    .pause_requested
                    .store(true, Ordering::SeqCst);
                self.emit_task(&task_id, "taskState", Some("Pause requested"));
                self.get_task(&task_id)
            }
            _ => Ok(task),
        }
    }

    pub fn resume_task(&self, task_id: String) -> Result<TransferTask> {
        let task = self.get_task(&task_id)?;
        if task.status != "paused" {
            return Ok(task);
        }

        if self
            .inner
            .pending_jobs
            .lock()
            .map_err(|_| anyhow!("ftp pending jobs lock poisoned"))?
            .contains_key(&task_id)
        {
            self.with_task_mut(&task_id, |item| {
                item.status = "pending".to_string();
                item.error_message = None;
                item.completed_at = None;
            })?;
            if let Ok(control) = self.get_task_control(&task_id) {
                control.pause_requested.store(false, Ordering::SeqCst);
            }
            self.emit_task(&task_id, "taskState", Some("Transfer resumed"));
            self.schedule_pending_tasks()?;
        }

        self.get_task(&task_id)
    }

    pub fn pause_all_tasks(&self) -> Result<Vec<TransferTask>> {
        let task_ids = self
            .inner
            .tasks
            .read()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?
            .values()
            .filter(|task| {
                matches!(
                    task.status.as_str(),
                    "pending" | "transferring" | "retrying"
                )
            })
            .map(|task| task.id.clone())
            .collect::<Vec<_>>();
        let mut updated = Vec::new();
        for task_id in task_ids {
            updated.push(self.pause_task(task_id)?);
        }
        Ok(updated)
    }

    pub fn resume_all_tasks(&self) -> Result<Vec<TransferTask>> {
        let task_ids = self
            .inner
            .tasks
            .read()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?
            .values()
            .filter(|task| task.status == "paused")
            .map(|task| task.id.clone())
            .collect::<Vec<_>>();
        let mut updated = Vec::new();
        for task_id in task_ids {
            updated.push(self.resume_task(task_id)?);
        }
        Ok(updated)
    }

    pub async fn retry_task(&self, task_id: String) -> Result<TransferTask> {
        let task = self.get_task(&task_id)?;
        if task.status != "failed" {
            return Ok(task);
        }

        let (job, aligned_offset, total_size) = self.build_retry_job(&task).await?;
        self.inner
            .pending_jobs
            .lock()
            .map_err(|_| anyhow!("ftp pending jobs lock poisoned"))?
            .insert(task_id.clone(), job.clone());
        self.inner
            .task_controls
            .lock()
            .map_err(|_| anyhow!("ftp task controls lock poisoned"))?
            .insert(task_id.clone(), Arc::new(TransferControl::new()));

        self.with_task_mut(&task_id, |item| {
            item.session_id = job.session_id.clone();
            item.retry_count = 0;
            item.file_size = u64_to_i64(total_size);
            item.transferred_size = u64_to_i64(aligned_offset);
            item.progress = if total_size == 0 {
                0.0
            } else {
                ((aligned_offset as f64 / total_size as f64) * 100.0).clamp(0.0, 100.0)
            };
            item.status = "pending".to_string();
            item.error_message = None;
            item.speed_bytes_per_sec = 0.0;
            item.started_at = None;
            item.completed_at = None;
        })?;

        self.emit_task(&task_id, "taskState", Some("Transfer queued for resume"));
        self.schedule_pending_tasks()?;
        self.get_task(&task_id)
    }

    fn register_task(
        &self,
        descriptor: &FtpConnectionDescriptor,
        direction: &str,
        local_path: &str,
        remote_path: &str,
        file_size: u64,
    ) -> Result<TransferTask> {
        let task = TransferTask {
            id: Uuid::new_v4().to_string(),
            session_id: descriptor.session_id.clone(),
            profile_id: descriptor.profile_id.clone(),
            retry_count: 0,
            priority: "medium".to_string(),
            direction: direction.to_string(),
            local_path: local_path.to_string(),
            remote_path: remote_path.to_string(),
            file_name: file_name_from_path(match direction {
                "download" => remote_path,
                _ => local_path,
            }),
            file_size: u64_to_i64(file_size),
            transferred_size: 0,
            progress: 0.0,
            speed_bytes_per_sec: 0.0,
            status: "pending".to_string(),
            error_message: None,
            created_at: unix_now(),
            started_at: None,
            completed_at: None,
        };
        self.inner
            .tasks
            .write()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?
            .insert(task.id.clone(), task.clone());
        self.persist_transfer_task(&task)?;
        self.emit_event(FtpEventEnvelope {
            event_type: "taskState".to_string(),
            session: None,
            task: Some(task.clone()),
            message: Some("Transfer task queued".to_string()),
        });
        Ok(task)
    }

    fn queue_transfer_job(
        &self,
        task: &TransferTask,
        max_concurrent: u32,
        operation: TransferJobKind,
    ) -> Result<()> {
        self.inner
            .pending_jobs
            .lock()
            .map_err(|_| anyhow!("ftp pending jobs lock poisoned"))?
            .insert(
                task.id.clone(),
                QueuedTransferJob {
                    task_id: task.id.clone(),
                    session_id: task.session_id.clone(),
                    max_concurrent: max_concurrent.max(1),
                    operation,
                },
            );
        self.inner
            .task_controls
            .lock()
            .map_err(|_| anyhow!("ftp task controls lock poisoned"))?
            .entry(task.id.clone())
            .or_insert_with(|| Arc::new(TransferControl::new()));
        Ok(())
    }

    fn build_local_transfer_plan(&self, root_path: &Path) -> Result<LocalTransferPlan> {
        let mut directories = Vec::new();
        let mut files = Vec::new();
        let mut total_size = 0_u64;
        let mut stack = vec![(root_path.to_path_buf(), PathBuf::new())];

        while let Some((current_path, relative_root)) = stack.pop() {
            for entry in std::fs::read_dir(&current_path).with_context(|| {
                format!("failed to read local directory {}", current_path.display())
            })? {
                let entry = entry.with_context(|| {
                    format!(
                        "failed to inspect local directory {}",
                        current_path.display()
                    )
                })?;
                let child_path = entry.path();
                let child_name = entry.file_name();
                let child_relative = relative_root.join(&child_name);
                let metadata = entry.metadata().with_context(|| {
                    format!("failed to stat local path {}", child_path.display())
                })?;
                if metadata.is_dir() {
                    directories.push(child_relative.clone());
                    stack.push((child_path, child_relative));
                } else {
                    total_size += metadata.len();
                    files.push(LocalTransferFile {
                        source_path: child_path,
                        relative_path: child_relative,
                        size: metadata.len(),
                    });
                }
            }
        }

        directories.sort();
        files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

        Ok(LocalTransferPlan {
            directories,
            files,
            total_size,
        })
    }

    async fn build_remote_transfer_plan(
        &self,
        sftp: Arc<SftpSession>,
        root_path: String,
    ) -> Result<RemoteTransferPlan> {
        let mut directories = Vec::new();
        let mut files = Vec::new();
        let mut total_size = 0_u64;
        let mut stack = vec![(root_path, PathBuf::new())];

        while let Some((current_path, relative_root)) = stack.pop() {
            let entries = sftp
                .read_dir(current_path.clone())
                .await
                .map_err(|e| anyhow!("failed to read remote directory: {}", e))?
                .collect::<Vec<_>>();

            for entry in entries {
                let name = entry.file_name().to_string();
                if name == "." || name == ".." {
                    continue;
                }

                let child_path = join_remote_path(&current_path, &name);
                let child_relative = relative_root.join(&name);
                let metadata = entry.metadata();
                if metadata.is_dir() {
                    directories.push(child_relative.clone());
                    stack.push((child_path, child_relative));
                } else {
                    let file_size = metadata.len();
                    total_size += file_size;
                    files.push(RemoteTransferFile {
                        source_path: child_path,
                        relative_path: child_relative,
                        size: file_size,
                    });
                }
            }
        }

        directories.sort();
        files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

        Ok(RemoteTransferPlan {
            directories,
            files,
            total_size,
        })
    }

    async fn build_remote_transfer_plan_ftp(
        &self,
        resolved: &ResolvedProfileData,
        root_path: String,
    ) -> Result<RemoteTransferPlan> {
        let mut ftp = self.connect_ftp_control_session(resolved).await?;
        let result = async {
            let mut directories = Vec::new();
            let mut files = Vec::new();
            let mut total_size = 0_u64;
            let mut stack = vec![(normalize_remote_path(&root_path), PathBuf::new())];

            while let Some((current_path, relative_root)) = stack.pop() {
                let entries = self
                    .list_ftp_directory_with_client(&mut ftp, &current_path)
                    .await?;
                for entry in entries {
                    let child_relative = relative_root.join(&entry.name);
                    if entry.is_dir {
                        directories.push(child_relative.clone());
                        stack.push((entry.path, child_relative));
                    } else {
                        let file_size = entry.size.max(0) as u64;
                        total_size += file_size;
                        files.push(RemoteTransferFile {
                            source_path: entry.path,
                            relative_path: child_relative,
                            size: file_size,
                        });
                    }
                }
            }

            directories.sort();
            files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

            Ok(RemoteTransferPlan {
                directories,
                files,
                total_size,
            })
        }
        .await;
        ftp.quit().await;
        result
    }

    fn ensure_fxp_supported(
        &self,
        source: &ResolvedProfileData,
        target: &ResolvedProfileData,
    ) -> Result<()> {
        if source.protocol != "ftp" || target.protocol != "ftp" {
            return Err(anyhow!(
                "FXP currently requires both sessions to use direct plain FTP connections"
            ));
        }
        if source.ssh_tunnel.is_some() || target.ssh_tunnel.is_some() {
            return Err(anyhow!(
                "FXP does not support SSH-tunneled FTP sessions because data must flow directly between servers"
            ));
        }
        Ok(())
    }

    async fn run_fxp_file_task(
        &self,
        task_id: String,
        source_resolved: ResolvedProfileData,
        target_resolved: ResolvedProfileData,
        source_path: String,
        target_path: String,
        total_size: u64,
    ) -> Result<TransferRunResult> {
        let control = self.get_task_control(&task_id)?;
        if control.pause_requested.load(Ordering::SeqCst) {
            return Ok(TransferRunResult::Paused(0));
        }

        let started = Instant::now();
        self.execute_fxp_copy(&source_resolved, &source_path, &target_resolved, &target_path)
            .await?;
        self.update_task_progress(
            &task_id,
            total_size,
            total_size,
            started.elapsed().as_secs_f64(),
        )?;
        Ok(TransferRunResult::Completed(total_size))
    }

    async fn run_fxp_directory_task(
        &self,
        task_id: String,
        source_resolved: ResolvedProfileData,
        target_resolved: ResolvedProfileData,
        target_root: String,
        plan: RemoteTransferPlan,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let control = self.get_task_control(&task_id)?;
        let started = Instant::now();
        let mut transferred = initial_offset.min(plan.total_size);
        let mut start_index = 0_usize;
        let mut skipped_size = 0_u64;

        if initial_offset > 0 {
            for (index, file) in plan.files.iter().enumerate() {
                if skipped_size + file.size > transferred {
                    start_index = index;
                    break;
                }
                skipped_size += file.size;
                start_index = index + 1;
            }
        }

        if transferred > 0 {
            self.update_task_progress(
                &task_id,
                transferred,
                plan.total_size,
                started.elapsed().as_secs_f64(),
            )?;
        }

        let mut target = self.connect_ftp_control_session(&target_resolved).await?;
        let result = async {
            for relative_dir in &plan.directories {
                self.ensure_ftp_dir_recursive(
                    &mut target,
                    &join_remote_relative_path(&target_root, relative_dir),
                )
                .await?;
            }
            for file in plan.files.iter().skip(start_index) {
                if control.pause_requested.load(Ordering::SeqCst) {
                    return Ok(TransferRunResult::Paused(transferred));
                }
                let target_path = join_remote_relative_path(&target_root, &file.relative_path);
                self.execute_fxp_copy(
                    &source_resolved,
                    &file.source_path,
                    &target_resolved,
                    &target_path,
                )
                .await?;
                transferred += file.size;
                self.update_task_progress(
                    &task_id,
                    transferred,
                    plan.total_size,
                    started.elapsed().as_secs_f64(),
                )?;
            }
            Ok(TransferRunResult::Completed(transferred))
        }
        .await;
        target.quit().await;
        result
    }

    async fn execute_fxp_copy(
        &self,
        source_resolved: &ResolvedProfileData,
        source_path: &str,
        target_resolved: &ResolvedProfileData,
        target_path: &str,
    ) -> Result<()> {
        self.ensure_fxp_supported(source_resolved, target_resolved)?;
        let mut source = self.connect_ftp_control_session(source_resolved).await?;
        let mut target = self.connect_ftp_control_session(target_resolved).await?;
        let result = async {
            source.transfer_type_binary().await?;
            target.transfer_type_binary().await?;
            if let Some(parent) = remote_parent_path(target_path) {
                self.ensure_ftp_dir_recursive(&mut target, &parent).await?;
            }
            let passive_addr = target.enter_passive_addr().await?;
            source.set_active_target(passive_addr).await?;
            target
                .custom_command(
                    &format!("STOR {}", target_path),
                    &[Status::AboutToSend, Status::AlreadyOpen],
                )
                .await?;
            source
                .custom_command(
                    &format!("RETR {}", source_path),
                    &[Status::AboutToSend, Status::AlreadyOpen],
                )
                .await?;
            source
                .read_response_in(&[Status::ClosingDataConnection, Status::RequestedFileActionOk])
                .await?;
            target
                .read_response_in(&[Status::ClosingDataConnection, Status::RequestedFileActionOk])
                .await?;
            Ok(())
        }
        .await;
        source.quit().await;
        target.quit().await;
        result
    }

    // -------------------------------------------------------------------------
    // Relay transfer helpers (client acts as data pipe between two remotes)
    // -------------------------------------------------------------------------

    /// Copy a single file between two remote sessions by streaming data through
    /// this client.  Either end may be SFTP or FTP/FTPS.
    async fn run_relay_file_task(
        &self,
        task_id: String,
        source_resolved: ResolvedProfileData,
        source_sftp: Option<Arc<SftpSession>>,
        target_resolved: ResolvedProfileData,
        target_sftp: Option<Arc<SftpSession>>,
        source_path: String,
        target_path: String,
        total_size: u64,
    ) -> Result<TransferRunResult> {
        let control = self.get_task_control(&task_id)?;
        if control.pause_requested.load(Ordering::SeqCst) {
            return Ok(TransferRunResult::Paused(0));
        }
        let started = Instant::now();
        let transferred = self
            .relay_copy_file(
                &task_id,
                &control,
                &source_resolved,
                source_sftp.as_deref(),
                &source_path,
                &target_resolved,
                target_sftp.as_deref(),
                &target_path,
                total_size,
                0,
                started,
            )
            .await?;
        match transferred {
            TransferRunResult::Completed(n) => {
                self.update_task_progress(&task_id, n, total_size, started.elapsed().as_secs_f64())?;
                Ok(TransferRunResult::Completed(n))
            }
            paused => Ok(paused),
        }
    }

    /// Copy a directory tree between two remote sessions through the client.
    async fn run_relay_directory_task(
        &self,
        task_id: String,
        source_resolved: ResolvedProfileData,
        source_sftp: Option<Arc<SftpSession>>,
        target_resolved: ResolvedProfileData,
        target_sftp: Option<Arc<SftpSession>>,
        target_root: String,
        plan: RemoteTransferPlan,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let control = self.get_task_control(&task_id)?;
        let started = Instant::now();
        let mut transferred = initial_offset.min(plan.total_size);
        let mut resume_remaining = initial_offset;

        // Pre-create all target directories.
        if let Some(sftp) = &target_sftp {
            for relative_dir in &plan.directories {
                let dir_path = join_remote_relative_path(&target_root, relative_dir);
                self.ensure_remote_dir_recursive(sftp.clone(), &dir_path).await?;
            }
        } else {
            let mut ftp = self.connect_ftp_control_session(&target_resolved).await?;
            let result = async {
                for relative_dir in &plan.directories {
                    let dir_path = join_remote_relative_path(&target_root, relative_dir);
                    self.ensure_ftp_dir_recursive(&mut ftp, &dir_path).await?;
                }
                Ok::<(), anyhow::Error>(())
            }.await;
            ftp.quit().await;
            result?;
        }

        if transferred > 0 {
            self.update_task_progress(
                &task_id,
                transferred,
                plan.total_size,
                started.elapsed().as_secs_f64(),
            )?;
        }

        for file in &plan.files {
            if resume_remaining >= file.size {
                resume_remaining -= file.size;
                continue;
            }
            if control.pause_requested.load(Ordering::SeqCst) {
                return Ok(TransferRunResult::Paused(transferred));
            }
            let target_path = join_remote_relative_path(&target_root, &file.relative_path);
            let result = self
                .relay_copy_file(
                    &task_id,
                    &control,
                    &source_resolved,
                    source_sftp.as_deref(),
                    &file.source_path,
                    &target_resolved,
                    target_sftp.as_deref(),
                    &target_path,
                    file.size,
                    0,
                    started,
                )
                .await?;
            match result {
                TransferRunResult::Completed(n) => {
                    transferred += n;
                    self.update_task_progress(
                        &task_id,
                        transferred,
                        plan.total_size,
                        started.elapsed().as_secs_f64(),
                    )?;
                }
                TransferRunResult::Paused(n) => {
                    transferred += n;
                    return Ok(TransferRunResult::Paused(transferred));
                }
            }
        }
        Ok(TransferRunResult::Completed(transferred))
    }

    /// Core relay: read from source (SFTP or FTP) and write to target (SFTP or FTP).
    /// Returns the number of bytes actually transferred wrapped in a TransferRunResult.
    #[allow(clippy::too_many_arguments)]
    async fn relay_copy_file(
        &self,
        task_id: &str,
        control: &TransferControl,
        source_resolved: &ResolvedProfileData,
        source_sftp: Option<&SftpSession>,
        source_path: &str,
        target_resolved: &ResolvedProfileData,
        target_sftp: Option<&SftpSession>,
        target_path: &str,
        total_size: u64,
        initial_offset: u64,
        started: Instant,
    ) -> Result<TransferRunResult> {
        let mut buffer = vec![0_u8; 256 * 1024];
        let mut transferred = initial_offset;

        match (source_sftp, target_sftp) {
            // SFTP → SFTP
            (Some(src_sftp), Some(dst_sftp)) => {
                let mut src_file = src_sftp
                    .open(source_path.to_string())
                    .await
                    .map_err(|e| anyhow!("relay: failed to open source SFTP file: {}", e))?;
                let dst_flags = if initial_offset > 0 {
                    russh_sftp::protocol::OpenFlags::CREATE | russh_sftp::protocol::OpenFlags::WRITE
                } else {
                    russh_sftp::protocol::OpenFlags::CREATE
                        | russh_sftp::protocol::OpenFlags::TRUNCATE
                        | russh_sftp::protocol::OpenFlags::WRITE
                };
                let mut dst_file = dst_sftp
                    .open_with_flags(target_path.to_string(), dst_flags)
                    .await
                    .map_err(|e| anyhow!("relay: failed to open target SFTP file: {}", e))?;
                if initial_offset > 0 {
                    src_file.seek(SeekFrom::Start(initial_offset)).await?;
                    dst_file.seek(SeekFrom::Start(initial_offset)).await?;
                }
                loop {
                    let read = src_file.read(&mut buffer).await?;
                    if read == 0 {
                        break;
                    }
                    dst_file.write_all(&buffer[..read]).await?;
                    transferred += read as u64;
                    self.update_task_progress(task_id, transferred, total_size, started.elapsed().as_secs_f64())?;
                    if control.pause_requested.load(Ordering::SeqCst) {
                        dst_file.flush().await?;
                        return Ok(TransferRunResult::Paused(transferred));
                    }
                }
                dst_file.flush().await?;
            }
            // SFTP → FTP
            (Some(src_sftp), None) => {
                let mut src_file = src_sftp
                    .open(source_path.to_string())
                    .await
                    .map_err(|e| anyhow!("relay: failed to open source SFTP file: {}", e))?;
                if initial_offset > 0 {
                    src_file.seek(SeekFrom::Start(initial_offset)).await?;
                }
                let mut ftp = self.connect_ftp_control_session(target_resolved).await?;
                let result = async {
                    if let Some(parent) = remote_parent_path(target_path) {
                        self.ensure_ftp_dir_recursive(&mut ftp, &parent).await?;
                    }
                    if initial_offset > 0 {
                        ftp.resume_transfer(initial_offset).await?;
                    }
                    let mut dst_file = ftp.put_stream(target_path).await?;
                    loop {
                        let read = src_file.read(&mut buffer).await?;
                        if read == 0 {
                            break;
                        }
                        dst_file.write_all(&buffer[..read]).await?;
                        transferred += read as u64;
                        self.update_task_progress(task_id, transferred, total_size, started.elapsed().as_secs_f64())?;
                        if control.pause_requested.load(Ordering::SeqCst) {
                            dst_file.flush().await?;
                            ftp.finalize_put_stream(dst_file, target_path).await?;
                            return Ok(TransferRunResult::Paused(transferred));
                        }
                    }
                    dst_file.flush().await?;
                    ftp.finalize_put_stream(dst_file, target_path).await?;
                    Ok(TransferRunResult::Completed(transferred))
                }.await;
                ftp.quit().await;
                return result;
            }
            // FTP → SFTP
            (None, Some(dst_sftp)) => {
                let mut ftp = self.connect_ftp_control_session(source_resolved).await?;
                let result = async {
                    if initial_offset > 0 {
                        ftp.resume_transfer(initial_offset).await?;
                    }
                    let mut src_file = ftp.retr_stream(source_path).await?;
                    let dst_flags = if initial_offset > 0 {
                        russh_sftp::protocol::OpenFlags::CREATE | russh_sftp::protocol::OpenFlags::WRITE
                    } else {
                        russh_sftp::protocol::OpenFlags::CREATE
                            | russh_sftp::protocol::OpenFlags::TRUNCATE
                            | russh_sftp::protocol::OpenFlags::WRITE
                    };
                    if let Some(parent) = remote_parent_path(target_path) {
                        // Build each path segment progressively and ignore creation errors
                        // for segments that already exist, mirroring ensure_remote_dir_recursive.
                        let segments: Vec<&str> = parent
                            .trim_start_matches('/')
                            .split('/')
                            .filter(|s| !s.is_empty())
                            .collect();
                        let mut current = String::from("/");
                        for segment in segments {
                            if current != "/" {
                                current.push('/');
                            }
                            current.push_str(segment);
                            let _ = dst_sftp.create_dir(current.clone()).await;
                        }
                    }
                    let mut dst_file = dst_sftp
                        .open_with_flags(target_path.to_string(), dst_flags)
                        .await
                        .map_err(|e| anyhow!("relay: failed to open target SFTP file: {}", e))?;
                    if initial_offset > 0 {
                        dst_file.seek(SeekFrom::Start(initial_offset)).await?;
                    }
                    loop {
                        let read = src_file.read(&mut buffer).await?;
                        if read == 0 {
                            break;
                        }
                        dst_file.write_all(&buffer[..read]).await?;
                        transferred += read as u64;
                        self.update_task_progress(task_id, transferred, total_size, started.elapsed().as_secs_f64())?;
                        if control.pause_requested.load(Ordering::SeqCst) {
                            dst_file.flush().await?;
                            ftp.finalize_retr_stream(src_file, source_path).await?;
                            return Ok(TransferRunResult::Paused(transferred));
                        }
                    }
                    dst_file.flush().await?;
                    ftp.finalize_retr_stream(src_file, source_path).await?;
                    Ok(TransferRunResult::Completed(transferred))
                }.await;
                ftp.quit().await;
                return result;
            }
            // FTP → FTP (relay, e.g. one or both ends use an SSH tunnel)
            (None, None) => {
                let mut src_ftp = self.connect_ftp_control_session(source_resolved).await?;
                let result = async {
                    if initial_offset > 0 {
                        src_ftp.resume_transfer(initial_offset).await?;
                    }
                    let mut src_file = src_ftp.retr_stream(source_path).await?;
                    let mut dst_ftp = self.connect_ftp_control_session(target_resolved).await?;
                    let inner_result = async {
                        if let Some(parent) = remote_parent_path(target_path) {
                            self.ensure_ftp_dir_recursive(&mut dst_ftp, &parent).await?;
                        }
                        if initial_offset > 0 {
                            dst_ftp.resume_transfer(initial_offset).await?;
                        }
                        let mut dst_file = dst_ftp.put_stream(target_path).await?;
                        loop {
                            let read = src_file.read(&mut buffer).await?;
                            if read == 0 {
                                break;
                            }
                            dst_file.write_all(&buffer[..read]).await?;
                            transferred += read as u64;
                            self.update_task_progress(task_id, transferred, total_size, started.elapsed().as_secs_f64())?;
                            if control.pause_requested.load(Ordering::SeqCst) {
                                dst_file.flush().await?;
                                dst_ftp.finalize_put_stream(dst_file, target_path).await?;
                                return Ok(TransferRunResult::Paused(transferred));
                            }
                        }
                        dst_file.flush().await?;
                        dst_ftp.finalize_put_stream(dst_file, target_path).await?;
                        Ok(TransferRunResult::Completed(transferred))
                    }.await;
                    dst_ftp.quit().await;
                    src_ftp.finalize_retr_stream(src_file, source_path).await?;
                    inner_result
                }.await;
                src_ftp.quit().await;
                return result;
            }
        }
        Ok(TransferRunResult::Completed(transferred))
    }

    async fn run_upload_task(
        &self,
        task_id: String,
        sftp: Arc<SftpSession>,
        local_path: PathBuf,
        remote_path: String,
        total_size: u64,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let mut local_file = fs::File::open(&local_path)
            .await
            .with_context(|| format!("failed to open local file {}", local_path.display()))?;
        if initial_offset > 0 {
            local_file.seek(SeekFrom::Start(initial_offset)).await?;
        }
        let mut remote_file = sftp
            .open_with_flags(
                remote_path.clone(),
                if initial_offset > 0 {
                    OpenFlags::CREATE | OpenFlags::WRITE
                } else {
                    OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE
                },
            )
            .await
            .map_err(|e| anyhow!("failed to open remote file for upload: {}", e))?;
        if initial_offset > 0 {
            remote_file.seek(SeekFrom::Start(initial_offset)).await?;
        }

        let started = Instant::now();
        let mut buffer = vec![0_u8; 64 * 1024];
        let mut transferred = initial_offset;
        let control = self.get_task_control(&task_id)?;

        loop {
            let read = local_file.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            remote_file.write_all(&buffer[..read]).await?;
            transferred += read as u64;
            self.update_task_progress(
                &task_id,
                transferred,
                total_size,
                started.elapsed().as_secs_f64(),
            )?;
            if control.pause_requested.load(Ordering::SeqCst) {
                remote_file.flush().await?;
                return Ok(TransferRunResult::Paused(transferred));
            }
        }

        remote_file.flush().await?;
        Ok(TransferRunResult::Completed(transferred))
    }

    async fn run_upload_task_ftp(
        &self,
        task_id: String,
        resolved: ResolvedProfileData,
        local_path: PathBuf,
        remote_path: String,
        total_size: u64,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
        let result = async {
            if let Some(parent) = remote_parent_path(&remote_path) {
                self.ensure_ftp_dir_recursive(&mut ftp, &parent).await?;
            }
            let mut local_file = fs::File::open(&local_path)
                .await
                .with_context(|| format!("failed to open local file {}", local_path.display()))?;
            if initial_offset > 0 {
                local_file.seek(SeekFrom::Start(initial_offset)).await?;
                ftp.resume_transfer(initial_offset).await?;
            }
            let mut remote_file = ftp.put_stream(&remote_path).await?;
            let started = Instant::now();
            let mut buffer = vec![0_u8; 64 * 1024];
            let mut transferred = initial_offset;
            let control = self.get_task_control(&task_id)?;

            loop {
                let read = local_file.read(&mut buffer).await?;
                if read == 0 {
                    break;
                }
                remote_file.write_all(&buffer[..read]).await?;
                transferred += read as u64;
                self.update_task_progress(
                    &task_id,
                    transferred,
                    total_size,
                    started.elapsed().as_secs_f64(),
                )?;
                if control.pause_requested.load(Ordering::SeqCst) {
                    remote_file.flush().await?;
                    ftp.finalize_put_stream(remote_file, &remote_path).await?;
                    return Ok(TransferRunResult::Paused(transferred));
                }
            }

            remote_file.flush().await?;
            ftp.finalize_put_stream(remote_file, &remote_path).await?;
            Ok(TransferRunResult::Completed(transferred))
        }
        .await;
        ftp.quit().await;
        result
    }

    async fn run_upload_directory_task(
        &self,
        task_id: String,
        sftp: Arc<SftpSession>,
        remote_root: String,
        plan: LocalTransferPlan,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        for directory in &plan.directories {
            let remote_dir = join_remote_relative_path(&remote_root, directory);
            self.ensure_remote_dir_recursive(sftp.clone(), &remote_dir)
                .await?;
        }

        let started = Instant::now();
        let mut transferred = initial_offset;
        let mut resume_remaining = initial_offset;
        let control = self.get_task_control(&task_id)?;
        for file in plan.files {
            if resume_remaining >= file.size {
                resume_remaining -= file.size;
                continue;
            }
            let file_offset = resume_remaining;
            resume_remaining = 0;
            let remote_file_path = join_remote_relative_path(&remote_root, &file.relative_path);
            if let Some(parent) = remote_parent_path(&remote_file_path) {
                self.ensure_remote_dir_recursive(sftp.clone(), &parent)
                    .await?;
            }

            let mut local_file = fs::File::open(&file.source_path).await.with_context(|| {
                format!("failed to open local file {}", file.source_path.display())
            })?;
            if file_offset > 0 {
                local_file.seek(SeekFrom::Start(file_offset)).await?;
            }
            let mut remote_file = sftp
                .open_with_flags(
                    remote_file_path.clone(),
                    if file_offset > 0 {
                        OpenFlags::CREATE | OpenFlags::WRITE
                    } else {
                        OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE
                    },
                )
                .await
                .map_err(|e| anyhow!("failed to open remote file for upload: {}", e))?;
            if file_offset > 0 {
                remote_file.seek(SeekFrom::Start(file_offset)).await?;
            }

            let mut buffer = vec![0_u8; 64 * 1024];
            loop {
                let read = local_file.read(&mut buffer).await?;
                if read == 0 {
                    break;
                }
                remote_file.write_all(&buffer[..read]).await?;
                transferred += read as u64;
                self.update_task_progress(
                    &task_id,
                    transferred,
                    plan.total_size,
                    started.elapsed().as_secs_f64(),
                )?;
                if control.pause_requested.load(Ordering::SeqCst) {
                    remote_file.flush().await?;
                    return Ok(TransferRunResult::Paused(transferred));
                }
            }
            remote_file.flush().await?;
        }

        Ok(TransferRunResult::Completed(transferred))
    }

    async fn run_upload_directory_task_ftp(
        &self,
        task_id: String,
        resolved: ResolvedProfileData,
        remote_root: String,
        plan: LocalTransferPlan,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
        let result = async {
            for directory in &plan.directories {
                let remote_dir = join_remote_relative_path(&remote_root, directory);
                self.ensure_ftp_dir_recursive(&mut ftp, &remote_dir).await?;
            }

            let started = Instant::now();
            let mut transferred = initial_offset;
            let mut resume_remaining = initial_offset;
            let control = self.get_task_control(&task_id)?;
            for file in plan.files {
                if resume_remaining >= file.size {
                    resume_remaining -= file.size;
                    continue;
                }
                let file_offset = resume_remaining;
                resume_remaining = 0;
                let remote_file_path = join_remote_relative_path(&remote_root, &file.relative_path);
                if let Some(parent) = remote_parent_path(&remote_file_path) {
                    self.ensure_ftp_dir_recursive(&mut ftp, &parent).await?;
                }

                let mut local_file =
                    fs::File::open(&file.source_path).await.with_context(|| {
                        format!("failed to open local file {}", file.source_path.display())
                    })?;
                if file_offset > 0 {
                    local_file.seek(SeekFrom::Start(file_offset)).await?;
                    ftp.resume_transfer(file_offset).await?;
                }
                let mut remote_file = ftp.put_stream(&remote_file_path).await?;
                let mut buffer = vec![0_u8; 64 * 1024];
                loop {
                    let read = local_file.read(&mut buffer).await?;
                    if read == 0 {
                        break;
                    }
                    remote_file.write_all(&buffer[..read]).await?;
                    transferred += read as u64;
                    self.update_task_progress(
                        &task_id,
                        transferred,
                        plan.total_size,
                        started.elapsed().as_secs_f64(),
                    )?;
                    if control.pause_requested.load(Ordering::SeqCst) {
                        remote_file.flush().await?;
                        ftp.finalize_put_stream(remote_file, &remote_file_path)
                            .await?;
                        return Ok(TransferRunResult::Paused(transferred));
                    }
                }
                remote_file.flush().await?;
                ftp.finalize_put_stream(remote_file, &remote_file_path)
                    .await?;
            }

            Ok(TransferRunResult::Completed(transferred))
        }
        .await;
        ftp.quit().await;
        result
    }

    async fn run_download_task(
        &self,
        task_id: String,
        sftp: Arc<SftpSession>,
        remote_path: String,
        local_path: PathBuf,
        total_size: u64,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        if let Some(parent) = local_path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).await?;
            }
        }
        let mut remote_file = sftp
            .open(remote_path.clone())
            .await
            .map_err(|e| anyhow!("failed to open remote file for download: {}", e))?;
        if initial_offset > 0 {
            remote_file.seek(SeekFrom::Start(initial_offset)).await?;
        }
        let mut local_file = if initial_offset > 0 {
            fs::OpenOptions::new()
                .create(true)
                .write(true)
                .read(true)
                .open(&local_path)
                .await
                .with_context(|| format!("failed to open local file {}", local_path.display()))?
        } else {
            fs::File::create(&local_path)
                .await
                .with_context(|| format!("failed to create local file {}", local_path.display()))?
        };
        if initial_offset > 0 {
            local_file.seek(SeekFrom::Start(initial_offset)).await?;
        }

        let started = Instant::now();
        let mut buffer = vec![0_u8; 64 * 1024];
        let mut transferred = initial_offset;
        let control = self.get_task_control(&task_id)?;

        loop {
            let read = remote_file.read(&mut buffer).await?;
            if read == 0 {
                break;
            }
            local_file.write_all(&buffer[..read]).await?;
            transferred += read as u64;
            self.update_task_progress(
                &task_id,
                transferred,
                total_size,
                started.elapsed().as_secs_f64(),
            )?;
            if control.pause_requested.load(Ordering::SeqCst) {
                local_file.flush().await?;
                return Ok(TransferRunResult::Paused(transferred));
            }
        }

        local_file.flush().await?;
        Ok(TransferRunResult::Completed(transferred))
    }

    async fn run_download_task_ftp(
        &self,
        task_id: String,
        resolved: ResolvedProfileData,
        remote_path: String,
        local_path: PathBuf,
        total_size: u64,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
        let result = async {
            if let Some(parent) = local_path.parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent).await?;
                }
            }
            if initial_offset > 0 {
                ftp.resume_transfer(initial_offset).await?;
            }
            let mut remote_file = ftp.retr_stream(&remote_path).await?;
            let mut local_file = if initial_offset > 0 {
                fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .read(true)
                    .open(&local_path)
                    .await
                    .with_context(|| {
                        format!("failed to open local file {}", local_path.display())
                    })?
            } else {
                fs::File::create(&local_path).await.with_context(|| {
                    format!("failed to create local file {}", local_path.display())
                })?
            };
            if initial_offset > 0 {
                local_file.seek(SeekFrom::Start(initial_offset)).await?;
            }

            let started = Instant::now();
            let mut buffer = vec![0_u8; 64 * 1024];
            let mut transferred = initial_offset;
            let control = self.get_task_control(&task_id)?;

            loop {
                let read = remote_file.read(&mut buffer).await?;
                if read == 0 {
                    break;
                }
                local_file.write_all(&buffer[..read]).await?;
                transferred += read as u64;
                self.update_task_progress(
                    &task_id,
                    transferred,
                    total_size,
                    started.elapsed().as_secs_f64(),
                )?;
                if control.pause_requested.load(Ordering::SeqCst) {
                    local_file.flush().await?;
                    ftp.finalize_retr_stream(remote_file, &remote_path).await?;
                    return Ok(TransferRunResult::Paused(transferred));
                }
            }

            local_file.flush().await?;
            ftp.finalize_retr_stream(remote_file, &remote_path).await?;
            Ok(TransferRunResult::Completed(transferred))
        }
        .await;
        ftp.quit().await;
        result
    }

    async fn run_download_directory_task(
        &self,
        task_id: String,
        sftp: Arc<SftpSession>,
        local_root: PathBuf,
        plan: RemoteTransferPlan,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        for directory in &plan.directories {
            let local_dir = local_root.join(directory);
            fs::create_dir_all(&local_dir).await.with_context(|| {
                format!("failed to create local directory {}", local_dir.display())
            })?;
        }

        let started = Instant::now();
        let mut transferred = initial_offset;
        let mut resume_remaining = initial_offset;
        let control = self.get_task_control(&task_id)?;
        for file in plan.files {
            if resume_remaining >= file.size {
                resume_remaining -= file.size;
                continue;
            }
            let file_offset = resume_remaining;
            resume_remaining = 0;
            let local_file_path = local_root.join(&file.relative_path);
            if let Some(parent) = local_file_path.parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent).await?;
                }
            }

            let mut remote_file = sftp
                .open(file.source_path.clone())
                .await
                .map_err(|e| anyhow!("failed to open remote file for download: {}", e))?;
            if file_offset > 0 {
                remote_file.seek(SeekFrom::Start(file_offset)).await?;
            }
            let mut local_file = if file_offset > 0 {
                fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .read(true)
                    .open(&local_file_path)
                    .await
                    .with_context(|| {
                        format!("failed to open local file {}", local_file_path.display())
                    })?
            } else {
                fs::File::create(&local_file_path).await.with_context(|| {
                    format!("failed to create local file {}", local_file_path.display())
                })?
            };
            if file_offset > 0 {
                local_file.seek(SeekFrom::Start(file_offset)).await?;
            }

            let mut buffer = vec![0_u8; 64 * 1024];
            loop {
                let read = remote_file.read(&mut buffer).await?;
                if read == 0 {
                    break;
                }
                local_file.write_all(&buffer[..read]).await?;
                transferred += read as u64;
                self.update_task_progress(
                    &task_id,
                    transferred,
                    plan.total_size,
                    started.elapsed().as_secs_f64(),
                )?;
                if control.pause_requested.load(Ordering::SeqCst) {
                    local_file.flush().await?;
                    return Ok(TransferRunResult::Paused(transferred));
                }
            }
            local_file.flush().await?;
        }

        Ok(TransferRunResult::Completed(transferred))
    }

    async fn run_download_directory_task_ftp(
        &self,
        task_id: String,
        resolved: ResolvedProfileData,
        local_root: PathBuf,
        plan: RemoteTransferPlan,
        initial_offset: u64,
    ) -> Result<TransferRunResult> {
        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
        let result = async {
            for directory in &plan.directories {
                let local_dir = local_root.join(directory);
                fs::create_dir_all(&local_dir).await.with_context(|| {
                    format!("failed to create local directory {}", local_dir.display())
                })?;
            }

            let started = Instant::now();
            let mut transferred = initial_offset;
            let mut resume_remaining = initial_offset;
            let control = self.get_task_control(&task_id)?;
            for file in plan.files {
                if resume_remaining >= file.size {
                    resume_remaining -= file.size;
                    continue;
                }
                let file_offset = resume_remaining;
                resume_remaining = 0;
                let local_file_path = local_root.join(&file.relative_path);
                if let Some(parent) = local_file_path.parent() {
                    if !parent.as_os_str().is_empty() {
                        fs::create_dir_all(parent).await?;
                    }
                }

                if file_offset > 0 {
                    ftp.resume_transfer(file_offset).await?;
                }
                let mut remote_file = ftp.retr_stream(&file.source_path).await?;
                let mut local_file = if file_offset > 0 {
                    fs::OpenOptions::new()
                        .create(true)
                        .write(true)
                        .read(true)
                        .open(&local_file_path)
                        .await
                        .with_context(|| {
                            format!("failed to open local file {}", local_file_path.display())
                        })?
                } else {
                    fs::File::create(&local_file_path).await.with_context(|| {
                        format!("failed to create local file {}", local_file_path.display())
                    })?
                };
                if file_offset > 0 {
                    local_file.seek(SeekFrom::Start(file_offset)).await?;
                }

                let mut buffer = vec![0_u8; 64 * 1024];
                loop {
                    let read = remote_file.read(&mut buffer).await?;
                    if read == 0 {
                        break;
                    }
                    local_file.write_all(&buffer[..read]).await?;
                    transferred += read as u64;
                    self.update_task_progress(
                        &task_id,
                        transferred,
                        plan.total_size,
                        started.elapsed().as_secs_f64(),
                    )?;
                    if control.pause_requested.load(Ordering::SeqCst) {
                        local_file.flush().await?;
                        ftp.finalize_retr_stream(remote_file, &file.source_path)
                            .await?;
                        return Ok(TransferRunResult::Paused(transferred));
                    }
                }
                local_file.flush().await?;
                ftp.finalize_retr_stream(remote_file, &file.source_path)
                    .await?;
            }

            Ok(TransferRunResult::Completed(transferred))
        }
        .await;
        ftp.quit().await;
        result
    }

    fn schedule_pending_tasks(&self) -> Result<()> {
        let mut pending_jobs = self
            .inner
            .pending_jobs
            .lock()
            .map_err(|_| anyhow!("ftp pending jobs lock poisoned"))?;
        if pending_jobs.is_empty() {
            return Ok(());
        }

        let mut tasks = self
            .inner
            .tasks
            .write()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?;
        let mut active_counts = HashMap::<String, u32>::new();
        for task in tasks.values() {
            if task.status == "transferring" {
                *active_counts.entry(task.session_id.clone()).or_insert(0) += 1;
            }
        }

        let mut pending_items = pending_jobs
            .values()
            .filter_map(|job| {
                tasks.get(&job.task_id).map(|task| {
                    (
                        job.task_id.clone(),
                        job.session_id.clone(),
                        job.max_concurrent.max(1),
                        task.created_at,
                        transfer_priority_rank(&task.priority),
                    )
                })
            })
            .collect::<Vec<_>>();
        pending_items.sort_by(|left, right| {
            right
                .4
                .cmp(&left.4)
                .then_with(|| left.3.cmp(&right.3))
                .then_with(|| left.0.cmp(&right.0))
        });

        let mut started_jobs = Vec::new();
        for (task_id, session_id, max_concurrent, _, _) in pending_items {
            let active_count = active_counts.entry(session_id.clone()).or_insert(0);
            if *active_count >= max_concurrent {
                continue;
            }
            let Some(task) = tasks.get_mut(&task_id) else {
                pending_jobs.remove(&task_id);
                continue;
            };
            if task.status != "pending" {
                continue;
            }
            task.status = "transferring".to_string();
            task.started_at = Some(task.started_at.unwrap_or_else(unix_now));
            task.completed_at = None;
            task.error_message = None;
            *active_count += 1;
            if let Some(job) = pending_jobs.get(&task_id).cloned() {
                started_jobs.push(job);
            }
        }
        drop(tasks);
        drop(pending_jobs);

        for job in started_jobs {
            self.emit_task(&job.task_id, "taskState", Some("Transfer started"));
            self.spawn_transfer_job(job);
        }

        Ok(())
    }

    async fn build_retry_job(&self, task: &TransferTask) -> Result<(QueuedTransferJob, u64, u64)> {
        let session = self.find_or_reconnect_session_for_task(task).await?;
        let descriptor = session
            .descriptor
            .lock()
            .map_err(|_| anyhow!("ftp session descriptor poisoned"))?
            .clone();
        let max_concurrent = self
            .get_profile(&descriptor.profile_id)?
            .max_concurrent
            .max(1);

        if session.resolved.protocol == "sftp" {
            let sftp = session.require_sftp()?;
            match task.direction.as_str() {
                "upload" => {
                    let local_path = normalize_local_path(task.local_path.clone());
                    let metadata = std::fs::metadata(&local_path).with_context(|| {
                        format!("failed to stat local file {}", local_path.display())
                    })?;
                    let remote_path = normalize_remote_path(&task.remote_path);
                    if metadata.is_dir() {
                        let plan = self.build_local_transfer_plan(&local_path)?;
                        self.ensure_remote_dir_recursive(sftp.clone(), &remote_path)
                            .await?;
                        let offset = self
                            .calculate_upload_directory_offset(sftp.clone(), &remote_path, &plan)
                            .await?;
                        Ok((
                            QueuedTransferJob {
                                task_id: task.id.clone(),
                                session_id: descriptor.session_id,
                                max_concurrent,
                                operation: TransferJobKind::UploadDirectory {
                                    sftp,
                                    remote_root: remote_path,
                                    plan: plan.clone(),
                                },
                            },
                            offset.min(plan.total_size),
                            plan.total_size,
                        ))
                    } else {
                        let total_size = metadata.len();
                        let offset = self
                            .calculate_upload_file_offset(sftp.clone(), &remote_path, total_size)
                            .await?;
                        Ok((
                            QueuedTransferJob {
                                task_id: task.id.clone(),
                                session_id: descriptor.session_id,
                                max_concurrent,
                                operation: TransferJobKind::UploadFile {
                                    sftp,
                                    local_path,
                                    remote_path,
                                    total_size,
                                },
                            },
                            offset.min(total_size),
                            total_size,
                        ))
                    }
                }
                "download" => {
                    let remote_path = normalize_remote_path(&task.remote_path);
                    let remote_metadata = sftp
                        .metadata(remote_path.clone())
                        .await
                        .map_err(|e| anyhow!("failed to stat remote file: {}", e))?;
                    let local_path = normalize_local_path(task.local_path.clone());
                    if remote_metadata.is_dir() {
                        fs::create_dir_all(&local_path).await.with_context(|| {
                            format!("failed to create local directory {}", local_path.display())
                        })?;
                        let plan = self
                            .build_remote_transfer_plan(sftp.clone(), remote_path.clone())
                            .await?;
                        let offset =
                            self.calculate_download_directory_offset(&local_path, &plan)?;
                        Ok((
                            QueuedTransferJob {
                                task_id: task.id.clone(),
                                session_id: descriptor.session_id,
                                max_concurrent,
                                operation: TransferJobKind::DownloadDirectory {
                                    sftp,
                                    local_root: local_path,
                                    plan: plan.clone(),
                                },
                            },
                            offset.min(plan.total_size),
                            plan.total_size,
                        ))
                    } else {
                        let total_size = remote_metadata.len();
                        let offset =
                            self.calculate_download_file_offset(&local_path, total_size)?;
                        Ok((
                            QueuedTransferJob {
                                task_id: task.id.clone(),
                                session_id: descriptor.session_id,
                                max_concurrent,
                                operation: TransferJobKind::DownloadFile {
                                    sftp,
                                    remote_path,
                                    local_path,
                                    total_size,
                                },
                            },
                            offset.min(total_size),
                            total_size,
                        ))
                    }
                }
                _ => Err(anyhow!(
                    "Unsupported transfer direction '{}'",
                    task.direction
                )),
            }
        } else {
            let resolved = session.resolved.clone();
            match task.direction.as_str() {
                "upload" => {
                    let local_path = normalize_local_path(task.local_path.clone());
                    let metadata = std::fs::metadata(&local_path).with_context(|| {
                        format!("failed to stat local file {}", local_path.display())
                    })?;
                    let remote_path = normalize_remote_path(&task.remote_path);
                    if metadata.is_dir() {
                        let plan = self.build_local_transfer_plan(&local_path)?;
                        self.ensure_ftp_dir_recursive_for_resolved(&resolved, &remote_path)
                            .await?;
                        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
                        let result = async {
                            let offset = self
                                .calculate_upload_directory_offset_ftp(
                                    &mut ftp,
                                    &remote_path,
                                    &plan,
                                )
                                .await?;
                            Ok((
                                QueuedTransferJob {
                                    task_id: task.id.clone(),
                                    session_id: descriptor.session_id,
                                    max_concurrent,
                                    operation: TransferJobKind::UploadDirectoryFtp {
                                        resolved: resolved.clone(),
                                        remote_root: remote_path.clone(),
                                        plan: plan.clone(),
                                    },
                                },
                                offset.min(plan.total_size),
                                plan.total_size,
                            ))
                        }
                        .await;
                        ftp.quit().await;
                        result
                    } else {
                        let total_size = metadata.len();
                        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
                        let result = async {
                            let offset = self
                                .calculate_upload_file_offset_ftp(
                                    &mut ftp,
                                    &remote_path,
                                    total_size,
                                )
                                .await?;
                            Ok((
                                QueuedTransferJob {
                                    task_id: task.id.clone(),
                                    session_id: descriptor.session_id,
                                    max_concurrent,
                                    operation: TransferJobKind::UploadFileFtp {
                                        resolved: resolved.clone(),
                                        local_path,
                                        remote_path,
                                        total_size,
                                    },
                                },
                                offset.min(total_size),
                                total_size,
                            ))
                        }
                        .await;
                        ftp.quit().await;
                        result
                    }
                }
                "download" => {
                    let remote_path = normalize_remote_path(&task.remote_path);
                    let local_path = normalize_local_path(task.local_path.clone());
                    let mut ftp = self.connect_ftp_control_session(&resolved).await?;
                    let result = async {
                        let remote_metadata = self
                            .inspect_ftp_remote_path_with_client(&mut ftp, &remote_path)
                            .await?;
                        if remote_metadata.is_dir {
                            fs::create_dir_all(&local_path).await.with_context(|| {
                                format!("failed to create local directory {}", local_path.display())
                            })?;
                            let plan = self
                                .build_remote_transfer_plan_ftp(&resolved, remote_path.clone())
                                .await?;
                            let offset =
                                self.calculate_download_directory_offset(&local_path, &plan)?;
                            Ok((
                                QueuedTransferJob {
                                    task_id: task.id.clone(),
                                    session_id: descriptor.session_id,
                                    max_concurrent,
                                    operation: TransferJobKind::DownloadDirectoryFtp {
                                        resolved: resolved.clone(),
                                        local_root: local_path,
                                        plan: plan.clone(),
                                    },
                                },
                                offset.min(plan.total_size),
                                plan.total_size,
                            ))
                        } else {
                            let total_size = remote_metadata.size;
                            let offset =
                                self.calculate_download_file_offset(&local_path, total_size)?;
                            Ok((
                                QueuedTransferJob {
                                    task_id: task.id.clone(),
                                    session_id: descriptor.session_id,
                                    max_concurrent,
                                    operation: TransferJobKind::DownloadFileFtp {
                                        resolved: resolved.clone(),
                                        remote_path,
                                        local_path,
                                        total_size,
                                    },
                                },
                                offset.min(total_size),
                                total_size,
                            ))
                        }
                    }
                    .await;
                    ftp.quit().await;
                    result
                }
                _ => Err(anyhow!(
                    "Unsupported transfer direction '{}'",
                    task.direction
                )),
            }
        }
    }

    fn find_session_for_task(&self, task: &TransferTask) -> Result<Arc<FtpRuntimeSession>> {
        if let Ok(session) = self.get_session(&task.session_id) {
            return Ok(session);
        }

        self.inner
            .sessions
            .read()
            .map_err(|_| anyhow!("ftp sessions lock poisoned"))?
            .values()
            .find_map(|session| {
                session
                    .descriptor
                    .lock()
                    .ok()
                    .filter(|descriptor| descriptor.profile_id == task.profile_id)
                    .map(|_| session.clone())
            })
            .ok_or_else(|| {
                anyhow!(
                    "No active FTP session found for profile '{}'",
                    task.profile_id
                )
            })
    }

    async fn find_or_reconnect_session_for_task(
        &self,
        task: &TransferTask,
    ) -> Result<Arc<FtpRuntimeSession>> {
        if let Ok(session) = self.find_session_for_task(task) {
            return Ok(session);
        }

        let descriptor = self
            .connect(ConnectFtpInput {
                profile_id: task.profile_id.clone(),
                password: None,
                auth_session_id: None,
                challenge_responses: None,
            })
            .await?;
        self.get_session(&descriptor.session_id)
    }

    async fn calculate_upload_file_offset(
        &self,
        sftp: Arc<SftpSession>,
        remote_path: &str,
        local_size: u64,
    ) -> Result<u64> {
        match sftp.metadata(remote_path.to_string()).await {
            Ok(metadata) if !metadata.is_dir() => Ok(metadata.len().min(local_size)),
            Ok(_) => Err(anyhow!("Remote path '{}' is a directory", remote_path)),
            Err(_) => Ok(0),
        }
    }

    async fn calculate_upload_file_offset_ftp(
        &self,
        ftp: &mut FtpControlSession,
        remote_path: &str,
        local_size: u64,
    ) -> Result<u64> {
        match self
            .inspect_ftp_remote_path_with_client(ftp, remote_path)
            .await
        {
            Ok(metadata) if metadata.is_dir => {
                Err(anyhow!("Remote path '{}' is a directory", remote_path))
            }
            Ok(metadata) => Ok(metadata.size.min(local_size)),
            Err(_) => Ok(0),
        }
    }

    fn calculate_download_file_offset(&self, local_path: &Path, remote_size: u64) -> Result<u64> {
        match std::fs::metadata(local_path) {
            Ok(metadata) if metadata.is_dir() => Err(anyhow!(
                "Local path '{}' is a directory",
                local_path.display()
            )),
            Ok(metadata) => Ok(metadata.len().min(remote_size)),
            Err(_) => Ok(0),
        }
    }

    async fn calculate_upload_directory_offset(
        &self,
        sftp: Arc<SftpSession>,
        remote_root: &str,
        plan: &LocalTransferPlan,
    ) -> Result<u64> {
        let mut offset = 0_u64;
        for file in &plan.files {
            let remote_file_path = join_remote_relative_path(remote_root, &file.relative_path);
            match sftp.metadata(remote_file_path).await {
                Ok(metadata) if !metadata.is_dir() => {
                    let aligned = metadata.len().min(file.size);
                    offset += aligned;
                    if aligned < file.size {
                        break;
                    }
                }
                Ok(_) => break,
                Err(_) => break,
            }
        }
        Ok(offset.min(plan.total_size))
    }

    async fn calculate_upload_directory_offset_ftp(
        &self,
        ftp: &mut FtpControlSession,
        remote_root: &str,
        plan: &LocalTransferPlan,
    ) -> Result<u64> {
        let mut offset = 0_u64;
        for file in &plan.files {
            let remote_file_path = join_remote_relative_path(remote_root, &file.relative_path);
            match self
                .inspect_ftp_remote_path_with_client(ftp, &remote_file_path)
                .await
            {
                Ok(metadata) if !metadata.is_dir => {
                    let aligned = metadata.size.min(file.size);
                    offset += aligned;
                    if aligned < file.size {
                        break;
                    }
                }
                Ok(_) => break,
                Err(_) => break,
            }
        }
        Ok(offset.min(plan.total_size))
    }

    fn calculate_download_directory_offset(
        &self,
        local_root: &Path,
        plan: &RemoteTransferPlan,
    ) -> Result<u64> {
        let mut offset = 0_u64;
        for file in &plan.files {
            let local_file_path = local_root.join(&file.relative_path);
            match std::fs::metadata(&local_file_path) {
                Ok(metadata) if metadata.is_dir() => break,
                Ok(metadata) => {
                    let aligned = metadata.len().min(file.size);
                    offset += aligned;
                    if aligned < file.size {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        Ok(offset.min(plan.total_size))
    }

    fn spawn_transfer_job(&self, job: QueuedTransferJob) {
        let manager = self.clone();
        tokio::spawn(async move {
            let task_id = job.task_id.clone();
            if let Ok(control) = manager.get_task_control(&task_id) {
                control.pause_requested.store(false, Ordering::SeqCst);
            }
            let initial_offset = manager
                .get_task(&task_id)
                .map(|task| task.transferred_size.max(0) as u64)
                .unwrap_or(0);
            let result = match job.operation {
                TransferJobKind::UploadFile {
                    sftp,
                    local_path,
                    remote_path,
                    total_size,
                } => {
                    manager
                        .run_upload_task(
                            task_id.clone(),
                            sftp,
                            local_path,
                            remote_path,
                            total_size,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::UploadFileFtp {
                    resolved,
                    local_path,
                    remote_path,
                    total_size,
                } => {
                    manager
                        .run_upload_task_ftp(
                            task_id.clone(),
                            resolved,
                            local_path,
                            remote_path,
                            total_size,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::UploadDirectory {
                    sftp,
                    remote_root,
                    plan,
                } => {
                    manager
                        .run_upload_directory_task(
                            task_id.clone(),
                            sftp,
                            remote_root,
                            plan,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::UploadDirectoryFtp {
                    resolved,
                    remote_root,
                    plan,
                } => {
                    manager
                        .run_upload_directory_task_ftp(
                            task_id.clone(),
                            resolved,
                            remote_root,
                            plan,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::DownloadFile {
                    sftp,
                    remote_path,
                    local_path,
                    total_size,
                } => {
                    manager
                        .run_download_task(
                            task_id.clone(),
                            sftp,
                            remote_path,
                            local_path,
                            total_size,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::DownloadFileFtp {
                    resolved,
                    remote_path,
                    local_path,
                    total_size,
                } => {
                    manager
                        .run_download_task_ftp(
                            task_id.clone(),
                            resolved,
                            remote_path,
                            local_path,
                            total_size,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::DownloadDirectory {
                    sftp,
                    local_root,
                    plan,
                } => {
                    manager
                        .run_download_directory_task(
                            task_id.clone(),
                            sftp,
                            local_root,
                            plan,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::DownloadDirectoryFtp {
                    resolved,
                    local_root,
                    plan,
                } => {
                    manager
                        .run_download_directory_task_ftp(
                            task_id.clone(),
                            resolved,
                            local_root,
                            plan,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::FxpFile {
                    source_resolved,
                    target_resolved,
                    source_path,
                    target_path,
                    total_size,
                } => {
                    manager
                        .run_fxp_file_task(
                            task_id.clone(),
                            source_resolved,
                            target_resolved,
                            source_path,
                            target_path,
                            total_size,
                        )
                        .await
                }
                TransferJobKind::FxpDirectory {
                    source_resolved,
                    target_resolved,
                    target_root,
                    plan,
                } => {
                    manager
                        .run_fxp_directory_task(
                            task_id.clone(),
                            source_resolved,
                            target_resolved,
                            target_root,
                            plan,
                            initial_offset,
                        )
                        .await
                }
                TransferJobKind::RelayFile {
                    source_resolved,
                    source_sftp,
                    target_resolved,
                    target_sftp,
                    source_path,
                    target_path,
                    total_size,
                } => {
                    manager
                        .run_relay_file_task(
                            task_id.clone(),
                            source_resolved,
                            source_sftp,
                            target_resolved,
                            target_sftp,
                            source_path,
                            target_path,
                            total_size,
                        )
                        .await
                }
                TransferJobKind::RelayDirectory {
                    source_resolved,
                    source_sftp,
                    target_resolved,
                    target_sftp,
                    target_root,
                    plan,
                } => {
                    manager
                        .run_relay_directory_task(
                            task_id.clone(),
                            source_resolved,
                            source_sftp,
                            target_resolved,
                            target_sftp,
                            target_root,
                            plan,
                            initial_offset,
                        )
                        .await
                }
            };

            match result {
                Ok(TransferRunResult::Completed(transferred_size)) => {
                    let _ = manager.complete_task(&task_id, transferred_size);
                }
                Ok(TransferRunResult::Paused(transferred_size)) => {
                    let _ = manager.pause_task_after_checkpoint(&task_id, transferred_size);
                }
                Err(error) => {
                    let _ = manager.handle_task_failure(task_id.clone(), error.to_string());
                }
            }
        });
    }

    fn update_task_progress(
        &self,
        task_id: &str,
        transferred_size: u64,
        total_size: u64,
        elapsed_secs: f64,
    ) -> Result<()> {
        self.with_task_mut(task_id, |task| {
            task.transferred_size = u64_to_i64(transferred_size);
            task.progress = if total_size == 0 {
                100.0
            } else {
                (transferred_size as f64 / total_size as f64) * 100.0
            };
            task.speed_bytes_per_sec = if elapsed_secs > 0.0 {
                transferred_size as f64 / elapsed_secs
            } else {
                0.0
            };
        })?;
        self.emit_task(task_id, "taskProgress", None);
        Ok(())
    }

    fn pause_task_after_checkpoint(&self, task_id: &str, transferred_size: u64) -> Result<()> {
        self.with_task_mut(task_id, |task| {
            task.transferred_size = u64_to_i64(transferred_size);
            task.progress = if task.file_size <= 0 {
                0.0
            } else {
                ((transferred_size as f64 / task.file_size.max(1) as f64) * 100.0).clamp(0.0, 100.0)
            };
            task.status = "paused".to_string();
            task.speed_bytes_per_sec = 0.0;
            task.completed_at = None;
        })?;
        if let Ok(control) = self.get_task_control(task_id) {
            control.pause_requested.store(false, Ordering::SeqCst);
        }
        self.emit_task(task_id, "taskState", Some("Transfer paused"));
        self.schedule_pending_tasks()?;
        Ok(())
    }

    fn handle_task_failure(&self, task_id: String, error_message: String) -> Result<()> {
        let task = self.get_task(&task_id)?;
        if task.direction == "fxp" {
            self.finalize_task_failure(&task_id, error_message);
            return Ok(());
        }
        let retry_policy = self.get_retry_policy()?;
        let next_attempt = task.retry_count + 1;
        if next_attempt > retry_policy.max_retries {
            self.finalize_task_failure(
                &task_id,
                format!(
                    "{} (automatic retries exhausted after {}/{})",
                    error_message, task.retry_count, retry_policy.max_retries
                ),
            );
            return Ok(());
        }

        let delay_secs = retry_delay_secs(next_attempt, retry_policy.base_delay_secs);
        self.with_task_mut(&task_id, |item| {
            item.retry_count = next_attempt;
            item.status = "retrying".to_string();
            item.error_message = Some(format!(
                "{}; retrying in {}s ({}/{})",
                error_message, delay_secs, next_attempt, retry_policy.max_retries
            ));
            item.speed_bytes_per_sec = 0.0;
            item.started_at = None;
            item.completed_at = None;
        })?;
        self.emit_task(
            &task_id,
            "taskState",
            Some(&format!(
                "Transfer will retry in {}s ({}/{})",
                delay_secs, next_attempt, retry_policy.max_retries
            )),
        );

        let manager = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(delay_secs as u64)).await;
            let should_retry = manager
                .get_task(&task_id)
                .map(|item| item.status == "retrying" && item.retry_count == next_attempt)
                .unwrap_or(false);
            if !should_retry {
                return;
            }
            let _ = manager
                .queue_retry_attempt(task_id.clone(), next_attempt)
                .await;
        });

        Ok(())
    }

    async fn queue_retry_attempt(&self, task_id: String, attempt: i64) -> Result<()> {
        let task = self.get_task(&task_id)?;
        let retry_policy = self.get_retry_policy()?;
        if task.status != "retrying" || task.retry_count != attempt {
            return Ok(());
        }

        let (job, aligned_offset, total_size) = match self.build_retry_job(&task).await {
            Ok(result) => result,
            Err(retry_error) => {
                let _ = self.handle_task_failure(
                    task_id,
                    format!("automatic retry failed: {}", retry_error),
                );
                return Ok(());
            }
        };

        self.inner
            .pending_jobs
            .lock()
            .map_err(|_| anyhow!("ftp pending jobs lock poisoned"))?
            .insert(task_id.clone(), job.clone());
        self.inner
            .task_controls
            .lock()
            .map_err(|_| anyhow!("ftp task controls lock poisoned"))?
            .insert(task_id.clone(), Arc::new(TransferControl::new()));

        self.with_task_mut(&task_id, |item| {
            item.session_id = job.session_id.clone();
            item.file_size = u64_to_i64(total_size);
            item.transferred_size = u64_to_i64(aligned_offset);
            item.progress = if total_size == 0 {
                0.0
            } else {
                ((aligned_offset as f64 / total_size as f64) * 100.0).clamp(0.0, 100.0)
            };
            item.status = "pending".to_string();
            item.error_message = Some(format!(
                "Automatic retry queued ({}/{})",
                attempt, retry_policy.max_retries
            ));
            item.speed_bytes_per_sec = 0.0;
            item.started_at = None;
            item.completed_at = None;
        })?;
        self.emit_task(&task_id, "taskState", Some("Automatic retry queued"));
        self.schedule_pending_tasks()?;
        Ok(())
    }

    fn complete_task(&self, task_id: &str, transferred_size: u64) -> Result<()> {
        self.with_task_mut(task_id, |task| {
            task.transferred_size = u64_to_i64(transferred_size);
            task.progress = 100.0;
            task.status = "completed".to_string();
            task.retry_count = 0;
            task.speed_bytes_per_sec = 0.0;
            task.completed_at = Some(unix_now());
        })?;
        self.unregister_transfer_job(task_id);
        self.emit_task(task_id, "taskState", Some("Transfer completed"));
        let _ = self.schedule_pending_tasks();
        Ok(())
    }

    fn finalize_task_failure(&self, task_id: &str, error_message: String) {
        let _ = self.with_task_mut(task_id, |task| {
            task.status = "failed".to_string();
            task.error_message = Some(error_message.clone());
            task.speed_bytes_per_sec = 0.0;
            task.completed_at = Some(unix_now());
        });
        self.emit_task(task_id, "taskState", Some(&error_message));
        let _ = self.schedule_pending_tasks();
    }

    fn emit_task(&self, task_id: &str, event_type: &str, message: Option<&str>) {
        let task = self
            .inner
            .tasks
            .read()
            .ok()
            .and_then(|tasks| tasks.get(task_id).cloned());
        if let Some(task) = task {
            let _ = self.persist_transfer_task(&task);
            self.emit_event(FtpEventEnvelope {
                event_type: event_type.to_string(),
                session: None,
                task: Some(task),
                message: message.map(|value| value.to_string()),
            });
        }
    }

    fn with_task_mut<F>(&self, task_id: &str, mutator: F) -> Result<()>
    where
        F: FnOnce(&mut TransferTask),
    {
        let mut tasks = self
            .inner
            .tasks
            .write()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?;
        let task = tasks
            .get_mut(task_id)
            .ok_or_else(|| anyhow!("Transfer task '{}' not found", task_id))?;
        mutator(task);
        Ok(())
    }

    fn get_task(&self, task_id: &str) -> Result<TransferTask> {
        self.inner
            .tasks
            .read()
            .map_err(|_| anyhow!("ftp tasks lock poisoned"))?
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("Transfer task '{}' not found", task_id))
    }

    fn get_task_control(&self, task_id: &str) -> Result<Arc<TransferControl>> {
        let control = self
            .inner
            .task_controls
            .lock()
            .map_err(|_| anyhow!("ftp task controls lock poisoned"))?
            .entry(task_id.to_string())
            .or_insert_with(|| Arc::new(TransferControl::new()))
            .clone();
        Ok(control)
    }

    fn unregister_transfer_job(&self, task_id: &str) {
        if let Ok(mut jobs) = self.inner.pending_jobs.lock() {
            jobs.remove(task_id);
        }
        if let Ok(mut controls) = self.inner.task_controls.lock() {
            controls.remove(task_id);
        }
    }

    fn persist_transfer_task(&self, task: &TransferTask) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ftp_transfer_history
                        (id, session_id, direction, local_path, remote_path, file_size,
                         transferred_size, status, priority, error_message, retry_count,
                         started_at, completed_at, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                     ON CONFLICT(id) DO UPDATE SET
                        transferred_size = excluded.transferred_size,
                        status = excluded.status,
                        priority = excluded.priority,
                        error_message = excluded.error_message,
                        retry_count = excluded.retry_count,
                        started_at = excluded.started_at,
                        completed_at = excluded.completed_at",
                    rusqlite::params![
                        task.id,
                        task.profile_id,
                        task.direction,
                        task.local_path,
                        task.remote_path,
                        task.file_size as i64,
                        task.transferred_size as i64,
                        task.status,
                        task.priority,
                        task.error_message,
                        task.retry_count,
                        task.started_at,
                        task.completed_at,
                        task.created_at,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn load_transfer_history(&self) -> Result<Vec<TransferTask>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, session_id, direction, local_path, remote_path, file_size,
                                transferred_size, status, priority, error_message, retry_count, started_at, completed_at, created_at
                         FROM ftp_transfer_history
                         ORDER BY created_at DESC
                         LIMIT 200",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        let direction = row.get::<_, String>(2)?;
                        let local_path = row.get::<_, String>(3)?;
                        let remote_path = row.get::<_, String>(4)?;
                        let file_size = row.get::<_, i64>(5)?;
                        let transferred_size = row.get::<_, i64>(6)?;
                        let status = row.get::<_, String>(7)?;
                        let priority = row.get::<_, Option<String>>(8)?
                            .map(|value| normalize_transfer_priority(&value))
                            .unwrap_or_else(|| "medium".to_string());
                        let progress = if file_size <= 0 {
                            if status == "completed" { 100.0 } else { 0.0 }
                        } else {
                            ((transferred_size.max(0) as f64 / file_size.max(1) as f64) * 100.0)
                                .clamp(0.0, 100.0)
                        };
                        Ok(TransferTask {
                            id: row.get(0)?,
                            session_id: row.get(1)?,
                            profile_id: row.get(1)?,
                            retry_count: row.get(10)?,
                            priority,
                            direction: direction.clone(),
                            local_path: local_path.clone(),
                            remote_path: remote_path.clone(),
                            file_name: file_name_from_path(match direction.as_str() {
                                "download" => &remote_path,
                                _ => &local_path,
                            }),
                            file_size,
                            transferred_size,
                            progress,
                            speed_bytes_per_sec: 0.0,
                            status,
                            error_message: row.get(9)?,
                            started_at: row.get(11)?,
                            completed_at: row.get(12)?,
                            created_at: row.get(13)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                rows.collect::<std::result::Result<Vec<_>, _>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }
}
