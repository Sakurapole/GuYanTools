use anyhow::{anyhow, Context, Result};
use async_std::net::TcpStream as AsyncStdTcpStream;
use russh::client::{self, KeyboardInteractiveAuthResponse};
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::{load_openssh_certificate, load_secret_key};
use russh_sftp::client::SftpSession;
use std::sync::{Arc, Mutex};
use tokio::net::TcpStream;
use uuid::Uuid;

use super::*;

impl super::FtpManager {
    pub fn list_sessions(&self) -> Result<Vec<FtpConnectionDescriptor>> {
        let sessions = self
            .inner
            .sessions
            .read()
            .map_err(|_| anyhow!("ftp sessions lock poisoned"))?;
        Ok(sessions
            .values()
            .filter_map(|session| session.descriptor.lock().ok().map(|value| value.clone()))
            .collect())
    }

    pub async fn connect(&self, input: ConnectFtpInput) -> Result<FtpConnectionDescriptor> {
        if let Some(auth_session_id) = input.auth_session_id.as_deref() {
            return self
                .continue_keyboard_interactive_connect(
                    auth_session_id,
                    input.challenge_responses.unwrap_or_default(),
                )
                .await;
        }

        let resolved = self.resolve_profile_data(&input.profile_id, input.password.as_deref())?;
        if resolved.protocol != "sftp" {
            return self.finalize_ftp_connection(resolved).await;
        }
        let stream = self
            .connect_target_stream(&resolved, input.password.as_deref())
            .await?;
        let config = Arc::new(client::Config::default());
        let (handler, algorithm_ref, fingerprint_ref, server_key_bytes_ref) =
            SshClientHandler::new();
        let mut ssh = client::connect_stream(config, stream, handler)
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
        self.ensure_server_identity(
            &resolved.host,
            resolved.port,
            &algorithm,
            &fingerprint,
            &server_key_bytes,
            resolved.host_ca_key_path.as_deref(),
        )?;

        let authenticated = match resolved.auth_type.as_str() {
            "keyboardInteractive" => {
                match ssh
                    .authenticate_keyboard_interactive_start(&resolved.username, None::<String>)
                    .await
                    .map_err(|e| anyhow!("keyboard-interactive authentication failed: {}", e))?
                {
                    KeyboardInteractiveAuthResponse::Success => true,
                    KeyboardInteractiveAuthResponse::Failure => false,
                    KeyboardInteractiveAuthResponse::InfoRequest {
                        name,
                        instructions,
                        prompts,
                    } => {
                        let challenge = self.store_keyboard_interactive_session(
                            resolved.clone(),
                            ssh,
                            name,
                            instructions,
                            prompts,
                        )?;
                        return Err(anyhow!(
                            "keyboard_interactive_required:{}",
                            serde_json::to_string(&challenge).map_err(|error| anyhow!(
                                "failed to serialize auth challenge: {}",
                                error
                            ))?
                        ));
                    }
                }
            }
            _ => self.authenticate_ssh_client(&mut ssh, &resolved).await?,
        };
        if !authenticated {
            return Err(anyhow!("SFTP authentication rejected by server"));
        }

        self.finalize_sftp_connection(resolved, ssh).await
    }

    pub async fn cancel_auth_challenge(&self, auth_session_id: &str) -> Result<()> {
        let pending = self
            .inner
            .pending_auth
            .lock()
            .map_err(|_| anyhow!("ftp pending auth lock poisoned"))?
            .remove(auth_session_id);
        if let Some(pending) = pending {
            if let Some(ssh) = pending.ssh.lock().await.take() {
                let _ = ssh
                    .disconnect(russh::Disconnect::ByApplication, "", "en-US")
                    .await;
            }
        }
        Ok(())
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let session = {
            let mut sessions = self
                .inner
                .sessions
                .write()
                .map_err(|_| anyhow!("ftp sessions lock poisoned"))?;
            sessions.remove(session_id)
        };

        if let Some(session) = session {
            if let Ok(mut descriptor) = session.descriptor.lock() {
                descriptor.status = "disconnected".to_string();
                self.emit_event(FtpEventEnvelope {
                    event_type: "sessionState".to_string(),
                    session: Some(descriptor.clone()),
                    task: None,
                    message: Some(format!(
                        "{} session disconnected",
                        descriptor.protocol.to_uppercase()
                    )),
                });
            }

            if let Some(sftp) = session.sftp.clone() {
                let _ = sftp.close().await;
            }
            if let Some(ssh) = session.ssh.lock().await.take() {
                let _ = ssh
                    .disconnect(russh::Disconnect::ByApplication, "", "en-US")
                    .await;
            }
        }

        Ok(())
    }

    async fn continue_keyboard_interactive_connect(
        &self,
        auth_session_id: &str,
        responses: Vec<String>,
    ) -> Result<FtpConnectionDescriptor> {
        let pending = self
            .inner
            .pending_auth
            .lock()
            .map_err(|_| anyhow!("ftp pending auth lock poisoned"))?
            .get(auth_session_id)
            .cloned()
            .ok_or_else(|| anyhow!("authentication session '{}' not found", auth_session_id))?;

        let mut ssh = pending.ssh.lock().await.take().ok_or_else(|| {
            anyhow!(
                "authentication session '{}' is not available",
                auth_session_id
            )
        })?;

        let response = ssh
            .authenticate_keyboard_interactive_respond(responses)
            .await
            .map_err(|e| anyhow!("keyboard-interactive authentication failed: {}", e))?;

        match response {
            KeyboardInteractiveAuthResponse::Success => {
                self.inner
                    .pending_auth
                    .lock()
                    .map_err(|_| anyhow!("ftp pending auth lock poisoned"))?
                    .remove(auth_session_id);
                self.finalize_sftp_connection(pending.resolved.clone(), ssh)
                    .await
            }
            KeyboardInteractiveAuthResponse::Failure => {
                self.inner
                    .pending_auth
                    .lock()
                    .map_err(|_| anyhow!("ftp pending auth lock poisoned"))?
                    .remove(auth_session_id);
                let _ = ssh
                    .disconnect(russh::Disconnect::ByApplication, "", "en-US")
                    .await;
                Err(anyhow!("SFTP authentication rejected by server"))
            }
            KeyboardInteractiveAuthResponse::InfoRequest {
                name,
                instructions,
                prompts,
            } => {
                *pending.ssh.lock().await = Some(ssh);
                let challenge = FtpAuthChallenge {
                    auth_session_id: auth_session_id.to_string(),
                    profile_id: pending.resolved.profile_id.clone(),
                    profile_label: pending.resolved.label.clone(),
                    username: pending.resolved.username.clone(),
                    name: (!name.trim().is_empty()).then_some(name),
                    instructions: (!instructions.trim().is_empty()).then_some(instructions),
                    prompts: prompts
                        .into_iter()
                        .map(|prompt| FtpAuthPrompt {
                            prompt: prompt.prompt,
                            echo: prompt.echo,
                        })
                        .collect(),
                };
                Err(anyhow!(
                    "keyboard_interactive_required:{}",
                    serde_json::to_string(&challenge).map_err(|error| anyhow!(
                        "failed to serialize auth challenge: {}",
                        error
                    ))?
                ))
            }
        }
    }

    fn store_keyboard_interactive_session(
        &self,
        resolved: ResolvedProfileData,
        ssh: client::Handle<SshClientHandler>,
        name: String,
        instructions: String,
        prompts: Vec<client::Prompt>,
    ) -> Result<FtpAuthChallenge> {
        let auth_session_id = Uuid::new_v4().to_string();
        let challenge = FtpAuthChallenge {
            auth_session_id: auth_session_id.clone(),
            profile_id: resolved.profile_id.clone(),
            profile_label: resolved.label.clone(),
            username: resolved.username.clone(),
            name: (!name.trim().is_empty()).then_some(name),
            instructions: (!instructions.trim().is_empty()).then_some(instructions),
            prompts: prompts
                .into_iter()
                .map(|prompt| FtpAuthPrompt {
                    prompt: prompt.prompt,
                    echo: prompt.echo,
                })
                .collect(),
        };
        self.inner
            .pending_auth
            .lock()
            .map_err(|_| anyhow!("ftp pending auth lock poisoned"))?
            .insert(
                auth_session_id,
                Arc::new(PendingAuthSession {
                    resolved,
                    ssh: tokio::sync::Mutex::new(Some(ssh)),
                }),
            );
        Ok(challenge)
    }

    async fn finalize_sftp_connection(
        &self,
        resolved: ResolvedProfileData,
        ssh: client::Handle<SshClientHandler>,
    ) -> Result<FtpConnectionDescriptor> {
        let channel = ssh
            .channel_open_session()
            .await
            .map_err(|e| anyhow!("failed to open SFTP channel: {}", e))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| anyhow!("failed to request SFTP subsystem: {}", e))?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| anyhow!("failed to initialize SFTP session: {}", e))?;

        let remote_root = sftp
            .canonicalize(resolved.default_remote_path.clone())
            .await
            .unwrap_or_else(|_| normalize_remote_path(&resolved.default_remote_path));
        let local_root = if resolved.default_local_path.trim().is_empty() {
            default_local_root()
        } else {
            resolved.default_local_path.clone()
        };

        let descriptor = FtpConnectionDescriptor {
            session_id: self.next_session_id(),
            profile_id: resolved.profile_id.clone(),
            profile_label: resolved.label.clone(),
            protocol: resolved.protocol.clone(),
            host: resolved.host.clone(),
            port: resolved.port,
            username: resolved.username.clone(),
            status: "connected".to_string(),
            remote_root,
            local_root,
        };
        let session = Arc::new(FtpRuntimeSession {
            descriptor: Mutex::new(descriptor.clone()),
            resolved,
            ssh: tokio::sync::Mutex::new(Some(ssh)),
            sftp: Some(Arc::new(sftp)),
        });
        self.inner
            .sessions
            .write()
            .map_err(|_| anyhow!("ftp sessions lock poisoned"))?
            .insert(descriptor.session_id.clone(), session);

        self.emit_event(FtpEventEnvelope {
            event_type: "sessionState".to_string(),
            session: Some(descriptor.clone()),
            task: None,
            message: Some("SFTP session connected".to_string()),
        });

        Ok(descriptor)
    }

    async fn finalize_ftp_connection(
        &self,
        resolved: ResolvedProfileData,
    ) -> Result<FtpConnectionDescriptor> {
        let mut ftp = self.connect_ftp_control_session(&resolved).await?;
        if !resolved.default_remote_path.trim().is_empty()
            && resolved.default_remote_path.trim() != "/"
        {
            ftp.cwd(&resolved.default_remote_path).await?;
        }
        let remote_root = ftp
            .pwd()
            .await
            .unwrap_or_else(|_| normalize_remote_path(&resolved.default_remote_path));
        ftp.quit().await;

        let local_root = if resolved.default_local_path.trim().is_empty() {
            default_local_root()
        } else {
            resolved.default_local_path.clone()
        };
        let descriptor = FtpConnectionDescriptor {
            session_id: self.next_session_id(),
            profile_id: resolved.profile_id.clone(),
            profile_label: resolved.label.clone(),
            protocol: resolved.protocol.clone(),
            host: resolved.host.clone(),
            port: resolved.port,
            username: resolved.username.clone(),
            status: "connected".to_string(),
            remote_root,
            local_root,
        };
        let session = Arc::new(FtpRuntimeSession {
            descriptor: Mutex::new(descriptor.clone()),
            resolved,
            ssh: tokio::sync::Mutex::new(None),
            sftp: None,
        });
        self.inner
            .sessions
            .write()
            .map_err(|_| anyhow!("ftp sessions lock poisoned"))?
            .insert(descriptor.session_id.clone(), session);

        self.emit_event(FtpEventEnvelope {
            event_type: "sessionState".to_string(),
            session: Some(descriptor.clone()),
            task: None,
            message: Some(format!(
                "{} session connected",
                descriptor.protocol.to_uppercase()
            )),
        });

        Ok(descriptor)
    }

    pub(in crate::ftp) async fn open_ssh_tunnel_handle(
        &self,
        tunnel: &ResolvedProfileData,
    ) -> Result<client::Handle<SshClientHandler>> {
        let stream = self.connect_target_stream(tunnel, None).await?;
        let config = Arc::new(client::Config::default());
        let (handler, algorithm_ref, fingerprint_ref, server_key_bytes_ref) =
            SshClientHandler::new();
        let mut ssh = client::connect_stream(config, stream, handler)
            .await
            .map_err(|e| anyhow!("SSH tunnel handshake failed: {}", e))?;

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
        self.ensure_server_identity(
            &tunnel.host,
            tunnel.port,
            &algorithm,
            &fingerprint,
            &server_key_bytes,
            tunnel.host_ca_key_path.as_deref(),
        )?;

        let authenticated = self.authenticate_ssh_client(&mut ssh, tunnel).await?;
        if !authenticated {
            return Err(anyhow!("SSH tunnel authentication rejected by server"));
        }
        Ok(ssh)
    }

    pub(in crate::ftp) async fn create_tunneled_tcp_stream(
        ssh_handle: Arc<tokio::sync::Mutex<Option<client::Handle<SshClientHandler>>>>,
        remote_host: String,
        remote_port: u32,
    ) -> Result<AsyncStdTcpStream> {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|e| anyhow!("failed to allocate local tunnel listener: {}", e))?;
        let local_addr = listener
            .local_addr()
            .map_err(|e| anyhow!("failed to inspect local tunnel listener: {}", e))?;
        tokio::spawn(async move {
            match listener.accept().await {
                Ok((local_stream, _)) => {
                    let _ = Self::proxy_ssh_tunnel_connection(
                        ssh_handle,
                        local_stream,
                        remote_host,
                        remote_port,
                    )
                    .await;
                }
                Err(error) => {
                    eprintln!("[ftp] failed to accept tunneled FTP connection: {}", error);
                }
            }
        });

        AsyncStdTcpStream::connect(local_addr).await.map_err(|e| {
            anyhow!(
                "failed to connect local tunnel endpoint {}: {}",
                local_addr,
                e
            )
        })
    }

    async fn proxy_ssh_tunnel_connection(
        ssh_handle: Arc<tokio::sync::Mutex<Option<client::Handle<SshClientHandler>>>>,
        mut local_stream: tokio::net::TcpStream,
        remote_host: String,
        remote_port: u32,
    ) -> Result<()> {
        let handle_guard = ssh_handle.lock().await;
        let ssh = handle_guard
            .as_ref()
            .ok_or_else(|| anyhow!("SSH tunnel handle not available"))?;
        let channel = ssh
            .channel_open_direct_tcpip(remote_host, remote_port, "127.0.0.1".to_string(), 0)
            .await
            .map_err(|e| anyhow!("failed to open SSH tunnel channel: {}", e))?;
        drop(handle_guard);

        let mut remote_stream = channel.into_stream();
        tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream)
            .await
            .map_err(|e| anyhow!("SSH tunnel proxy stream failed: {}", e))?;
        Ok(())
    }

    async fn connect_target_stream(
        &self,
        resolved: &ResolvedProfileData,
        password_override: Option<&str>,
    ) -> Result<Box<dyn AsyncStream>> {
        if let Some(jump_host_json) = resolved
            .jump_host_json
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            return self
                .connect_via_jump_host(resolved, jump_host_json, password_override)
                .await;
        }

        let addr = format!("{}:{}", resolved.host, resolved.port);
        let tcp = TcpStream::connect(&addr)
            .await
            .with_context(|| format!("failed to connect to {}", addr))?;
        Ok(Box::new(tcp))
    }

    async fn connect_via_jump_host(
        &self,
        target: &ResolvedProfileData,
        jump_host_json: &str,
        password_override: Option<&str>,
    ) -> Result<Box<dyn AsyncStream>> {
        let jump_config: SshJumpHostConfig = serde_json::from_str(jump_host_json)
            .map_err(|e| anyhow!("invalid jump host configuration: {}", e))?;
        let jump_resolved =
            self.resolve_jump_host_profile_data(target, &jump_config, password_override)?;
        if jump_resolved
            .jump_host_json
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            return Err(anyhow!(
                "nested jump host chains are not supported in the current phase"
            ));
        }

        let jump_addr = format!("{}:{}", jump_resolved.host, jump_resolved.port);
        let tcp = TcpStream::connect(&jump_addr)
            .await
            .with_context(|| format!("failed to connect to jump host {}", jump_addr))?;

        let config = Arc::new(client::Config::default());
        let (handler, algorithm_ref, fingerprint_ref, server_key_bytes_ref) =
            SshClientHandler::new();
        let mut jump_ssh = client::connect_stream(config, tcp, handler)
            .await
            .map_err(|e| anyhow!("jump host SSH handshake failed: {}", e))?;

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
        self.ensure_server_identity(
            &jump_resolved.host,
            jump_resolved.port,
            &algorithm,
            &fingerprint,
            &server_key_bytes,
            jump_resolved.host_ca_key_path.as_deref(),
        )?;

        let authenticated = self
            .authenticate_ssh_client(&mut jump_ssh, &jump_resolved)
            .await?;
        if !authenticated {
            return Err(anyhow!("jump host authentication rejected by server"));
        }

        let channel = jump_ssh
            .channel_open_direct_tcpip(
                target.host.clone(),
                target.port,
                jump_config.host,
                jump_config.port,
            )
            .await
            .map_err(|e| anyhow!("failed to open jump host tunnel: {}", e))?;

        Ok(Box::new(channel.into_stream()))
    }

    fn resolve_jump_host_profile_data(
        &self,
        target: &ResolvedProfileData,
        jump_config: &SshJumpHostConfig,
        password_override: Option<&str>,
    ) -> Result<ResolvedProfileData> {
        if let Some(jump_profile_id) = jump_config
            .profile_id
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            return self.resolve_ssh_profile_data(jump_profile_id, password_override);
        }

        Ok(ResolvedProfileData {
            profile_id: format!("{}::jump-host", target.profile_id),
            label: format!("SSH Jump Host · {}", jump_config.host),
            protocol: "sftp".to_string(),
            host: jump_config.host.clone(),
            port: jump_config.port,
            username: jump_config.username.clone(),
            auth_type: jump_config.auth_type.clone(),
            password: if jump_config.auth_type == "password" {
                password_override
                    .map(|value| value.to_string())
                    .or_else(|| target.password.clone())
            } else {
                None
            },
            private_key_path: if jump_config.auth_type == "privateKey" {
                target.private_key_path.clone()
            } else {
                None
            },
            certificate_path: if jump_config.auth_type == "privateKey" {
                target.certificate_path.clone()
            } else {
                None
            },
            host_ca_key_path: jump_config.host_ca_key_path.clone(),
            private_key_passphrase: if jump_config.auth_type == "privateKey" {
                target.private_key_passphrase.clone()
            } else {
                None
            },
            default_remote_path: "/".to_string(),
            default_local_path: default_local_root(),
            jump_host_json: None,
            ssh_tunnel: None,
        })
    }

    async fn authenticate_ssh_client(
        &self,
        ssh: &mut client::Handle<SshClientHandler>,
        resolved: &ResolvedProfileData,
    ) -> Result<bool> {
        match resolved.auth_type.as_str() {
            "privateKey" => {
                let private_key_path = resolved
                    .private_key_path
                    .clone()
                    .ok_or_else(|| anyhow!("private key path is not configured"))?;
                let key_pair = if let Some(ref passphrase) = resolved.private_key_passphrase {
                    load_secret_key(&private_key_path, Some(passphrase))
                        .map_err(|e| anyhow!("failed to load private key: {}", e))?
                } else {
                    load_secret_key(&private_key_path, None)
                        .map_err(|e| anyhow!("failed to load private key: {}", e))?
                };
                if let Some(certificate_path) = resolved.certificate_path.as_deref() {
                    let certificate = load_openssh_certificate(certificate_path)
                        .map_err(|e| anyhow!("failed to load OpenSSH certificate: {}", e))?;
                    ssh.authenticate_openssh_cert(
                        &resolved.username,
                        Arc::new(key_pair),
                        certificate,
                    )
                    .await
                    .map_err(|e| anyhow!("OpenSSH certificate authentication failed: {}", e))
                } else {
                    let key = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None)
                        .map_err(|e| anyhow!("failed to wrap private key: {}", e))?;
                    ssh.authenticate_publickey(&resolved.username, key)
                        .await
                        .map_err(|e| anyhow!("public key authentication failed: {}", e))
                }
            }
            "keyboardInteractive" => Err(anyhow!(
                "keyboard-interactive authentication is only supported for direct SFTP targets in the current phase"
            )),
            "agent" => Err(anyhow!(
                "SSH agent authentication is not implemented for FTP/SFTP connections in the current phase"
            )),
            _ => {
                let password = resolved
                    .password
                    .clone()
                    .ok_or_else(|| anyhow!("password not provided"))?;
                ssh.authenticate_password(&resolved.username, &password)
                    .await
                    .map_err(|e| anyhow!("password authentication failed: {}", e))
            }
        }
    }

    fn resolve_profile_data(
        &self,
        profile_id: &str,
        password_override: Option<&str>,
    ) -> Result<ResolvedProfileData> {
        let profile = self.get_profile(profile_id)?;
        if profile.protocol == "sftp" {
            if let Some(ssh_profile_id) = profile.ssh_profile_id.as_deref() {
                let ssh_profile = self.load_ssh_profile(ssh_profile_id)?;
                let auth_type = ssh_profile.auth_type.clone();
                let password = if auth_type == "password" {
                    password_override
                        .map(|value| value.to_string())
                        .or_else(|| {
                            if ssh_profile.save_password {
                                self.load_credential_from_table(
                                    "ssh_credentials",
                                    "profile_id",
                                    ssh_profile_id,
                                    "password",
                                )
                                .ok()
                                .flatten()
                            } else {
                                None
                            }
                        })
                } else {
                    None
                };
                let private_key_path = if auth_type == "privateKey" {
                    ssh_profile.private_key_path.clone()
                } else {
                    None
                };
                let certificate_path = if auth_type == "privateKey" {
                    ssh_profile.certificate_path.clone()
                } else {
                    None
                };
                let private_key_passphrase =
                    if auth_type == "privateKey" && ssh_profile.save_password {
                        self.load_credential_from_table(
                            "ssh_credentials",
                            "profile_id",
                            ssh_profile_id,
                            "privateKeyPassphrase",
                        )?
                    } else {
                        None
                    };

                return Ok(ResolvedProfileData {
                    profile_id: profile.id,
                    label: profile.label,
                    protocol: profile.protocol,
                    host: ssh_profile.host,
                    port: ssh_profile.port,
                    username: ssh_profile.username,
                    auth_type,
                    password,
                    private_key_path,
                    certificate_path,
                    host_ca_key_path: ssh_profile.host_ca_key_path,
                    private_key_passphrase,
                    default_remote_path: profile.default_remote_path,
                    default_local_path: profile.default_local_path,
                    jump_host_json: ssh_profile.jump_host_json,
                    ssh_tunnel: None,
                });
            }
        }

        if profile.protocol == "ftp" || profile.protocol == "ftps" {
            let tunnel = if let Some(ssh_profile_id) = profile.ssh_profile_id.as_deref() {
                Some(Box::new(
                    self.resolve_ssh_tunnel_profile_data(ssh_profile_id)?,
                ))
            } else {
                None
            };

            let password = if profile.auth_type == "password" {
                password_override
                    .map(|value| value.to_string())
                    .or_else(|| {
                        if profile.save_password {
                            self.load_credential_from_table(
                                "ftp_credentials",
                                "session_id",
                                &profile.id,
                                "password",
                            )
                            .ok()
                            .flatten()
                        } else {
                            None
                        }
                    })
            } else {
                None
            };

            return Ok(ResolvedProfileData {
                profile_id: profile.id,
                label: profile.label,
                protocol: profile.protocol,
                host: profile.host,
                port: profile.port,
                username: profile.username,
                auth_type: profile.auth_type,
                password,
                private_key_path: None,
                certificate_path: None,
                host_ca_key_path: None,
                private_key_passphrase: None,
                default_remote_path: profile.default_remote_path,
                default_local_path: profile.default_local_path,
                jump_host_json: None,
                ssh_tunnel: tunnel,
            });
        }

        let password = if profile.auth_type == "password" {
            password_override
                .map(|value| value.to_string())
                .or_else(|| {
                    if profile.save_password {
                        self.load_credential_from_table(
                            "ftp_credentials",
                            "session_id",
                            &profile.id,
                            "password",
                        )
                        .ok()
                        .flatten()
                    } else {
                        None
                    }
                })
        } else {
            None
        };
        let private_key_path = if profile.auth_type == "privateKey" {
            self.load_private_key_path("ftp_credentials", "session_id", &profile.id)?
        } else {
            None
        };
        let certificate_path = if profile.auth_type == "privateKey" {
            self.load_certificate_path("ftp_credentials", "session_id", &profile.id)?
        } else {
            None
        };
        let private_key_passphrase = if profile.auth_type == "privateKey" && profile.save_password {
            self.load_credential_from_table(
                "ftp_credentials",
                "session_id",
                &profile.id,
                "privateKeyPassphrase",
            )?
        } else {
            None
        };

        Ok(ResolvedProfileData {
            profile_id: profile.id,
            label: profile.label,
            protocol: profile.protocol,
            host: profile.host,
            port: profile.port,
            username: profile.username,
            auth_type: profile.auth_type,
            password,
            private_key_path,
            certificate_path,
            host_ca_key_path: profile.host_ca_key_path,
            private_key_passphrase,
            default_remote_path: profile.default_remote_path,
            default_local_path: profile.default_local_path,
            jump_host_json: None,
            ssh_tunnel: None,
        })
    }

    fn resolve_ssh_profile_data(
        &self,
        profile_id: &str,
        password_override: Option<&str>,
    ) -> Result<ResolvedProfileData> {
        let ssh_profile = self.load_ssh_profile(profile_id)?;
        let auth_type = ssh_profile.auth_type.clone();
        let password = if auth_type == "password" {
            password_override
                .map(|value| value.to_string())
                .or_else(|| {
                    if ssh_profile.save_password {
                        self.load_credential_from_table(
                            "ssh_credentials",
                            "profile_id",
                            profile_id,
                            "password",
                        )
                        .ok()
                        .flatten()
                    } else {
                        None
                    }
                })
        } else {
            None
        };
        let private_key_path = if auth_type == "privateKey" {
            ssh_profile.private_key_path.clone()
        } else {
            None
        };
        let certificate_path = if auth_type == "privateKey" {
            ssh_profile.certificate_path.clone()
        } else {
            None
        };
        let private_key_passphrase = if auth_type == "privateKey" && ssh_profile.save_password {
            self.load_credential_from_table(
                "ssh_credentials",
                "profile_id",
                profile_id,
                "privateKeyPassphrase",
            )?
        } else {
            None
        };

        Ok(ResolvedProfileData {
            profile_id: profile_id.to_string(),
            label: format!("SSH Jump Host · {}", ssh_profile.host),
            protocol: "sftp".to_string(),
            host: ssh_profile.host,
            port: ssh_profile.port,
            username: ssh_profile.username,
            auth_type,
            password,
            private_key_path,
            certificate_path,
            host_ca_key_path: ssh_profile.host_ca_key_path,
            private_key_passphrase,
            default_remote_path: "/".to_string(),
            default_local_path: default_local_root(),
            jump_host_json: ssh_profile.jump_host_json,
            ssh_tunnel: None,
        })
    }

    fn resolve_ssh_tunnel_profile_data(&self, profile_id: &str) -> Result<ResolvedProfileData> {
        let ssh_profile = self.load_ssh_profile(profile_id)?;
        let auth_type = ssh_profile.auth_type.clone();
        let password = if auth_type == "password" {
            if !ssh_profile.save_password {
                return Err(anyhow!(
                    "SSH tunnel profile '{}' requires a saved password; interactive tunnel password prompt is not implemented",
                    profile_id
                ));
            }
            self.load_credential_from_table(
                "ssh_credentials",
                "profile_id",
                profile_id,
                "password",
            )?
        } else {
            None
        };
        let private_key_path = if auth_type == "privateKey" {
            ssh_profile.private_key_path.clone()
        } else {
            None
        };
        let certificate_path = if auth_type == "privateKey" {
            ssh_profile.certificate_path.clone()
        } else {
            None
        };
        let private_key_passphrase = if auth_type == "privateKey" && ssh_profile.save_password {
            self.load_credential_from_table(
                "ssh_credentials",
                "profile_id",
                profile_id,
                "privateKeyPassphrase",
            )?
        } else {
            None
        };

        Ok(ResolvedProfileData {
            profile_id: profile_id.to_string(),
            label: format!("SSH Tunnel · {}", ssh_profile.host),
            protocol: "sshTunnel".to_string(),
            host: ssh_profile.host,
            port: ssh_profile.port,
            username: ssh_profile.username,
            auth_type,
            password,
            private_key_path,
            certificate_path,
            host_ca_key_path: ssh_profile.host_ca_key_path,
            private_key_passphrase,
            default_remote_path: "/".to_string(),
            default_local_path: default_local_root(),
            jump_host_json: ssh_profile.jump_host_json,
            ssh_tunnel: None,
        })
    }

    fn load_ssh_profile(&self, profile_id: &str) -> Result<SshProfileRecord> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT p.host, p.port, p.username, p.auth_type, p.save_password,
                            c.private_key_path, c.certificate_path, p.host_ca_key_path, p.jump_host_json
                     FROM ssh_profiles p
                     LEFT JOIN ssh_credentials c ON c.profile_id = p.id
                     WHERE p.id = ?1",
                    rusqlite::params![profile_id],
                    |row| {
                        Ok(SshProfileRecord {
                            host: row.get(0)?,
                            port: row.get::<_, i64>(1)? as u32,
                            username: row.get(2)?,
                            auth_type: row.get(3)?,
                            save_password: row.get::<_, i64>(4)? != 0,
                            private_key_path: row.get(5)?,
                            certificate_path: row.get(6)?,
                            host_ca_key_path: row.get(7)?,
                            jump_host_json: row.get(8)?,
                        })
                    },
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn ensure_server_identity(
        &self,
        host: &str,
        port: u32,
        algorithm: &str,
        fingerprint: &str,
        server_key_bytes: &[u8],
        host_ca_key_path: Option<&str>,
    ) -> Result<()> {
        if let Some(path) = host_ca_key_path
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            crate::ssh::validate_host_certificate(server_key_bytes, host, path)
                .map_err(|e| anyhow!("host CA validation failed: {}", e))?;
            return Ok(());
        }

        let stored = self
            .inner
            .db
            .with_connection(|conn| {
                use rusqlite::OptionalExtension;

                conn.query_row(
                    "SELECT fingerprint FROM ssh_known_hosts WHERE host = ?1 AND port = ?2 AND algorithm = ?3",
                    rusqlite::params![host, port as i64, algorithm],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))?;

        match stored {
            Some(value) if value == fingerprint => Ok(()),
            Some(value) => {
                let payload = serde_json::to_string(&HostVerificationPayload {
                    status: "mismatch".to_string(),
                    host: host.to_string(),
                    port,
                    algorithm: algorithm.to_string(),
                    fingerprint: fingerprint.to_string(),
                    stored_fingerprint: Some(value),
                })?;
                Err(anyhow!("host_verification_required: {}", payload))
            }
            None => {
                let payload = serde_json::to_string(&HostVerificationPayload {
                    status: "unknown".to_string(),
                    host: host.to_string(),
                    port,
                    algorithm: algorithm.to_string(),
                    fingerprint: fingerprint.to_string(),
                    stored_fingerprint: None,
                })?;
                Err(anyhow!("host_verification_required: {}", payload))
            }
        }
    }
}
