use anyhow::{anyhow, Context, Result};
use russh::client::{self, Msg};
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::{load_openssh_certificate, load_secret_key};
use russh::{Channel, ChannelMsg, Disconnect};
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{Arc, RwLock};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;

use super::handler::SshClientHandler;
use super::models::*;
use super::port_forward::PortForwardHandle;
use super::{RemoteForwardMapping, SshChannelCommand, SshSession};

trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T> AsyncStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

impl super::SshConnectionManager {
    pub fn list_sessions(&self) -> Result<Vec<SshSessionDescriptor>> {
        let sessions = self
            .inner
            .sessions
            .read()
            .map_err(|_| anyhow!("ssh session registry poisoned"))?;

        let mut descriptors = Vec::with_capacity(sessions.len());
        for session in sessions.values() {
            let descriptor = session
                .descriptor
                .lock()
                .map_err(|_| anyhow!("ssh session descriptor poisoned"))?
                .clone();
            descriptors.push(descriptor);
        }
        Ok(descriptors)
    }

    pub async fn connect(&self, input: ConnectSshInput) -> Result<SshSessionDescriptor> {
        let profile = self.get_profile(&input.profile_id)?;
        let session_id = self.next_session_id();
        let descriptor = SshSessionDescriptor {
            session_id: session_id.clone(),
            profile_id: profile.id.clone(),
            profile_label: profile.label.clone(),
            host: profile.host.clone(),
            port: profile.port,
            username: profile.username.clone(),
            status: "connecting".to_string(),
            via_jump_host: profile
                .jump_host_json
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty()),
        };

        self.emit_event(SshEventEnvelope {
            event_type: "state".to_string(),
            session_id: session_id.clone(),
            data: None,
            status: Some("connecting".to_string()),
            message: Some("connecting".to_string()),
            exit_code: None,
        });

        let password = self.resolve_password(&profile, input.password.as_deref())?;
        let key_path = self.resolve_key_path(&profile)?;
        let certificate_path = self.resolve_certificate_path(&profile)?;
        let key_passphrase = self.resolve_key_passphrase(&profile)?;
        let remote_forward_map: RemoteForwardMapping = Arc::new(RwLock::new(HashMap::new()));

        let ssh = self
            .open_authenticated_handle(
                &profile,
                password,
                key_path,
                certificate_path,
                key_passphrase,
                remote_forward_map.clone(),
            )
            .await?;

        let channel = ssh
            .channel_open_session()
            .await
            .map_err(|e| anyhow!("failed to open SSH channel: {}", e))?;
        channel
            .request_pty(
                true,
                &default_term(),
                input.cols.max(1),
                input.rows.max(1),
                0,
                0,
                &[],
            )
            .await
            .map_err(|e| anyhow!("failed to request SSH PTY: {}", e))?;
        channel
            .request_shell(true)
            .await
            .map_err(|e| anyhow!("failed to start remote shell: {}", e))?;

        let (channel_tx, channel_rx) = tokio::sync::mpsc::channel::<SshChannelCommand>(256);
        let ssh_handle = Arc::new(tokio::sync::Mutex::new(Some(ssh)));
        let session = Arc::new(SshSession {
            descriptor: std::sync::Mutex::new(SshSessionDescriptor {
                status: "connected".to_string(),
                ..descriptor.clone()
            }),
            channel_tx,
            ssh_handle,
            active_forwards: Arc::new(RwLock::new(HashMap::<String, PortForwardHandle>::new())),
            remote_forward_map,
        });

        self.inner
            .sessions
            .write()
            .map_err(|_| anyhow!("ssh session registry poisoned"))?
            .insert(session_id.clone(), session.clone());

        self.emit_event(SshEventEnvelope {
            event_type: "state".to_string(),
            session_id: session_id.clone(),
            data: None,
            status: Some("connected".to_string()),
            message: Some("connected".to_string()),
            exit_code: None,
        });

        self.spawn_session_task(session_id.clone(), session, channel, channel_rx);
        Ok(SshSessionDescriptor {
            status: "connected".to_string(),
            ..descriptor
        })
    }

    pub fn disconnect(&self, session_id: &str) -> Result<()> {
        let session = self
            .remove_session_local(session_id)
            .ok_or_else(|| anyhow!("SSH session '{}' not found", session_id))?;

        let _ = session.channel_tx.try_send(SshChannelCommand::Close);
        let ssh_handle = session.ssh_handle.clone();
        let session_id = session_id.to_string();
        tokio::spawn(async move {
            if let Some(ssh) = ssh_handle.lock().await.take() {
                let _ = ssh.disconnect(Disconnect::ByApplication, "", "en-US").await;
            }
        });

        self.emit_event(SshEventEnvelope {
            event_type: "state".to_string(),
            session_id,
            data: None,
            status: Some("disconnecting".to_string()),
            message: Some("disconnect requested".to_string()),
            exit_code: None,
        });
        Ok(())
    }

    pub fn write(&self, session_id: &str, data: &str) -> Result<()> {
        let session = self.get_session(session_id)?;
        session
            .channel_tx
            .try_send(SshChannelCommand::Data(data.as_bytes().to_vec()))
            .map_err(|e| anyhow!("failed to queue SSH input for '{}': {}", session_id, e))
    }

    pub fn resize_session(&self, input: ResizeSshSessionInput) -> Result<()> {
        let session = self.get_session(&input.session_id)?;
        session
            .channel_tx
            .try_send(SshChannelCommand::Resize {
                rows: input.rows.max(1),
                cols: input.cols.max(1),
            })
            .map_err(|e| {
                anyhow!(
                    "failed to queue SSH resize for '{}': {}",
                    input.session_id,
                    e
                )
            })
    }

    pub(super) fn get_session(&self, session_id: &str) -> Result<Arc<SshSession>> {
        self.inner
            .sessions
            .read()
            .map_err(|_| anyhow!("ssh session registry poisoned"))?
            .get(session_id)
            .cloned()
            .ok_or_else(|| anyhow!("SSH session '{}' not found", session_id))
    }

    pub(super) fn next_session_id(&self) -> String {
        let next = self
            .inner
            .next_session_counter
            .fetch_add(1, Ordering::Relaxed);
        format!("ssh-{}", next)
    }

    pub(super) fn remove_session_local(&self, session_id: &str) -> Option<Arc<SshSession>> {
        self.inner
            .sessions
            .write()
            .ok()
            .and_then(|mut sessions| sessions.remove(session_id))
    }

    pub(super) fn emit_event(&self, _event: SshEventEnvelope) {
        #[cfg(feature = "napi")]
        {
            crate::event::emit_serialized_event(&self.inner.event_sink, &_event, "ssh");
        }
    }

    #[cfg(feature = "napi")]
    pub fn register_event_sink(&self, sink: super::EventSink) -> Result<()> {
        crate::event::register_event_sink(&self.inner.event_sink, sink, "ssh")
    }

    fn spawn_session_task(
        &self,
        session_id: String,
        session: Arc<SshSession>,
        channel: Channel<Msg>,
        channel_rx: tokio::sync::mpsc::Receiver<SshChannelCommand>,
    ) {
        let manager = self.clone();
        tokio::spawn(async move {
            if let Err(error) = manager
                .run_session_loop(session_id.clone(), session, channel, channel_rx)
                .await
            {
                manager.emit_event(SshEventEnvelope {
                    event_type: "error".to_string(),
                    session_id: session_id.clone(),
                    data: None,
                    status: Some("error".to_string()),
                    message: Some(format!("SSH session error: {}", error)),
                    exit_code: None,
                });
                manager.remove_session_local(&session_id);
            }
        });
    }

    async fn run_session_loop(
        &self,
        session_id: String,
        session: Arc<SshSession>,
        mut channel: Channel<Msg>,
        mut channel_rx: tokio::sync::mpsc::Receiver<SshChannelCommand>,
    ) -> Result<()> {
        let mut final_status = "disconnected".to_string();
        let mut exit_code = None;

        loop {
            tokio::select! {
                command = channel_rx.recv() => {
                    match command {
                        Some(SshChannelCommand::Data(data)) => {
                            let mut writer = channel.make_writer();
                            writer
                                .write_all(&data)
                                .await
                                .map_err(|e| anyhow!("failed to send SSH channel data: {}", e))?;
                            writer
                                .flush()
                                .await
                                .map_err(|e| anyhow!("failed to flush SSH channel data: {}", e))?;
                        }
                        Some(SshChannelCommand::Resize { rows, cols }) => {
                            channel
                                .window_change(cols.max(1), rows.max(1), 0, 0)
                                .await
                                .map_err(|e| anyhow!("failed to resize SSH PTY: {}", e))?;
                        }
                        Some(SshChannelCommand::Close) | None => {
                            let _ = channel.eof().await;
                            break;
                        }
                    }
                }
                message = channel.wait() => {
                    match message {
                        Some(ChannelMsg::Data { ref data }) => {
                            self.emit_event(SshEventEnvelope {
                                event_type: "data".to_string(),
                                session_id: session_id.clone(),
                                data: Some(String::from_utf8_lossy(data.as_ref()).into_owned()),
                                status: None,
                                message: None,
                                exit_code: None,
                            });
                        }
                        Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                            self.emit_event(SshEventEnvelope {
                                event_type: "data".to_string(),
                                session_id: session_id.clone(),
                                data: Some(String::from_utf8_lossy(data.as_ref()).into_owned()),
                                status: None,
                                message: None,
                                exit_code: None,
                            });
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            final_status = "exited".to_string();
                            exit_code = Some(exit_status);
                            break;
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        if let Ok(mut descriptor) = session.descriptor.lock() {
            descriptor.status = final_status.clone();
        }

        {
            let mut forwards = session
                .active_forwards
                .write()
                .map_err(|_| anyhow!("ssh forward registry poisoned"))?;
            forwards.clear();
        }
        if let Ok(mut remote_map) = session.remote_forward_map.write() {
            remote_map.clear();
        }

        if let Some(ssh) = session.ssh_handle.lock().await.take() {
            let _ = ssh.disconnect(Disconnect::ByApplication, "", "en-US").await;
        }
        self.remove_session_local(&session_id);

        self.emit_event(SshEventEnvelope {
            event_type: "state".to_string(),
            session_id,
            data: None,
            status: Some(final_status.clone()),
            message: Some(match exit_code {
                Some(code) => format!("remote shell exited with code {}", code),
                None => "SSH session closed".to_string(),
            }),
            exit_code,
        });

        Ok(())
    }

    async fn open_authenticated_handle(
        &self,
        profile: &SshProfile,
        password: Option<String>,
        key_path: Option<String>,
        certificate_path: Option<String>,
        key_passphrase: Option<String>,
        remote_forward_map: RemoteForwardMapping,
    ) -> Result<client::Handle<SshClientHandler>> {
        if profile
            .jump_host_json
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Err(anyhow!(
                "jump host connections are not implemented in the refactored SSH manager yet"
            ));
        }

        let addr = format!("{}:{}", profile.host, profile.port);
        let tcp = TcpStream::connect(&addr)
            .await
            .with_context(|| format!("failed to connect to {}", addr))?;
        let config = Arc::new(client::Config::default());
        let (handler, algorithm_ref, fingerprint_ref, server_key_bytes_ref) =
            SshClientHandler::new(remote_forward_map);
        let mut ssh =
            client::connect_stream(config, Box::new(tcp) as Box<dyn AsyncStream>, handler)
                .await
                .map_err(|e| anyhow!("SSH handshake failed: {}", e))?;

        let algorithm = algorithm_ref
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        let fingerprint = fingerprint_ref
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        let server_key_bytes = server_key_bytes_ref
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default();
        let host_ca_key_path = profile.host_ca_key_path.as_deref().map(str::trim);
        let ca_validation_requested =
            host_ca_key_path.is_some_and(|value| !value.is_empty());
        if ca_validation_requested {
            super::validate_host_certificate(
                &server_key_bytes,
                &profile.host,
                host_ca_key_path.unwrap_or_default(),
            )
            .map_err(|e| anyhow!("host CA validation failed: {}", e))?;
        } else {
            let host_status =
                self.verify_host_fingerprint(&profile.host, profile.port, &algorithm, &fingerprint)?;
            match host_status.status.as_str() {
                "trusted" => {}
                "unknown" => {
                    return Err(anyhow!(
                        "host_verification_required:{}:{}:{}:{}",
                        profile.host,
                        profile.port,
                        algorithm,
                        fingerprint
                    ));
                }
                "mismatch" => {
                    return Err(anyhow!(
                        "host_verification_mismatch:{}:{}:{}:{}",
                        profile.host,
                        profile.port,
                        algorithm,
                        fingerprint
                    ));
                }
                other => {
                    return Err(anyhow!("unexpected host verification status '{}'", other));
                }
            }
        }

        let authenticated = match profile.auth_type.as_str() {
            "privateKey" => {
                let private_key_path =
                    key_path.ok_or_else(|| anyhow!("private key path is not configured"))?;
                let key_pair = if let Some(ref passphrase) = key_passphrase {
                    load_secret_key(&private_key_path, Some(passphrase))
                        .map_err(|e| anyhow!("failed to load private key: {}", e))?
                } else {
                    load_secret_key(&private_key_path, None)
                        .map_err(|e| anyhow!("failed to load private key: {}", e))?
                };
                if let Some(certificate_path) = certificate_path {
                    let certificate = load_openssh_certificate(&certificate_path)
                        .map_err(|e| anyhow!("failed to load OpenSSH certificate: {}", e))?;
                    ssh.authenticate_openssh_cert(
                        &profile.username,
                        Arc::new(key_pair),
                        certificate,
                    )
                    .await
                    .map_err(|e| anyhow!("OpenSSH certificate authentication failed: {}", e))?
                } else {
                    let key = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None)
                        .map_err(|e| anyhow!("failed to wrap private key: {}", e))?;
                    ssh.authenticate_publickey(&profile.username, key)
                        .await
                        .map_err(|e| anyhow!("public key authentication failed: {}", e))?
                }
            }
            "agent" => {
                return Err(anyhow!(
                    "SSH agent authentication is not implemented in the refactored SSH manager yet"
                ));
            }
            _ => {
                let password =
                    password.ok_or_else(|| anyhow!("password not provided for SSH profile"))?;
                ssh.authenticate_password(&profile.username, &password)
                    .await
                    .map_err(|e| anyhow!("password authentication failed: {}", e))?
            }
        };

        if !authenticated {
            return Err(anyhow!("SSH authentication rejected by server"));
        }

        Ok(ssh)
    }
}

fn default_term() -> String {
    std::env::var("TERM").unwrap_or_else(|_| "xterm".to_string())
}
