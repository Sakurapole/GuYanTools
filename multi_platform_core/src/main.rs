use serde::{Deserialize, Serialize};
use std::env;
use std::io;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::time::{self, Duration};

const BROADCAST_PORT: u16 = 34255; // 使用一个不常用的端口以避免冲突
const BROADCAST_ADDRESS: &str = "255.255.255.255";

// 错误处理
#[derive(thiserror::Error, Debug)]
enum DiscoveryError {
    #[error("Network I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),
}

// 设备优先级
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, PartialOrd, Ord, Eq)]
pub enum Priority {
    Android = 0,
    Windows = 1,
    Linux = 2,
    Unknown = 99, // 其他操作系统
}

impl Priority {
    // 获取当前操作系统的优先级
    pub fn current() -> Self {
        match env::consts::OS {
            "linux" => Priority::Linux,
            "windows" => Priority::Windows,
            "android" => Priority::Android,
            _ => Priority::Unknown,
        }
    }
}

// 代表一个网络中的设备
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Device {
    id: String,
    name: String,
    priority: Priority,
}

impl Device {
    fn new_local() -> Self {
        Self {
            id: format!("device-{}", rand::random::<u64>()),
            name: env::var("COMPUTERNAME")
                .or_else(|_| env::var("HOSTNAME"))
                .unwrap_or_else(|_| "Unknown".to_string()),
            priority: Priority::current(),
        }
    }
}

// 网络通信消息
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum Message {
    /// 广播发现自己
    Discover(Device),
    /// 对Discover消息的单播回复
    Acknowledge(Device),
}

#[tokio::main]
async fn main() -> Result<(), DiscoveryError> {
    // 1. 创建代表本机的设备信息
    let local_device = Device::new_local();
    println!("🚀 Starting discovery for: {:?}\n", local_device);

    // 2. 绑定UDP套接字
    // 绑定到 "0.0.0.0" 允许我们接收来自任何网络接口的广播
    let bind_addr = format!("0.0.0.0:{}", BROADCAST_PORT);
    let socket = UdpSocket::bind(&bind_addr).await?;

    // 启用广播模式，这是发送广播消息所必需的
    socket.set_broadcast(true)?;

    // 使用Arc来安全地在多个异步任务之间共享套接字
    let socket = Arc::new(socket);

    // 3. 创建一个任务专门用于监听网络消息
    let listener_socket = Arc::clone(&socket);
    let listener_device = local_device.clone();
    tokio::spawn(async move {
        listen_for_peers(listener_socket, listener_device).await;
    });

    // 4. 在主任务中，定期广播我们的存在
    let broadcaster_socket = Arc::clone(&socket);
    let broadcast_device = local_device.clone();
    loop {
        println!("📡 Broadcasting presence...");
        let message = Message::Discover(broadcast_device.clone());
        let msg_bytes = serde_json::to_vec(&message)?;
        let target_addr = format!("{}:{}", BROADCAST_ADDRESS, BROADCAST_PORT);

        broadcaster_socket.send_to(&msg_bytes, &target_addr).await?;

        // 每 10 秒广播一次
        time::sleep(Duration::from_secs(10)).await;
    }
}

/// 一个独立的异步函数，在后台持续监听和处理传入的UDP消息
async fn listen_for_peers(socket: Arc<UdpSocket>, local_device: Device) {
    let mut buf = [0; 1024]; // 用于接收数据的缓冲区

    loop {
        // 等待接收消息
        let (len, src_addr) = match socket.recv_from(&mut buf).await {
            Ok(data) => data,
            Err(e) => {
                eprintln!("🔥 Error receiving from socket: {}", e);
                continue;
            }
        };

        // 反序列化消息
        let message: Message = match serde_json::from_slice(&buf[..len]) {
            Ok(msg) => msg,
            Err(_) => continue, // 忽略无法解析的或格式错误的消息
        };

        match message {
            // 收到其他设备的发现请求
            Message::Discover(peer_device) => {
                // 忽略我们自己发出的广播
                if peer_device.id == local_device.id {
                    continue;
                }

                println!("\n🤝 Discovered peer: {:?} from {}", peer_device, src_addr);

                // 向对方单播回复我们的信息
                println!("✅ Sending acknowledgement to {}", src_addr);
                let response_message = Message::Acknowledge(local_device.clone());
                let msg_bytes = match serde_json::to_vec(&response_message) {
                    Ok(bytes) => bytes,
                    Err(_) => continue,
                };
                if let Err(e) = socket.send_to(&msg_bytes, src_addr).await {
                    eprintln!("🔥 Failed to send acknowledgement to {}: {}", src_addr, e);
                }
            }
            // 收到其他设备的应答
            Message::Acknowledge(peer_device) => {
                // 忽略对自己discover的ack
                if peer_device.id == local_device.id {
                    continue;
                }
                println!(
                    "\n👋 Received acknowledgement from: {:?} at {}",
                    peer_device, src_addr
                );
                // 在这里，你可以将 `peer_device` 和 `src_addr` 添加到一个对等节点列表（peer list）中
                // 例如: peers.lock().await.insert(peer_device.id, (peer_device, src_addr));
            }
        }
    }
}
