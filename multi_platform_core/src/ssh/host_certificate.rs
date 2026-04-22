use anyhow::{anyhow, Context, Result};
use ssh_key::certificate::CertType;
use ssh_key::{Certificate, HashAlg, PublicKey};

pub(crate) fn validate_host_certificate(
    server_key_bytes: &[u8],
    expected_host: &str,
    host_ca_key_path: &str,
) -> Result<()> {
    let certificate = Certificate::from_bytes(server_key_bytes)
        .map_err(|e| anyhow!("failed to parse OpenSSH host certificate: {}", e))?;
    if certificate.cert_type() != CertType::Host {
        return Err(anyhow!("server certificate is not a host certificate"));
    }
    if !certificate.critical_options().is_empty() {
        return Err(anyhow!(
            "server host certificate contains unsupported critical options"
        ));
    }

    let ca_public_key = load_ca_public_key(host_ca_key_path)?;
    let ca_fingerprint = ca_public_key.fingerprint(HashAlg::Sha256);
    certificate
        .validate([&ca_fingerprint])
        .map_err(|e| anyhow!("host certificate CA validation failed: {}", e))?;

    let has_expected_principal = certificate.valid_principals().is_empty()
        || certificate
            .valid_principals()
            .iter()
            .any(|principal| principal.eq_ignore_ascii_case(expected_host));
    if !has_expected_principal {
        return Err(anyhow!(
            "host certificate principal does not match '{}'",
            expected_host
        ));
    }

    Ok(())
}

fn load_ca_public_key(path: &str) -> Result<PublicKey> {
    let normalized = path.trim();
    if normalized.is_empty() {
        return Err(anyhow!("host CA public key path is empty"));
    }

    let contents = std::fs::read_to_string(normalized)
        .with_context(|| format!("failed to read host CA public key '{}'", normalized))?;
    PublicKey::from_openssh(contents.trim())
        .map_err(|e| anyhow!("failed to parse host CA public key '{}': {}", normalized, e))
}
