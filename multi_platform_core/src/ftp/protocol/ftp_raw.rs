use anyhow::{anyhow, Context, Result};
use async_std::io::{Cursor as AsyncStdCursor, ReadExt as AsyncStdReadExt};
use async_std::net::TcpStream as AsyncStdTcpStream;
use russh::client;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;
use suppaftp::async_native_tls::TlsConnector;
use suppaftp::list::{File as FtpListFile, PosixPexQuery};
use suppaftp::types::{FileType, Response};
use suppaftp::{AsyncFtpStream, AsyncNativeTlsConnector, AsyncNativeTlsFtpStream, Status};

use super::super::*;

enum FtpControlConnection {
    Plain(AsyncFtpStream),
    Secure(AsyncNativeTlsFtpStream),
}

pub(in crate::ftp) struct FtpControlSession {
    connection: FtpControlConnection,
    tunnel_ssh: Option<Arc<tokio::sync::Mutex<Option<client::Handle<SshClientHandler>>>>>,
}

impl FtpControlSession {
    pub(in crate::ftp) async fn transfer_type_binary(&mut self) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.transfer_type(FileType::Binary).await,
            FtpControlConnection::Secure(client) => client.transfer_type(FileType::Binary).await,
        }
        .map_err(|e| anyhow!("failed to switch FTP transfer type to binary: {}", e))
    }

    pub(in crate::ftp) async fn cwd(&mut self, path: &str) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.cwd(path).await,
            FtpControlConnection::Secure(client) => client.cwd(path).await,
        }
        .map_err(|e| anyhow!("failed to change remote directory '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn pwd(&mut self) -> Result<String> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.pwd().await,
            FtpControlConnection::Secure(client) => client.pwd().await,
        }
        .map_err(|e| anyhow!("failed to query current remote directory: {}", e))
    }

    pub(in crate::ftp) async fn mkdir(&mut self, path: &str) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.mkdir(path).await,
            FtpControlConnection::Secure(client) => client.mkdir(path).await,
        }
        .map_err(|e| anyhow!("failed to create remote directory '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn rename(&mut self, from: &str, to: &str) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.rename(from, to).await,
            FtpControlConnection::Secure(client) => client.rename(from, to).await,
        }
        .map_err(|e| anyhow!("failed to rename remote path '{}': {}", from, e))
    }

    pub(in crate::ftp) async fn mlsd(&mut self, path: Option<&str>) -> Result<Vec<String>> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.mlsd(path).await,
            FtpControlConnection::Secure(client) => client.mlsd(path).await,
        }
        .map_err(|e| anyhow!("failed to read remote directory listing: {}", e))
    }

    pub(in crate::ftp) async fn list(&mut self, path: Option<&str>) -> Result<Vec<String>> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.list(path).await,
            FtpControlConnection::Secure(client) => client.list(path).await,
        }
        .map_err(|e| anyhow!("failed to read remote directory listing: {}", e))
    }

    pub(in crate::ftp) async fn mlst(&mut self, path: Option<&str>) -> Result<String> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.mlst(path).await,
            FtpControlConnection::Secure(client) => client.mlst(path).await,
        }
        .map_err(|e| anyhow!("failed to inspect remote path: {}", e))
    }

    pub(in crate::ftp) async fn size(&mut self, path: &str) -> Result<u64> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.size(path).await,
            FtpControlConnection::Secure(client) => client.size(path).await,
        }
        .map(|size| size as u64)
        .map_err(|e| anyhow!("failed to query remote file size '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn resume_transfer(&mut self, offset: u64) -> Result<()> {
        let offset = usize::try_from(offset)
            .map_err(|_| anyhow!("transfer offset {} exceeds FTP REST range", offset))?;
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.resume_transfer(offset).await,
            FtpControlConnection::Secure(client) => client.resume_transfer(offset).await,
        }
        .map_err(|e| anyhow!("failed to resume FTP transfer at {}: {}", offset, e))
    }

    pub(in crate::ftp) async fn rm(&mut self, path: &str) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.rm(path).await,
            FtpControlConnection::Secure(client) => client.rm(path).await,
        }
        .map_err(|e| anyhow!("failed to delete remote file '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn rmdir(&mut self, path: &str) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.rmdir(path).await,
            FtpControlConnection::Secure(client) => client.rmdir(path).await,
        }
        .map_err(|e| anyhow!("failed to delete remote directory '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn retr_bytes(&mut self, path: &str) -> Result<Vec<u8>> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => {
                let mut stream = client
                    .retr_as_stream(path)
                    .await
                    .map_err(|e| anyhow!("failed to open remote file '{}': {}", path, e))?;
                let mut buffer = Vec::new();
                stream
                    .read_to_end(&mut buffer)
                    .await
                    .map_err(|e| anyhow!("failed to read remote file '{}': {}", path, e))?;
                client.finalize_retr_stream(stream).await.map_err(|e| {
                    anyhow!("failed to finalize remote file read '{}': {}", path, e)
                })?;
                Ok(buffer)
            }
            FtpControlConnection::Secure(client) => {
                let mut stream = client
                    .retr_as_stream(path)
                    .await
                    .map_err(|e| anyhow!("failed to open remote file '{}': {}", path, e))?;
                let mut buffer = Vec::new();
                stream
                    .read_to_end(&mut buffer)
                    .await
                    .map_err(|e| anyhow!("failed to read remote file '{}': {}", path, e))?;
                client.finalize_retr_stream(stream).await.map_err(|e| {
                    anyhow!("failed to finalize remote file read '{}': {}", path, e)
                })?;
                Ok(buffer)
            }
        }
    }

    pub(in crate::ftp) async fn put_bytes(&mut self, path: &str, content: &[u8]) -> Result<u64> {
        let mut cursor = AsyncStdCursor::new(content.to_vec());
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.put_file(path, &mut cursor).await,
            FtpControlConnection::Secure(client) => client.put_file(path, &mut cursor).await,
        }
        .map_err(|e| anyhow!("failed to write remote file '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn retr_stream(&mut self, path: &str) -> Result<FtpDataReader> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client
                .retr_as_stream(path)
                .await
                .map(|stream| Box::new(stream) as FtpDataReader),
            FtpControlConnection::Secure(client) => client
                .retr_as_stream(path)
                .await
                .map(|stream| Box::new(stream) as FtpDataReader),
        }
        .map_err(|e| anyhow!("failed to open remote file '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn finalize_retr_stream(
        &mut self,
        stream: FtpDataReader,
        path: &str,
    ) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.finalize_retr_stream(stream).await,
            FtpControlConnection::Secure(client) => client.finalize_retr_stream(stream).await,
        }
        .map_err(|e| anyhow!("failed to finalize remote file read '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn put_stream(&mut self, path: &str) -> Result<FtpDataWriter> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client
                .put_with_stream(path)
                .await
                .map(|stream| Box::new(stream) as FtpDataWriter),
            FtpControlConnection::Secure(client) => client
                .put_with_stream(path)
                .await
                .map(|stream| Box::new(stream) as FtpDataWriter),
        }
        .map_err(|e| anyhow!("failed to open remote file '{}' for upload: {}", path, e))
    }

    pub(in crate::ftp) async fn finalize_put_stream(
        &mut self,
        stream: FtpDataWriter,
        path: &str,
    ) -> Result<()> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.finalize_put_stream(stream).await,
            FtpControlConnection::Secure(client) => client.finalize_put_stream(stream).await,
        }
        .map_err(|e| anyhow!("failed to finalize remote file write '{}': {}", path, e))
    }

    pub(in crate::ftp) async fn quit(self) {
        match self.connection {
            FtpControlConnection::Plain(mut client) => {
                let _ = client.quit().await;
            }
            FtpControlConnection::Secure(mut client) => {
                let _ = client.quit().await;
            }
        }
        if let Some(ssh) = self.tunnel_ssh {
            if let Some(ssh) = ssh.lock().await.take() {
                let _ = ssh
                    .disconnect(russh::Disconnect::ByApplication, "", "en-US")
                    .await;
            }
        }
    }

    pub(in crate::ftp) async fn custom_command(
        &mut self,
        command: &str,
        expected: &[Status],
    ) -> Result<Response> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.custom_command(command, expected).await,
            FtpControlConnection::Secure(client) => client.custom_command(command, expected).await,
        }
        .map_err(|e| anyhow!("FTP command '{}' failed: {}", command, e))
    }

    pub(in crate::ftp) async fn read_response_in(
        &mut self,
        expected: &[Status],
    ) -> Result<Response> {
        match &mut self.connection {
            FtpControlConnection::Plain(client) => client.read_response_in(expected).await,
            FtpControlConnection::Secure(client) => client.read_response_in(expected).await,
        }
        .map_err(|e| anyhow!("failed to read FTP response: {}", e))
    }

    pub(in crate::ftp) async fn enter_passive_addr(&mut self) -> Result<SocketAddr> {
        if let Ok(response) = self
            .custom_command("EPSV", &[Status::ExtendedPassiveMode])
            .await
        {
            return parse_epsv_passive_addr(self.control_peer_ip()?, response);
        }
        let response = self.custom_command("PASV", &[Status::PassiveMode]).await?;
        parse_pasv_addr(response)
    }

    pub(in crate::ftp) async fn set_active_target(&mut self, addr: SocketAddr) -> Result<()> {
        let command = match addr {
            SocketAddr::V4(addr_v4) => format!("PORT {}", encode_port_command(addr_v4)),
            SocketAddr::V6(_) => format!("EPRT {}", encode_eprt_command(addr)),
        };
        self.custom_command(&command, &[Status::CommandOk]).await?;
        Ok(())
    }

    fn control_peer_ip(&self) -> Result<IpAddr> {
        match &self.connection {
            FtpControlConnection::Plain(client) => client
                .get_ref()
                .peer_addr()
                .map(|addr| addr.ip())
                .map_err(|e| anyhow!("failed to inspect FTP peer address: {}", e)),
            FtpControlConnection::Secure(client) => client
                .get_ref()
                .peer_addr()
                .map(|addr| addr.ip())
                .map_err(|e| anyhow!("failed to inspect FTP peer address: {}", e)),
        }
    }
}

impl super::super::FtpManager {
    pub(in crate::ftp) async fn connect_ftp_control_session(
        &self,
        resolved: &ResolvedProfileData,
    ) -> Result<FtpControlSession> {
        if !matches!(resolved.protocol.as_str(), "ftp" | "ftps") {
            return Err(anyhow!(
                "protocol '{}' does not use an FTP control connection",
                resolved.protocol
            ));
        }
        if resolved.auth_type != "password" {
            return Err(anyhow!(
                "{} currently only supports password authentication",
                resolved.protocol.to_uppercase()
            ));
        }
        let password = resolved
            .password
            .clone()
            .ok_or_else(|| anyhow!("password not provided"))?;
        let user = resolved.username.clone();
        let tunnel_ssh = if let Some(tunnel) = resolved.ssh_tunnel.as_deref() {
            Some(Arc::new(tokio::sync::Mutex::new(Some(
                self.open_ssh_tunnel_handle(tunnel).await?,
            ))))
        } else {
            None
        };

        let builder = tunnel_ssh.as_ref().map(|ssh_handle| {
            let ssh_handle = ssh_handle.clone();
            move |addr: std::net::SocketAddr| -> Pin<
                Box<
                    dyn std::future::Future<Output = suppaftp::FtpResult<AsyncStdTcpStream>>
                        + Send
                        + Sync,
                >,
            > {
                let ssh_handle = ssh_handle.clone();
                Box::pin(async move {
                    Self::create_tunneled_tcp_stream(
                        ssh_handle,
                        addr.ip().to_string(),
                        u32::from(addr.port()),
                    )
                    .await
                    .map_err(|error| {
                        suppaftp::FtpError::ConnectionError(std::io::Error::other(
                            error.to_string(),
                        ))
                    })
                })
            }
        });

        if resolved.protocol == "ftps" {
            let base_stream = if let Some(ssh_handle) = tunnel_ssh.as_ref() {
                Self::create_tunneled_tcp_stream(
                    ssh_handle.clone(),
                    resolved.host.clone(),
                    resolved.port,
                )
                .await?
            } else {
                AsyncStdTcpStream::connect((resolved.host.as_str(), resolved.port as u16))
                    .await
                    .with_context(|| {
                        format!("failed to connect to {}:{}", resolved.host, resolved.port)
                    })?
            };
            let ftp = AsyncNativeTlsFtpStream::connect_with_stream(base_stream)
                .await
                .map_err(|e| anyhow!("failed to connect FTPS control stream: {}", e))?;
            let ftp = if let Some(builder) = builder {
                ftp.passive_stream_builder(builder)
            } else {
                ftp
            };
            let connector = AsyncNativeTlsConnector::from(TlsConnector::new());
            let mut ftp = ftp
                .into_secure(connector, &resolved.host)
                .await
                .map_err(|e| anyhow!("failed to establish FTPS session: {}", e))?;
            ftp.login(&user, &password)
                .await
                .map_err(|e| anyhow!("FTPS login failed: {}", e))?;
            Ok(FtpControlSession {
                connection: FtpControlConnection::Secure(ftp),
                tunnel_ssh,
            })
        } else {
            let base_stream = if let Some(ssh_handle) = tunnel_ssh.as_ref() {
                Self::create_tunneled_tcp_stream(
                    ssh_handle.clone(),
                    resolved.host.clone(),
                    resolved.port,
                )
                .await?
            } else {
                AsyncStdTcpStream::connect((resolved.host.as_str(), resolved.port as u16))
                    .await
                    .with_context(|| {
                        format!("failed to connect to {}:{}", resolved.host, resolved.port)
                    })?
            };
            let ftp = AsyncFtpStream::connect_with_stream(base_stream)
                .await
                .map_err(|e| anyhow!("failed to connect FTP control stream: {}", e))?;
            let mut ftp = if let Some(builder) = builder {
                ftp.passive_stream_builder(builder)
            } else {
                ftp
            };
            ftp.login(&user, &password)
                .await
                .map_err(|e| anyhow!("FTP login failed: {}", e))?;
            Ok(FtpControlSession {
                connection: FtpControlConnection::Plain(ftp),
                tunnel_ssh,
            })
        }
    }

    pub(in crate::ftp) async fn ensure_ftp_dir_recursive(
        &self,
        ftp: &mut FtpControlSession,
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
            if ftp.cwd(&current).await.is_err() {
                ftp.mkdir(&current).await?;
            }
        }
        Ok(())
    }

    pub(in crate::ftp) async fn ensure_ftp_dir_recursive_for_resolved(
        &self,
        resolved: &ResolvedProfileData,
        path: &str,
    ) -> Result<()> {
        let mut ftp = self.connect_ftp_control_session(resolved).await?;
        let result = self.ensure_ftp_dir_recursive(&mut ftp, path).await;
        ftp.quit().await;
        result
    }
}

pub(in crate::ftp) fn parse_ftp_listing_line(line: &str) -> Result<FtpListFile> {
    let trimmed = line.trim();
    FtpListFile::from_mlsx_line(trimmed)
        .or_else(|_| FtpListFile::try_from(trimmed))
        .map_err(|_| anyhow!("failed to parse FTP directory entry '{}'", trimmed))
}

pub(in crate::ftp) fn ftp_file_to_transfer_entry(
    base: &str,
    file: &FtpListFile,
) -> Option<FileTransferEntry> {
    let name = file.name().trim();
    if name.is_empty() || name == "." || name == ".." {
        return None;
    }
    Some(FileTransferEntry {
        name: name.to_string(),
        path: join_remote_path(base, name),
        is_dir: file.is_directory(),
        size: u64_to_i64(file.size() as u64),
        modified_at: Some(system_time_to_millis(file.modified())),
        permissions: ftp_permissions_to_string(file),
        owner: file.uid().map(|value| value.to_string()),
        source: "remote".to_string(),
    })
}

fn ftp_permissions_to_string(file: &FtpListFile) -> Option<String> {
    let owner = ftp_permission_triplet(file, PosixPexQuery::Owner);
    let group = ftp_permission_triplet(file, PosixPexQuery::Group);
    let others = ftp_permission_triplet(file, PosixPexQuery::Others);
    Some(format!("{:o}{:o}{:o}", owner, group, others))
}

fn ftp_permission_triplet(file: &FtpListFile, query: PosixPexQuery) -> u8 {
    (if file.can_read(query) { 4 } else { 0 })
        + (if file.can_write(query) { 2 } else { 0 })
        + (if file.can_execute(query) { 1 } else { 0 })
}

fn parse_epsv_passive_addr(peer_ip: IpAddr, response: Response) -> Result<SocketAddr> {
    let body = response
        .as_string()
        .map_err(|_| anyhow!("failed to parse EPSV response"))?;
    let start = body
        .find('(')
        .ok_or_else(|| anyhow!("malformed EPSV response: {}", body))?;
    let end = body[start + 1..]
        .find(')')
        .map(|index| start + 1 + index)
        .ok_or_else(|| anyhow!("malformed EPSV response: {}", body))?;
    let payload = &body[start + 1..end];
    let delimiter = payload
        .chars()
        .next()
        .ok_or_else(|| anyhow!("malformed EPSV response: {}", body))?;
    let parts = payload
        .split(delimiter)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let port = parts
        .last()
        .ok_or_else(|| anyhow!("failed to parse EPSV port from '{}'", body))?
        .parse::<u16>()
        .map_err(|e| anyhow!("invalid EPSV port in '{}': {}", body, e))?;
    Ok(SocketAddr::new(peer_ip, port))
}

fn parse_pasv_addr(response: Response) -> Result<SocketAddr> {
    let body = response
        .as_string()
        .map_err(|_| anyhow!("failed to parse PASV response"))?;
    let start = body
        .find('(')
        .ok_or_else(|| anyhow!("malformed PASV response: {}", body))?;
    let end = body[start + 1..]
        .find(')')
        .map(|index| start + 1 + index)
        .ok_or_else(|| anyhow!("malformed PASV response: {}", body))?;
    let numbers = body[start + 1..end]
        .split(',')
        .map(str::trim)
        .collect::<Vec<_>>();
    if numbers.len() != 6 {
        return Err(anyhow!("malformed PASV response: {}", body));
    }
    let ip = Ipv4Addr::new(
        parse_pasv_octet(numbers[0], &body)?,
        parse_pasv_octet(numbers[1], &body)?,
        parse_pasv_octet(numbers[2], &body)?,
        parse_pasv_octet(numbers[3], &body)?,
    );
    let msb = parse_pasv_octet(numbers[4], &body)? as u16;
    let lsb = parse_pasv_octet(numbers[5], &body)? as u16;
    Ok(SocketAddr::new(IpAddr::V4(ip), (msb << 8) | lsb))
}

fn parse_pasv_octet(value: &str, body: &str) -> Result<u8> {
    value
        .parse::<u8>()
        .map_err(|e| anyhow!("invalid PASV field in '{}': {}", body, e))
}

fn encode_port_command(addr: std::net::SocketAddrV4) -> String {
    let octets = addr.ip().octets();
    let port = addr.port();
    format!(
        "{},{},{},{},{},{}",
        octets[0],
        octets[1],
        octets[2],
        octets[3],
        port / 256,
        port % 256
    )
}

fn encode_eprt_command(addr: SocketAddr) -> String {
    match addr {
        SocketAddr::V4(addr_v4) => format!("|1|{}|{}|", addr_v4.ip(), addr_v4.port()),
        SocketAddr::V6(addr_v6) => format!("|2|{}|{}|", addr_v6.ip(), addr_v6.port()),
    }
}
