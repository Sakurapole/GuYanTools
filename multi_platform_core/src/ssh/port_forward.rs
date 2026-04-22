use anyhow::{anyhow, Result};
use russh::client;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use super::handler::SshClientHandler;
use super::models::*;
use super::SshSession;

// ============================================================
// Port forwarding internal types
// ============================================================

/// Per-forward traffic counter (shared between connection tasks).
pub(super) struct TrafficStats {
    pub(super) bytes_sent: AtomicU64,
    pub(super) bytes_received: AtomicU64,
}

/// Runtime handle for an active port forward.
pub(super) struct PortForwardHandle {
    pub(super) forward_id: String,
    pub(super) forward_type: String,
    pub(super) remote_host: Option<String>,
    pub(super) remote_port: Option<u32>,
    pub(super) stats: Arc<TrafficStats>,
    pub(super) active_connections: Arc<AtomicU32>,
    /// Background task(s) driving this forward. Dropping aborts them.
    #[allow(dead_code)]
    pub(super) tasks: Vec<JoinHandle<()>>,
}

impl super::SshConnectionManager {
    // ----------------------------------------------------------
    // Port forwarding engine
    // ----------------------------------------------------------

    /// Start a port forward on an active SSH session.
    pub async fn start_port_forward(&self, session_id: &str, forward_id: &str) -> Result<()> {
        let session = self.get_session(session_id)?;
        let forward = self.get_port_forward(forward_id)?;

        if !forward.enabled {
            return Err(anyhow!("port forward rule '{}' is disabled", forward_id));
        }

        // Check if already running
        {
            let forwards = session.active_forwards.read().unwrap();
            if forwards.contains_key(forward_id) {
                return Err(anyhow!("port forward '{}' is already running", forward_id));
            }
        }

        match forward.forward_type.as_str() {
            "local" => self.start_local_forward(&session, &forward).await?,
            "remote" => self.start_remote_forward(&session, &forward).await?,
            "dynamic" => self.start_dynamic_forward(&session, &forward).await?,
            other => return Err(anyhow!("unknown forward type: {}", other)),
        }

        Ok(())
    }

    /// Start a local port forward (-L style).
    async fn start_local_forward(
        &self,
        session: &Arc<SshSession>,
        forward: &SshPortForward,
    ) -> Result<()> {
        let local_host = forward.local_host.clone();
        let local_port = forward.local_port;
        let remote_host = forward
            .remote_host
            .clone()
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let remote_port = forward
            .remote_port
            .ok_or_else(|| anyhow!("remote_port required for local forward"))?;
        let forward_id = forward.id.clone();

        let listener = TcpListener::bind(format!("{}:{}", local_host, local_port))
            .await
            .map_err(|e| anyhow!("failed to bind {}:{}: {}", local_host, local_port, e))?;

        let stats = Arc::new(TrafficStats {
            bytes_sent: AtomicU64::new(0),
            bytes_received: AtomicU64::new(0),
        });
        let active_connections = Arc::new(AtomicU32::new(0));
        let ssh_handle = session.ssh_handle.clone();
        let task_remote_host = remote_host.clone();
        let task_stats = stats.clone();
        let task_active_connections = active_connections.clone();

        let handle = tokio::spawn(async move {
            loop {
                let client_stream = match listener.accept().await {
                    Ok((s, _)) => s,
                    Err(_) => break,
                };

                let channel = {
                    let handle_guard = ssh_handle.lock().await;
                    let Some(ssh_handle) = handle_guard.as_ref() else {
                        break;
                    };
                    match ssh_handle
                        .channel_open_direct_tcpip(
                            &task_remote_host,
                            remote_port as u32,
                            "127.0.0.1",
                            0,
                        )
                        .await
                    {
                        Ok(ch) => ch,
                        Err(_) => continue,
                    }
                };

                task_active_connections.fetch_add(1, Ordering::Relaxed);
                let stats = task_stats.clone();
                let active_connections = task_active_connections.clone();

                tokio::spawn(async move {
                    let _ = Self::run_forward_connection(client_stream, channel, &stats).await;
                    active_connections.fetch_sub(1, Ordering::Relaxed);
                });
            }
        });

        let fwd_handle = PortForwardHandle {
            forward_id: forward_id.clone(),
            forward_type: "local".to_string(),
            remote_host: Some(remote_host),
            remote_port: Some(remote_port),
            stats,
            active_connections,
            tasks: vec![handle],
        };

        session
            .active_forwards
            .write()
            .unwrap()
            .insert(forward_id, fwd_handle);

        Ok(())
    }

    /// Start a remote port forward (-R style).
    async fn start_remote_forward(
        &self,
        session: &Arc<SshSession>,
        forward: &SshPortForward,
    ) -> Result<()> {
        let remote_host = forward
            .remote_host
            .clone()
            .unwrap_or_else(|| "0.0.0.0".to_string());
        let remote_port = forward
            .remote_port
            .ok_or_else(|| anyhow!("remote_port required for remote forward"))?;
        let local_host = forward.local_host.clone();
        let local_port = forward.local_port;
        let forward_id = forward.id.clone();

        let ssh_handle = session.ssh_handle.clone();
        let mut handle_guard = ssh_handle.lock().await;
        let ssh = handle_guard
            .as_mut()
            .ok_or_else(|| anyhow!("SSH session not connected"))?;

        // Request the server to listen on the remote address/port
        let bound_port = ssh
            .tcpip_forward(&remote_host, remote_port as u32)
            .await
            .map_err(|e| {
                anyhow!(
                    "failed to request remote forward on {}:{}: {}",
                    remote_host,
                    remote_port,
                    e
                )
            })?;
        let bound_port = if bound_port == 0 {
            remote_port
        } else {
            bound_port
        };
        drop(handle_guard);

        // Register in the remote_forward_map so the handler can route incoming connections
        {
            let mut map = session.remote_forward_map.write().unwrap();
            map.insert(
                (remote_host.clone(), bound_port),
                (local_host.clone(), local_port, forward_id.clone()),
            );
        }

        let stats = Arc::new(TrafficStats {
            bytes_sent: AtomicU64::new(0),
            bytes_received: AtomicU64::new(0),
        });
        let active_connections = Arc::new(AtomicU32::new(1)); // the initial channel counts as active
        let stats_clone = stats.clone();

        let handle = tokio::spawn(async move {
            // Keep the forward registration alive until the handle is dropped.
            std::future::pending::<()>().await;
        });

        let fwd_handle = PortForwardHandle {
            forward_id: forward_id.clone(),
            forward_type: "remote".to_string(),
            remote_host: Some(remote_host.clone()),
            remote_port: Some(bound_port),
            stats: stats_clone,
            active_connections,
            tasks: vec![handle],
        };

        session
            .active_forwards
            .write()
            .unwrap()
            .insert(forward_id, fwd_handle);

        Ok(())
    }

    /// Start a dynamic (SOCKS5) port forward (-D style).
    async fn start_dynamic_forward(
        &self,
        session: &Arc<SshSession>,
        forward: &SshPortForward,
    ) -> Result<()> {
        let local_host = forward.local_host.clone();
        let local_port = forward.local_port;
        let forward_id = forward.id.clone();

        let listener = TcpListener::bind(format!("{}:{}", local_host, local_port))
            .await
            .map_err(|e| {
                anyhow!(
                    "failed to bind {}:{} for SOCKS5: {}",
                    local_host,
                    local_port,
                    e
                )
            })?;

        let stats = Arc::new(TrafficStats {
            bytes_sent: AtomicU64::new(0),
            bytes_received: AtomicU64::new(0),
        });
        let active_connections = Arc::new(AtomicU32::new(0));
        let ssh_handle = session.ssh_handle.clone();
        let task_stats = stats.clone();
        let task_active_connections = active_connections.clone();
        let task_ssh_handle = ssh_handle.clone();

        let handle = tokio::spawn(async move {
            loop {
                let client_stream = match listener.accept().await {
                    Ok((s, _)) => s,
                    Err(_) => break,
                };

                task_active_connections.fetch_add(1, Ordering::Relaxed);
                let stats = task_stats.clone();
                let active_connections_ref = task_active_connections.clone();
                let ssh_handle = task_ssh_handle.clone();

                tokio::spawn(async move {
                    let _ = Self::run_socks5_connection(client_stream, ssh_handle, &stats).await;
                    active_connections_ref.fetch_sub(1, Ordering::Relaxed);
                });
            }
        });

        let fwd_handle = PortForwardHandle {
            forward_id: forward_id.clone(),
            forward_type: "dynamic".to_string(),
            remote_host: None,
            remote_port: None,
            stats,
            active_connections,
            tasks: vec![handle],
        };

        session
            .active_forwards
            .write()
            .unwrap()
            .insert(forward_id, fwd_handle);

        Ok(())
    }

    /// Stop a running port forward.
    pub async fn stop_port_forward(&self, session_id: &str, forward_id: &str) -> Result<()> {
        let session = self.get_session(session_id)?;

        let fwd_handle = {
            let mut forwards = session.active_forwards.write().unwrap();
            forwards
                .remove(forward_id)
                .ok_or_else(|| anyhow!("port forward '{}' is not running", forward_id))?
        };

        // For remote forwards, clean up the mapping
        if fwd_handle.forward_type == "remote" {
            if let (Some(ref rh), Some(rp)) = (&fwd_handle.remote_host, fwd_handle.remote_port) {
                let mut map = session.remote_forward_map.write().unwrap();
                map.remove(&(rh.clone(), rp));
            }
            let ssh_handle = session.ssh_handle.clone();
            let remote_host = fwd_handle.remote_host.clone();
            let remote_port = fwd_handle.remote_port;
            tokio::spawn(async move {
                if let (Some(remote_host), Some(remote_port)) = (remote_host, remote_port) {
                    let handle_guard = ssh_handle.lock().await;
                    if let Some(ssh) = handle_guard.as_ref() {
                        let _ = ssh.cancel_tcpip_forward(remote_host, remote_port).await;
                    }
                }
            });
        }

        // Dropping PortForwardHandle drops JoinHandles which aborts the tasks
        drop(fwd_handle);

        Ok(())
    }

    /// Get runtime status of all active port forwards on a session.
    pub fn list_forward_status(&self, session_id: &str) -> Result<Vec<PortForwardStatus>> {
        let session = self.get_session(session_id)?;
        let forwards = session.active_forwards.read().unwrap();

        Ok(forwards
            .values()
            .map(|f| PortForwardStatus {
                forward_id: f.forward_id.clone(),
                session_id: session_id.to_string(),
                status: "running".to_string(),
                active_connections: f.active_connections.load(Ordering::Relaxed),
                error_message: None,
            })
            .collect())
    }

    /// Get real-time traffic statistics for all active port forwards on a session.
    pub fn get_forward_traffic(&self, session_id: &str) -> Result<Vec<PortForwardTrafficInfo>> {
        let session = self.get_session(session_id)?;
        let forwards = session.active_forwards.read().unwrap();

        Ok(forwards
            .values()
            .map(|f| PortForwardTrafficInfo {
                forward_id: f.forward_id.clone(),
                session_id: session_id.to_string(),
                bytes_sent: f.stats.bytes_sent.load(Ordering::Relaxed) as i64,
                bytes_received: f.stats.bytes_received.load(Ordering::Relaxed) as i64,
                active_connections: f.active_connections.load(Ordering::Relaxed),
            })
            .collect())
    }

    // ----------------------------------------------------------
    // Connection proxy helpers
    // ----------------------------------------------------------

    /// Proxy data between a local TCP stream and an SSH channel (local/dynamic forward).
    async fn run_forward_connection(
        mut local_stream: tokio::net::TcpStream,
        mut channel: russh::Channel<russh::client::Msg>,
        stats: &TrafficStats,
    ) -> Result<()> {
        let mut buf = vec![0u8; 65536];
        let mut stream_closed = false;

        loop {
            tokio::select! {
                r = local_stream.read(&mut buf), if !stream_closed => {
                    match r {
                        Ok(0) => {
                            stream_closed = true;
                            let _ = channel.eof().await;
                        }
                        Ok(n) => {
                            stats.bytes_sent.fetch_add(n as u64, Ordering::Relaxed);
                            if channel.data(&buf[..n]).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                msg = channel.wait() => {
                    match msg {
                        Some(russh::ChannelMsg::Data { ref data }) => {
                            stats.bytes_received.fetch_add(data.len() as u64, Ordering::Relaxed);
                            if local_stream.write_all(data).await.is_err() {
                                break;
                            }
                        }
                        Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(())
    }

    /// Handle a single SOCKS5 connection: negotiate target, open SSH channel, proxy.
    async fn run_socks5_connection(
        mut client_stream: tokio::net::TcpStream,
        ssh_handle: Arc<tokio::sync::Mutex<Option<client::Handle<SshClientHandler>>>>,
        stats: &TrafficStats,
    ) -> Result<()> {
        // SOCKS5 handshake
        let mut buf = [0u8; 2];
        tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut buf).await?;

        if buf[0] != 0x05 {
            return Err(anyhow!("not a SOCKS5 request"));
        }

        let nmethods = buf[1] as usize;
        let mut methods = vec![0u8; nmethods];
        tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut methods).await?;

        // Reply: no auth required
        client_stream.write_all(&[0x05, 0x00]).await?;

        // Read connect request
        let mut header = [0u8; 4];
        tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut header).await?;

        if header[0] != 0x05 || header[1] != 0x01 {
            return Err(anyhow!("unsupported SOCKS5 command"));
        }

        let target_host = match header[3] {
            0x01 => {
                // IPv4
                let mut addr = [0u8; 4];
                tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut addr).await?;
                std::net::Ipv4Addr::from(addr).to_string()
            }
            0x03 => {
                // Domain
                let mut len_buf = [0u8; 1];
                tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut len_buf).await?;
                let mut domain = vec![0u8; len_buf[0] as usize];
                tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut domain).await?;
                String::from_utf8(domain).map_err(|e| anyhow!("invalid domain: {}", e))?
            }
            0x04 => {
                // IPv6
                let mut addr = [0u8; 16];
                tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut addr).await?;
                std::net::Ipv6Addr::from(addr).to_string()
            }
            t => return Err(anyhow!("unsupported SOCKS5 address type: {}", t)),
        };

        let mut port_buf = [0u8; 2];
        tokio::io::AsyncReadExt::read_exact(&mut client_stream, &mut port_buf).await?;
        let target_port = u16::from_be_bytes(port_buf);

        // Open SSH channel to target
        let channel = {
            let handle_guard = ssh_handle.lock().await;
            let ssh = handle_guard
                .as_ref()
                .ok_or_else(|| anyhow!("SSH session not connected"))?;
            ssh.channel_open_direct_tcpip(&target_host, target_port as u32, "127.0.0.1", 0)
                .await
                .map_err(|e| {
                    anyhow!(
                        "SOCKS5: failed to open channel to {}:{}: {}",
                        target_host,
                        target_port,
                        e
                    )
                })?
        };

        // Send success reply
        let reply = [
            0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, // bound address (0.0.0.0)
            0, 0, // bound port (0)
        ];
        client_stream.write_all(&reply).await?;

        // Proxy data
        Self::run_forward_connection(client_stream, channel, stats).await
    }
}
