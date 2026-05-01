mod connection;
mod credentials;
mod forward_crud;
mod handler;
mod host_certificate;
mod key_manager;
mod known_hosts;
pub mod models;
mod port_forward;
mod profile;

use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, RwLock};

use crate::db::Database;
#[cfg(feature = "napi")]
use crate::event::EventSink;

use self::handler::SshClientHandler;
use self::port_forward::PortForwardHandle;

pub(crate) use self::host_certificate::validate_host_certificate;
pub use self::models::*;

type SessionsMap = HashMap<String, Arc<SshSession>>;
pub(super) type RemoteForwardMapping = Arc<RwLock<HashMap<(String, u32), (String, u32, String)>>>;

pub(super) enum SshChannelCommand {
    Data(Vec<u8>),
    Resize { rows: u32, cols: u32 },
    Close,
}

pub(super) struct SshSession {
    pub(in crate::ssh) descriptor: Mutex<self::models::SshSessionDescriptor>,
    pub(in crate::ssh) channel_tx: tokio::sync::mpsc::Sender<SshChannelCommand>,
    pub(in crate::ssh) ssh_handle:
        Arc<tokio::sync::Mutex<Option<russh::client::Handle<SshClientHandler>>>>,
    pub(in crate::ssh) active_forwards: Arc<RwLock<HashMap<String, PortForwardHandle>>>,
    pub(in crate::ssh) remote_forward_map: RemoteForwardMapping,
}

struct SshConnectionManagerInner {
    db: Arc<Database>,
    sessions: RwLock<SessionsMap>,
    #[cfg(feature = "napi")]
    event_sink: Mutex<Option<EventSink>>,
    next_session_counter: AtomicU64,
}

#[derive(Clone)]
pub struct SshConnectionManager {
    inner: Arc<SshConnectionManagerInner>,
}

impl SshConnectionManager {
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            inner: Arc::new(SshConnectionManagerInner {
                db,
                sessions: RwLock::new(HashMap::new()),
                #[cfg(feature = "napi")]
                event_sink: Mutex::new(None),
                next_session_counter: AtomicU64::new(1),
            }),
        }
    }
}
