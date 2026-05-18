use anyhow::{anyhow, Result};
use async_trait::async_trait;
use russh::client::{Handler, Msg, Session};
use russh::{Channel, ChannelMsg};
use russh_keys::PublicKey;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::RemoteForwardMapping;

/// Russh client handler.
/// Host key verification is delegated to SshConnectionManager before connecting.
/// Also handles remote port forwarding callbacks from the server.
pub(super) struct SshClientHandler {
    pub(super) server_key_algorithm: Arc<Mutex<String>>,
    pub(super) server_key_fingerprint: Arc<Mutex<String>>,
    pub(super) server_key_bytes: Arc<Mutex<Vec<u8>>>,
    /// Shared remote forward map: (remote_host, remote_port) -> (local_host, local_port, fwd_id)
    pub(super) remote_forward_map: RemoteForwardMapping,
}

impl SshClientHandler {
    pub(super) fn new(
        remote_forward_map: RemoteForwardMapping,
    ) -> (
        Self,
        Arc<Mutex<String>>,
        Arc<Mutex<String>>,
        Arc<Mutex<Vec<u8>>>,
    ) {
        let alg = Arc::new(Mutex::new(String::new()));
        let fp = Arc::new(Mutex::new(String::new()));
        let raw = Arc::new(Mutex::new(Vec::new()));
        (
            Self {
                server_key_algorithm: alg.clone(),
                server_key_fingerprint: fp.clone(),
                server_key_bytes: raw.clone(),
                remote_forward_map,
            },
            alg,
            fp,
            raw,
        )
    }

    /// Proxy a single remote forward connection: server channel <-> local TCP stream.
    pub(super) async fn run_remote_forward_connection(
        mut channel: Channel<Msg>,
        local_host: &str,
        local_port: u32,
    ) -> Result<()> {
        let addr = format!("{}:{}", local_host, local_port);
        let mut local_stream = tokio::net::TcpStream::connect(&addr)
            .await
            .map_err(|e| anyhow!("failed to connect to local target {}: {}", addr, e))?;

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
                            if channel.data(&buf[..n]).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { ref data }) => {
                            if local_stream.write_all(data).await.is_err() {
                                break;
                            }
                        }
                        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key_ext(
        &mut self,
        server_public_key: &PublicKey,
        server_key_bytes: &[u8],
    ) -> Result<bool, Self::Error> {
        // Record key info so the manager can verify before authentication
        let alg = server_public_key.algorithm().to_string();
        let fp = server_public_key
            .fingerprint(russh::keys::HashAlg::Sha256)
            .to_string();
        *self.server_key_algorithm.lock().unwrap() = alg;
        *self.server_key_fingerprint.lock().unwrap() = fp;
        *self.server_key_bytes.lock().unwrap() = server_key_bytes.to_vec();
        // Always accept at handler level; actual trust check is done in manager
        Ok(true)
    }

    /// Called when the SSH server opens a forwarded-tcpip channel
    /// because a remote client connected to the remotely-bound port.
    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        let key = (connected_address.to_string(), connected_port);
        let local_target = {
            let map = self.remote_forward_map.read().unwrap();
            map.get(&key).cloned()
        };

        match local_target {
            Some((local_host, local_port, _fwd_id)) => {
                let conn_addr = connected_address.to_string();
                let conn_port = connected_port;
                tokio::spawn(async move {
                    if let Err(e) =
                        Self::run_remote_forward_connection(channel, &local_host, local_port).await
                    {
                        eprintln!(
                            "[ssh] remote forward connection error ({}:{} -> {}:{}): {}",
                            conn_addr, conn_port, local_host, local_port, e
                        );
                    }
                });
            }
            None => {
                eprintln!(
                    "[ssh] received forwarded-tcpip for {}:{} but no mapping found, ignoring",
                    connected_address, connected_port
                );
            }
        }

        Ok(())
    }
}
