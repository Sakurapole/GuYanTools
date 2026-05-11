use crate::models::{
    MultiDeviceClipboardDiscoveredDevice, MultiDeviceClipboardDiscoveryConfig,
    MultiDeviceClipboardEvent,
};
use anyhow::{anyhow, Result};
use mdns_sd::{ResolvedService, ScopedIp, ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const MULTI_DEVICE_CLIPBOARD_SERVICE_TYPE: &str = "_guyantools_clipboard._tcp.local.";
const DEFAULT_HTTP_PROBE_PORT: u16 = 49649;
const HTTP_PROBE_INTERVAL: Duration = Duration::from_secs(8);
const HTTP_PROBE_TIMEOUT: Duration = Duration::from_millis(450);
const HTTP_PROBE_CONCURRENCY: usize = 32;

pub trait DiscoveryBackend {
    fn start(
        &mut self,
        config: MultiDeviceClipboardDiscoveryConfig,
        on_event: Arc<dyn Fn(MultiDeviceClipboardEvent) + Send + Sync>,
    ) -> Result<()>;
    fn stop(&mut self);
}

pub struct MdnsDiscoveryBackend {
    daemon: Option<ServiceDaemon>,
    service_fullname: Option<String>,
    stop_flag: Arc<AtomicBool>,
    browser_thread: Option<JoinHandle<()>>,
    http_probe_thread: Option<JoinHandle<()>>,
}

impl MdnsDiscoveryBackend {
    pub fn new() -> Self {
        Self {
            daemon: None,
            service_fullname: None,
            stop_flag: Arc::new(AtomicBool::new(false)),
            browser_thread: None,
            http_probe_thread: None,
        }
    }
}

impl Default for MdnsDiscoveryBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl DiscoveryBackend for MdnsDiscoveryBackend {
    fn start(
        &mut self,
        config: MultiDeviceClipboardDiscoveryConfig,
        on_event: Arc<dyn Fn(MultiDeviceClipboardEvent) + Send + Sync>,
    ) -> Result<()> {
        self.stop();
        self.stop_flag.store(false, Ordering::SeqCst);

        let daemon = ServiceDaemon::new().map_err(|e| anyhow!("mDNS daemon failed: {e}"))?;
        let host_name = format!("{}.local.", sanitize_dns_label(&config.device_id));
        let instance_name = sanitize_dns_label(&config.device_name);
        let platform = config
            .platform
            .clone()
            .unwrap_or_else(|| "desktop".to_string());
        let properties = [
            ("deviceId", config.device_id.as_str()),
            ("deviceName", config.device_name.as_str()),
            ("platform", platform.as_str()),
            ("apiVersion", "1"),
        ];

        let preferred_address = config
            .preferred_address
            .as_deref()
            .filter(|value| !value.trim().is_empty());
        let service = ServiceInfo::new(
            MULTI_DEVICE_CLIPBOARD_SERVICE_TYPE,
            &instance_name,
            &host_name,
            preferred_address.unwrap_or("127.0.0.1"),
            config.port as u16,
            &properties[..],
        )
        .map(|service| {
            if preferred_address.is_some() {
                service
            } else {
                service.enable_addr_auto()
            }
        })
        .map_err(|e| anyhow!("mDNS service info failed: {e}"))?;
        let service_fullname = service.get_fullname().to_string();
        daemon
            .register(service)
            .map_err(|e| anyhow!("mDNS register failed: {e}"))?;

        let receiver = daemon
            .browse(MULTI_DEVICE_CLIPBOARD_SERVICE_TYPE)
            .map_err(|e| anyhow!("mDNS browse failed: {e}"))?;
        let stop_flag = self.stop_flag.clone();
        let own_device_id = config.device_id.clone();
        let on_browser_event = on_event.clone();
        let browser_thread = thread::spawn(move || {
            while !stop_flag.load(Ordering::SeqCst) {
                let Ok(event) = receiver.recv_timeout(std::time::Duration::from_millis(250)) else {
                    continue;
                };
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        if let Some(device) = service_info_to_device(&info) {
                            if device.id != own_device_id {
                                on_browser_event(MultiDeviceClipboardEvent::DeviceFound { device });
                            }
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        on_browser_event(MultiDeviceClipboardEvent::DeviceLost {
                            service_name: fullname,
                        });
                    }
                    _ => {}
                }
            }
        });

        let http_probe_thread = start_http_probe_thread(
            config.device_id.clone(),
            config.probe_local_addresses.clone(),
            config.http_probe_enabled.unwrap_or(true),
            self.stop_flag.clone(),
            on_event,
        );

        self.service_fullname = Some(service_fullname);
        self.browser_thread = Some(browser_thread);
        self.http_probe_thread = http_probe_thread;
        self.daemon = Some(daemon);
        Ok(())
    }

    fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let (Some(daemon), Some(fullname)) = (&self.daemon, &self.service_fullname) {
            let _ = daemon.unregister(fullname);
        }
        if let Some(handle) = self.browser_thread.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.http_probe_thread.take() {
            let _ = handle.join();
        }
        if let Some(daemon) = self.daemon.take() {
            let _ = daemon.shutdown();
        }
        self.service_fullname = None;
        self.stop_flag.store(false, Ordering::SeqCst);
    }
}

impl Drop for MdnsDiscoveryBackend {
    fn drop(&mut self) {
        self.stop();
    }
}

fn sanitize_dns_label(value: &str) -> String {
    let label: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = label.trim_matches('-');
    if trimmed.is_empty() {
        "guyantools-clipboard".to_string()
    } else {
        trimmed.chars().take(48).collect()
    }
}

fn service_info_to_device(info: &ResolvedService) -> Option<MultiDeviceClipboardDiscoveredDevice> {
    let properties = txt_properties(info);
    let id = properties.get("deviceId")?.to_string();
    let name = properties
        .get("deviceName")
        .cloned()
        .unwrap_or_else(|| id.clone());
    let platform = properties
        .get("platform")
        .cloned()
        .unwrap_or_else(|| "desktop".to_string());
    let address = choose_address(info.get_addresses())?;

    Some(MultiDeviceClipboardDiscoveredDevice {
        id,
        name,
        platform,
        address,
        port: info.get_port() as u32,
        service_name: info.get_fullname().to_string(),
        last_seen_at: unix_now(),
    })
}

fn txt_properties(info: &ResolvedService) -> HashMap<String, String> {
    info.get_properties()
        .iter()
        .map(|property| (property.key().to_string(), property.val_str().to_string()))
        .collect()
}

fn choose_address(addresses: &std::collections::HashSet<ScopedIp>) -> Option<String> {
    addresses
        .iter()
        .max_by_key(|addr| address_rank(addr.to_ip_addr()))
        .map(|addr| addr.to_ip_addr().to_string())
}

fn address_rank(address: IpAddr) -> u8 {
    match address {
        IpAddr::V4(ip) => ipv4_rank(ip),
        IpAddr::V6(ip) if ip.is_loopback() => 0,
        IpAddr::V6(ip) if ip.is_unicast_link_local() => 1,
        IpAddr::V6(_) => 10,
    }
}

fn ipv4_rank(ip: Ipv4Addr) -> u8 {
    if ip.is_loopback() || ip.is_unspecified() {
        return 0;
    }
    if ip.is_link_local() {
        return 1;
    }
    let octets = ip.octets();
    if octets[0] == 192 && octets[1] == 168 {
        return 60;
    }
    if octets[0] == 10 {
        return 50;
    }
    if octets[0] == 172 && (16..=31).contains(&octets[1]) {
        return 40;
    }
    if ip.is_private() {
        return 30;
    }
    20
}

fn start_http_probe_thread(
    own_device_id: String,
    local_addresses: Vec<String>,
    enabled: bool,
    stop_flag: Arc<AtomicBool>,
    on_event: Arc<dyn Fn(MultiDeviceClipboardEvent) + Send + Sync>,
) -> Option<JoinHandle<()>> {
    let candidates = subnet_probe_candidates(&local_addresses);
    if !enabled || candidates.is_empty() {
        return None;
    }

    Some(thread::spawn(move || {
        while !stop_flag.load(Ordering::SeqCst) {
            for device in probe_lan_clipboard_devices(&candidates, &own_device_id) {
                on_event(MultiDeviceClipboardEvent::DeviceFound { device });
            }

            let mut waited = Duration::ZERO;
            while waited < HTTP_PROBE_INTERVAL && !stop_flag.load(Ordering::SeqCst) {
                let step = Duration::from_millis(250);
                thread::sleep(step);
                waited += step;
            }
        }
    }))
}

fn subnet_probe_candidates(local_addresses: &[String]) -> Vec<String> {
    let own: std::collections::HashSet<Ipv4Addr> = local_addresses
        .iter()
        .filter_map(|address| address.parse::<Ipv4Addr>().ok())
        .collect();
    let mut candidates = std::collections::BTreeSet::new();
    for ip in &own {
        let octets = ip.octets();
        for host in 1..=254 {
            let candidate = Ipv4Addr::new(octets[0], octets[1], octets[2], host);
            if !own.contains(&candidate) {
                candidates.insert(candidate.to_string());
            }
        }
    }
    candidates.into_iter().collect()
}

fn probe_lan_clipboard_devices(
    candidates: &[String],
    own_device_id: &str,
) -> Vec<MultiDeviceClipboardDiscoveredDevice> {
    let next_index = Arc::new(std::sync::Mutex::new(0usize));
    let found = Arc::new(std::sync::Mutex::new(Vec::new()));
    let candidates = Arc::new(candidates.to_vec());
    let worker_count = HTTP_PROBE_CONCURRENCY.min(candidates.len());

    thread::scope(|scope| {
        for _ in 0..worker_count {
            let next_index = next_index.clone();
            let found = found.clone();
            let candidates = candidates.clone();
            scope.spawn(move || loop {
                let index = {
                    let Ok(mut guard) = next_index.lock() else {
                        return;
                    };
                    if *guard >= candidates.len() {
                        return;
                    }
                    let index = *guard;
                    *guard += 1;
                    index
                };

                if let Some(device) = probe_lan_clipboard_device(&candidates[index], own_device_id) {
                    if let Ok(mut guard) = found.lock() {
                        guard.push(device);
                    }
                }
            });
        }
    });

    Arc::try_unwrap(found)
        .ok()
        .and_then(|mutex| mutex.into_inner().ok())
        .unwrap_or_default()
}

fn probe_lan_clipboard_device(
    address: &str,
    own_device_id: &str,
) -> Option<MultiDeviceClipboardDiscoveredDevice> {
    let socket = SocketAddr::new(address.parse().ok()?, DEFAULT_HTTP_PROBE_PORT);
    let mut stream = TcpStream::connect_timeout(&socket, HTTP_PROBE_TIMEOUT).ok()?;
    let _ = stream.set_read_timeout(Some(HTTP_PROBE_TIMEOUT));
    let _ = stream.set_write_timeout(Some(HTTP_PROBE_TIMEOUT));
    let request = format!(
        "GET /status HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\nAccept: application/json\r\n\r\n",
        address, DEFAULT_HTTP_PROBE_PORT
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).ok()?;
    let body = parse_http_status_body(&response)?;
    let status: ProbeStatusResponse = serde_json::from_slice(&body).ok()?;
    let remote = status.device?;
    if remote.id.is_empty() || remote.id == own_device_id {
        return None;
    }
    Some(MultiDeviceClipboardDiscoveredDevice {
        id: remote.id,
        name: if remote.name.is_empty() {
            "GuYanTools".to_string()
        } else {
            remote.name
        },
        platform: remote.platform.unwrap_or_else(|| "desktop".to_string()),
        address: address.to_string(),
        port: DEFAULT_HTTP_PROBE_PORT as u32,
        service_name: format!("http://{}:{}", address, DEFAULT_HTTP_PROBE_PORT),
        last_seen_at: unix_now(),
    })
}

fn parse_http_status_body(response: &[u8]) -> Option<Vec<u8>> {
    if !response.starts_with(b"HTTP/1.1 200") && !response.starts_with(b"HTTP/1.0 200") {
        return None;
    }
    let split = response.windows(4).position(|window| window == b"\r\n\r\n")?;
    let headers = String::from_utf8_lossy(&response[..split]).to_ascii_lowercase();
    let body = &response[(split + 4)..];
    if headers
        .lines()
        .any(|line| line.starts_with("transfer-encoding:") && line.contains("chunked"))
    {
        decode_chunked_http_body(body)
    } else {
        Some(body.to_vec())
    }
}

fn decode_chunked_http_body(body: &[u8]) -> Option<Vec<u8>> {
    let mut cursor = 0usize;
    let mut decoded = Vec::new();

    loop {
        let line_end = find_crlf(&body[cursor..])? + cursor;
        let size_line = std::str::from_utf8(&body[cursor..line_end]).ok()?;
        let size_hex = size_line.split(';').next()?.trim();
        let size = usize::from_str_radix(size_hex, 16).ok()?;
        cursor = line_end + 2;

        if size == 0 {
            return Some(decoded);
        }

        let chunk_end = cursor.checked_add(size)?;
        if chunk_end + 2 > body.len() || &body[chunk_end..chunk_end + 2] != b"\r\n" {
            return None;
        }
        decoded.extend_from_slice(&body[cursor..chunk_end]);
        cursor = chunk_end + 2;
    }
}

fn find_crlf(bytes: &[u8]) -> Option<usize> {
    bytes.windows(2).position(|window| window == b"\r\n")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeStatusResponse {
    device: Option<ProbeStatusDevice>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeStatusDevice {
    id: String,
    name: String,
    platform: Option<String>,
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subnet_probe_candidates_skip_own_address() {
        let candidates = subnet_probe_candidates(&["192.168.0.49".to_string()]);
        assert!(candidates.contains(&"192.168.0.50".to_string()));
        assert!(!candidates.contains(&"192.168.0.49".to_string()));
        assert_eq!(candidates.len(), 253);
    }

    #[test]
    fn parse_http_status_body_accepts_ok_json_response() {
        let response = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"device\":{\"id\":\"a\",\"name\":\"b\"}}";
        assert_eq!(
            parse_http_status_body(response).unwrap(),
            b"{\"device\":{\"id\":\"a\",\"name\":\"b\"}}".to_vec()
        );
    }

    #[test]
    fn parse_http_status_body_rejects_non_ok_response() {
        let response = b"HTTP/1.1 404 Not Found\r\n\r\n{}";
        assert!(parse_http_status_body(response).is_none());
    }

    #[test]
    fn parse_http_status_body_decodes_chunked_response() {
        let response = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n15\r\n{\"device\":{\"id\":\"a\"}}\r\n0\r\n\r\n";
        assert_eq!(
            parse_http_status_body(response).unwrap(),
            b"{\"device\":{\"id\":\"a\"}}".to_vec()
        );
    }
}
