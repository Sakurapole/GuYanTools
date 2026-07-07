use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm,
    Nonce,
};
use anyhow::{anyhow, Context, Result};
use sha2::{Digest, Sha256};

const AES_GCM_PREFIX: &str = "aes-gcm:v1";
const LEGACY_HEX_PREFIX: &str = "b64:";

/// Encrypt a plaintext credential value with AES-256-GCM.
pub(crate) fn encrypt_credential(plaintext: &str) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(&derive_machine_key())
        .map_err(|_| anyhow!("failed to initialize credential cipher"))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| anyhow!("failed to encrypt credential"))?;
    Ok(format!(
        "{}:{}:{}",
        AES_GCM_PREFIX,
        encode_hex(&nonce),
        encode_hex(&ciphertext)
    ))
}

/// Decrypt a credential value produced by `encrypt_credential`.
pub(crate) fn decrypt_credential(ciphertext: &str) -> Result<String> {
    if let Some(hex_str) = ciphertext.strip_prefix(LEGACY_HEX_PREFIX) {
        return decode_legacy_hex_credential(hex_str);
    }

    let Some(payload) = ciphertext.strip_prefix(&format!("{}:", AES_GCM_PREFIX)) else {
        return Err(anyhow!("unknown credential format"));
    };
    let (nonce_hex, ciphertext_hex) = payload
        .split_once(':')
        .ok_or_else(|| anyhow!("invalid AES-GCM credential format"))?;
    let nonce_bytes = decode_hex(nonce_hex).context("invalid AES-GCM nonce")?;
    if nonce_bytes.len() != 12 {
        return Err(anyhow!("invalid AES-GCM nonce length"));
    }
    let encrypted_bytes = decode_hex(ciphertext_hex).context("invalid AES-GCM payload")?;
    let cipher = Aes256Gcm::new_from_slice(&derive_machine_key())
        .map_err(|_| anyhow!("failed to initialize credential cipher"))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), encrypted_bytes.as_ref())
        .map_err(|_| anyhow!("failed to decrypt credential"))?;
    String::from_utf8(plaintext).map_err(|e| anyhow!("invalid UTF-8 in credential: {}", e))
}

fn derive_machine_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"GuYanTools credential encryption v1");
    for value in machine_key_parts() {
        hasher.update([0]);
        hasher.update(value.as_bytes());
    }
    hasher.finalize().into()
}

fn machine_key_parts() -> Vec<String> {
    [
        "COMPUTERNAME",
        "HOSTNAME",
        "USERDOMAIN",
        "USERNAME",
        "USER",
        "USERPROFILE",
        "HOME",
        "APPDATA",
        "XDG_CONFIG_HOME",
    ]
    .iter()
    .filter_map(|key| std::env::var(key).ok())
    .filter(|value| !value.trim().is_empty())
    .collect()
}

fn decode_legacy_hex_credential(hex_str: &str) -> Result<String> {
    let bytes = decode_hex(hex_str).map_err(|e| anyhow!("invalid credential encoding: {}", e))?;
    String::from_utf8(bytes).map_err(|e| anyhow!("invalid UTF-8 in credential: {}", e))
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn decode_hex(value: &str) -> Result<Vec<u8>> {
    if value.len() % 2 != 0 {
        return Err(anyhow!("hex string must have an even length"));
    }
    (0..value.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&value[index..index + 2], 16).map_err(Into::into))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{decrypt_credential, encrypt_credential, AES_GCM_PREFIX};

    #[test]
    fn aes_gcm_credentials_round_trip() {
        let plaintext = "secret-password-中文";
        let encrypted = encrypt_credential(plaintext).expect("encrypt");

        assert!(encrypted.starts_with(AES_GCM_PREFIX));
        assert_ne!(encrypted, plaintext);
        assert_eq!(decrypt_credential(&encrypted).expect("decrypt"), plaintext);
    }

    #[test]
    fn legacy_hex_credentials_still_decrypt() {
        assert_eq!(
            decrypt_credential("b64:7365637265742de4b8ade69687").expect("decrypt legacy"),
            "secret-中文"
        );
    }

    #[test]
    fn invalid_credentials_return_errors() {
        assert!(decrypt_credential("plain-secret").is_err());
        assert!(decrypt_credential("aes-gcm:v1:00:01").is_err());
        assert!(decrypt_credential("b64:abc").is_err());
    }
}
