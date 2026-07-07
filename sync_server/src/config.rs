use std::{env, net::SocketAddr};

use anyhow::Context;
use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::{config::SharedCredentialsProvider, Client as S3Client};
use sqlx::{postgres::PgPoolOptions, PgPool};

const DEFAULT_MAX_ASSET_BODY_BYTES: usize = 100 * 1024 * 1024;
const DEFAULT_MAX_SYNC_PUSH_BODY_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct SyncServerConfig {
    pub bind_addr: SocketAddr,
    pub version: String,
    pub database: PgPool,
    pub redis: redis::Client,
    pub s3: S3Client,
    pub s3_bucket: String,
    pub max_asset_body_bytes: usize,
    pub max_sync_push_body_bytes: usize,
}

impl SyncServerConfig {
    pub async fn from_env() -> anyhow::Result<Self> {
        let bind_addr = env::var("GUYANTOOLS_SYNC_BIND")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or_else(|| SocketAddr::from(([127, 0, 0, 1], 38420)));

        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://laityh:20030303@127.0.0.1:5430/mydb".to_string());
        let database = PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .with_context(|| format!("failed to connect PostgreSQL at {database_url}"))?;
        sqlx::migrate!("./migrations")
            .run(&database)
            .await
            .context("failed to run sync server migrations")?;

        let redis_url =
            env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
        let redis = redis::Client::open(redis_url.as_str())
            .with_context(|| format!("failed to configure Redis client for {redis_url}"))?;
        let mut redis_conn = redis
            .get_multiplexed_async_connection()
            .await
            .context("failed to connect Redis")?;
        redis::cmd("PING")
            .query_async::<String>(&mut redis_conn)
            .await
            .context("failed to ping Redis")?;

        let s3_bucket =
            env::var("S3_BUCKET").unwrap_or_else(|_| "guyantools-sync-assets".to_string());
        let s3 = build_s3_client().await;
        ensure_bucket(&s3, &s3_bucket).await?;
        let max_asset_body_bytes =
            parse_max_asset_body_bytes(env::var("GUYANTOOLS_SYNC_MAX_ASSET_BYTES").ok())?;
        let max_sync_push_body_bytes =
            parse_max_sync_push_body_bytes(env::var("GUYANTOOLS_SYNC_MAX_PUSH_BYTES").ok())?;

        Ok(Self {
            bind_addr,
            version: env!("CARGO_PKG_VERSION").to_string(),
            database,
            redis,
            s3,
            s3_bucket,
            max_asset_body_bytes,
            max_sync_push_body_bytes,
        })
    }
}

fn parse_max_asset_body_bytes(value: Option<String>) -> anyhow::Result<usize> {
    let Some(raw) = value else {
        return Ok(DEFAULT_MAX_ASSET_BODY_BYTES);
    };
    let trimmed = raw.trim();
    let parsed = trimmed.parse::<usize>().with_context(|| {
        format!("GUYANTOOLS_SYNC_MAX_ASSET_BYTES must be a positive integer, got {trimmed:?}")
    })?;
    if parsed == 0 {
        anyhow::bail!("GUYANTOOLS_SYNC_MAX_ASSET_BYTES must be greater than 0");
    }
    Ok(parsed)
}

fn parse_max_sync_push_body_bytes(value: Option<String>) -> anyhow::Result<usize> {
    let Some(raw) = value else {
        return Ok(DEFAULT_MAX_SYNC_PUSH_BODY_BYTES);
    };
    let trimmed = raw.trim();
    let parsed = trimmed.parse::<usize>().with_context(|| {
        format!("GUYANTOOLS_SYNC_MAX_PUSH_BYTES must be a positive integer, got {trimmed:?}")
    })?;
    if parsed == 0 {
        anyhow::bail!("GUYANTOOLS_SYNC_MAX_PUSH_BYTES must be greater than 0");
    }
    Ok(parsed)
}

async fn build_s3_client() -> S3Client {
    let endpoint = env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://127.0.0.1:9000".to_string());
    let access_key = env::var("S3_ACCESS_KEY_ID").unwrap_or_else(|_| "guyantools".to_string());
    let secret_key =
        env::var("S3_SECRET_ACCESS_KEY").unwrap_or_else(|_| "guyantools-sync-2026".to_string());
    let region = env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let credentials = Credentials::new(access_key, secret_key, None, None, "guyantools-sync");

    let base_config = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(region.clone()))
        .credentials_provider(SharedCredentialsProvider::new(credentials))
        .endpoint_url(endpoint)
        .load()
        .await;

    let s3_config = aws_sdk_s3::config::Builder::from(&base_config)
        .region(Region::new(region))
        .force_path_style(true)
        .build();
    S3Client::from_conf(s3_config)
}

async fn ensure_bucket(client: &S3Client, bucket: &str) -> anyhow::Result<()> {
    if client.head_bucket().bucket(bucket).send().await.is_ok() {
        return Ok(());
    }
    client
        .create_bucket()
        .bucket(bucket)
        .send()
        .await
        .with_context(|| format!("failed to create S3 bucket {bucket}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_asset_body_limit_to_100_mib() {
        assert_eq!(parse_max_asset_body_bytes(None).unwrap(), 100 * 1024 * 1024);
    }

    #[test]
    fn accepts_custom_asset_body_limit_bytes() {
        assert_eq!(
            parse_max_asset_body_bytes(Some("209715200".to_string())).unwrap(),
            200 * 1024 * 1024
        );
    }

    #[test]
    fn rejects_zero_asset_body_limit() {
        let error = parse_max_asset_body_bytes(Some("0".to_string())).unwrap_err();
        assert!(error.to_string().contains("greater than 0"));
    }

    #[test]
    fn rejects_invalid_asset_body_limit() {
        let error = parse_max_asset_body_bytes(Some("not-a-number".to_string())).unwrap_err();
        assert!(error
            .to_string()
            .contains("GUYANTOOLS_SYNC_MAX_ASSET_BYTES"));
    }

    #[test]
    fn defaults_sync_push_body_limit_to_32_mib() {
        assert_eq!(
            parse_max_sync_push_body_bytes(None).unwrap(),
            32 * 1024 * 1024
        );
    }

    #[test]
    fn accepts_custom_sync_push_body_limit_bytes() {
        assert_eq!(
            parse_max_sync_push_body_bytes(Some("67108864".to_string())).unwrap(),
            64 * 1024 * 1024
        );
    }

    #[test]
    fn rejects_zero_sync_push_body_limit() {
        let error = parse_max_sync_push_body_bytes(Some("0".to_string())).unwrap_err();
        assert!(error.to_string().contains("greater than 0"));
    }

    #[test]
    fn rejects_invalid_sync_push_body_limit() {
        let error = parse_max_sync_push_body_bytes(Some("oops".to_string())).unwrap_err();
        assert!(error
            .to_string()
            .contains("GUYANTOOLS_SYNC_MAX_PUSH_BYTES"));
    }
}
