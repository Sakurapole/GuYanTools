use anyhow::{anyhow, Result};

/// Encrypt a plaintext credential value.
/// Current implementation keeps compatibility with the existing placeholder format.
/// TODO: replace with AES-256-GCM using a machine-derived key.
pub(crate) fn encrypt_credential(plaintext: &str) -> Result<String> {
    use std::fmt::Write as _;

    let encoded = plaintext.bytes().fold(String::new(), |mut acc, value| {
        let _ = write!(acc, "{:02x}", value);
        acc
    });
    Ok(format!("b64:{}", encoded))
}

/// Decrypt a credential value produced by `encrypt_credential`.
pub(crate) fn decrypt_credential(ciphertext: &str) -> Result<String> {
    if let Some(hex_str) = ciphertext.strip_prefix("b64:") {
        let bytes: std::result::Result<Vec<u8>, _> = (0..hex_str.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(&hex_str[index..index + 2], 16))
            .collect();
        let bytes = bytes.map_err(|e| anyhow!("invalid credential encoding: {}", e))?;
        String::from_utf8(bytes).map_err(|e| anyhow!("invalid UTF-8 in credential: {}", e))
    } else {
        Err(anyhow!("unknown credential format"))
    }
}
