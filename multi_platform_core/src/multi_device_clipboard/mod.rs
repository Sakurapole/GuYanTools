mod discovery;
mod service;

pub use discovery::{DiscoveryBackend, MdnsDiscoveryBackend, MULTI_DEVICE_CLIPBOARD_SERVICE_TYPE};
pub use service::MultiDeviceClipboardManager;
