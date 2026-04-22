use std::time::{SystemTime, UNIX_EPOCH};

pub(super) use crate::crypto::{decrypt_credential, encrypt_credential};

pub(super) fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
