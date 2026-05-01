use anyhow::{anyhow, Result};
use rusqlite::OptionalExtension;
use ssh_key::{rand_core::OsRng, Algorithm, EcdsaCurve, HashAlg, LineEnding, PrivateKey};
use uuid::Uuid;

use super::credentials::{encrypt_credential, unix_now};
use super::models::{
    ExportSshManagedKeyData, GenerateSshManagedKeyInput, ImportSshManagedKeyInput, SshManagedKey,
};

impl super::SshConnectionManager {
    pub fn list_managed_keys(&self) -> Result<Vec<SshManagedKey>> {
        self.inner
            .db
            .with_connection(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT id, label, algorithm, source, comment, fingerprint, public_key,
                                is_encrypted, created_at, updated_at
                         FROM ssh_managed_keys
                         ORDER BY updated_at DESC, created_at DESC",
                    )
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                let rows = stmt
                    .query_map([], |row| {
                        Ok(SshManagedKey {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            algorithm: row.get(2)?,
                            source: row.get(3)?,
                            comment: row.get(4)?,
                            fingerprint: row.get(5)?,
                            public_key: row.get(6)?,
                            is_encrypted: row.get::<_, i64>(7)? != 0,
                            created_at: row.get(8)?,
                            updated_at: row.get(9)?,
                        })
                    })
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }

    pub fn generate_managed_key(&self, input: GenerateSshManagedKeyInput) -> Result<SshManagedKey> {
        let label = input.label.trim();
        if label.is_empty() {
            return Err(anyhow!("key label is required"));
        }

        let mut private_key =
            PrivateKey::random(&mut OsRng, parse_generation_algorithm(&input.algorithm)?)
                .map_err(|e| anyhow!("failed to generate SSH key: {}", e))?;
        let comment = input
            .comment
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(label);
        private_key.set_comment(comment);

        let public_key = private_key
            .public_key()
            .to_openssh()
            .map_err(|e| anyhow!("failed to encode SSH public key: {}", e))?;
        let private_key_text = private_key
            .to_openssh(LineEnding::LF)
            .map_err(|e| anyhow!("failed to encode SSH private key: {}", e))?;

        let id = Uuid::new_v4().to_string();
        let now = unix_now();
        let algorithm = private_key.algorithm().as_str().to_string();
        let fingerprint = private_key.fingerprint(HashAlg::Sha256).to_string();
        let encrypted_private_key = encrypt_credential(private_key_text.as_ref())?;

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ssh_managed_keys
                        (id, label, algorithm, source, comment, fingerprint, public_key,
                         encrypted_private_key, is_encrypted, created_at, updated_at)
                     VALUES (?1, ?2, ?3, 'generated', ?4, ?5, ?6, ?7, 0, ?8, ?9)",
                    rusqlite::params![
                        id,
                        label,
                        algorithm,
                        Some(comment.to_string()),
                        fingerprint,
                        public_key,
                        encrypted_private_key,
                        now,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_managed_key(&id)
    }

    pub fn import_managed_key(&self, input: ImportSshManagedKeyInput) -> Result<SshManagedKey> {
        let raw_private_key = if let Some(private_key) = input.private_key.as_deref() {
            private_key.to_string()
        } else if let Some(file_path) = input.file_path.as_deref() {
            std::fs::read_to_string(file_path)
                .map_err(|e| anyhow!("failed to read SSH key file '{}': {}", file_path, e))?
        } else {
            return Err(anyhow!("either privateKey or filePath is required"));
        };

        let parsed = PrivateKey::from_openssh(raw_private_key.as_bytes())
            .map_err(|e| anyhow!("failed to parse OpenSSH private key: {}", e))?;
        let derived_label = input
            .label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| {
                input.file_path.as_deref().and_then(|path| {
                    std::path::Path::new(path)
                        .file_stem()
                        .and_then(|value| value.to_str())
                        .map(|value| value.to_string())
                })
            })
            .or_else(|| {
                let comment = parsed.comment().trim();
                (!comment.is_empty()).then(|| comment.to_string())
            })
            .unwrap_or_else(|| "Imported SSH Key".to_string());
        let comment = parsed.comment().trim();
        let comment = (!comment.is_empty()).then(|| comment.to_string());
        let public_key = parsed
            .public_key()
            .to_openssh()
            .map_err(|e| anyhow!("failed to encode SSH public key: {}", e))?;
        let fingerprint = parsed.fingerprint(HashAlg::Sha256).to_string();
        let algorithm = parsed.algorithm().as_str().to_string();
        let encrypted_private_key = encrypt_credential(&raw_private_key)?;
        let id = Uuid::new_v4().to_string();
        let now = unix_now();

        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "INSERT INTO ssh_managed_keys
                        (id, label, algorithm, source, comment, fingerprint, public_key,
                         encrypted_private_key, is_encrypted, created_at, updated_at)
                     VALUES (?1, ?2, ?3, 'imported', ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    rusqlite::params![
                        id,
                        derived_label,
                        algorithm,
                        comment,
                        fingerprint,
                        public_key,
                        encrypted_private_key,
                        parsed.is_encrypted() as i64,
                        now,
                        now,
                    ],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))?;

        self.get_managed_key(&id)
    }

    pub fn export_managed_key(&self, id: &str) -> Result<ExportSshManagedKeyData> {
        let record = self
            .inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT label, algorithm, fingerprint, comment, public_key, encrypted_private_key
                     FROM ssh_managed_keys
                     WHERE id = ?1",
                    rusqlite::params![id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?,
                            row.get::<_, String>(4)?,
                            row.get::<_, String>(5)?,
                        ))
                    },
                )
                .optional()
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))?
            .ok_or_else(|| anyhow!("managed SSH key '{}' not found", id))?;

        let private_key = crate::crypto::decrypt_credential(&record.5)?;
        let base_name = sanitize_file_name(&record.0);

        Ok(ExportSshManagedKeyData {
            id: id.to_string(),
            label: record.0,
            algorithm: record.1,
            fingerprint: record.2,
            comment: record.3,
            public_key: record.4,
            private_key,
            suggested_private_key_name: base_name.clone(),
            suggested_public_key_name: format!("{}.pub", base_name),
        })
    }

    pub fn delete_managed_key(&self, id: &str) -> Result<()> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.execute(
                    "DELETE FROM ssh_managed_keys WHERE id = ?1",
                    rusqlite::params![id],
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))?;
                Ok(())
            })
            .map_err(|e| anyhow!("{}", e))
    }

    fn get_managed_key(&self, id: &str) -> Result<SshManagedKey> {
        self.inner
            .db
            .with_connection(|conn| {
                conn.query_row(
                    "SELECT id, label, algorithm, source, comment, fingerprint, public_key,
                            is_encrypted, created_at, updated_at
                     FROM ssh_managed_keys
                     WHERE id = ?1",
                    rusqlite::params![id],
                    |row| {
                        Ok(SshManagedKey {
                            id: row.get(0)?,
                            label: row.get(1)?,
                            algorithm: row.get(2)?,
                            source: row.get(3)?,
                            comment: row.get(4)?,
                            fingerprint: row.get(5)?,
                            public_key: row.get(6)?,
                            is_encrypted: row.get::<_, i64>(7)? != 0,
                            created_at: row.get(8)?,
                            updated_at: row.get(9)?,
                        })
                    },
                )
                .map_err(|e| crate::db::DbError::QueryFailed(e.to_string()))
            })
            .map_err(|e| anyhow!("{}", e))
    }
}

fn parse_generation_algorithm(value: &str) -> Result<Algorithm> {
    match value.trim().to_lowercase().as_str() {
        "ed25519" => Ok(Algorithm::Ed25519),
        "ecdsa" | "ecdsa-nistp256" | "nistp256" => Ok(Algorithm::Ecdsa {
            curve: EcdsaCurve::NistP256,
        }),
        "rsa" => Ok(Algorithm::Rsa { hash: None }),
        other => Err(anyhow!("unsupported SSH key algorithm '{}'", other)),
    }
}

fn sanitize_file_name(label: &str) -> String {
    let sanitized = label
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ if ch.is_control() => '_',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();

    if sanitized.is_empty() {
        "ssh-key".to_string()
    } else {
        sanitized
    }
}
