use crate::config::SyncServerConfig;
use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use aws_sdk_s3::primitives::ByteStream;
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use std::collections::HashSet;
use uuid::Uuid;

const ACCESS_TOKEN_TTL_SECONDS: u64 = 60 * 60 * 24;
const REFRESH_TOKEN_TTL_SECONDS: u64 = 60 * 60 * 24 * 30;
const DEVICE_TOKEN_TTL_SECONDS: u64 = 60 * 60 * 24 * 90;

#[derive(Debug, Serialize, Deserialize)]
struct HealthResponse {
    ok: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct VersionResponse {
    name: &'static str,
    version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthRequest {
    email: Option<String>,
    password: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
    user_id: String,
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterDeviceRequest {
    device_name: Option<String>,
    platform: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterDeviceResponse {
    device_id: String,
    device_token: String,
    device_name: String,
    platform: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapRequest {
    device_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapResponse {
    server_time: i64,
    cursor: i64,
    collections: Vec<&'static str>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncPushRequest {
    device_id: String,
    op_id: Option<String>,
    objects: Vec<SyncObjectRequest>,
    tombstones: Option<Vec<SyncObjectRequest>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncObjectRequest {
    collection: String,
    object_id: String,
    base_rev: Option<String>,
    payload: Value,
    deleted: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncPushResponse {
    accepted: i64,
    seq: i64,
    server_rev: String,
    op_id: Option<String>,
    applied: Vec<SyncAppliedObject>,
    conflicts: Vec<SyncPushConflict>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncAppliedObject {
    collection: String,
    object_id: String,
    server_rev: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncPushConflict {
    conflict_id: String,
    collection: String,
    object_id: String,
    server_rev: String,
    server_payload: Value,
    attempted_payload: Value,
    deleted: bool,
}

#[derive(Debug, Deserialize)]
struct SyncPullQuery {
    since: Option<i64>,
    limit: Option<i64>,
    collections: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncPullResponse {
    cursor: i64,
    objects: Vec<PulledSyncObject>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PulledSyncObject {
    seq: i64,
    server_rev: String,
    device_id: String,
    collection: String,
    object_id: String,
    payload: Value,
    deleted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncAckRequest {
    device_id: String,
    cursor: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveConflictRequest {
    resolution: String,
}

#[derive(Debug, Clone)]
struct AuthContext {
    user_id: Uuid,
    device_id: Option<Uuid>,
}

#[derive(Debug)]
struct AppError {
    status: StatusCode,
    message: String,
}

impl AppError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.into(),
        }
    }

    fn forbidden(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            message: message.into(),
        }
    }

    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "error": self.message,
            })),
        )
            .into_response()
    }
}

type AppResult<T> = Result<T, AppError>;

pub fn router(config: SyncServerConfig) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/version", get(version))
        .route("/v1/auth/register", post(auth_register))
        .route("/v1/auth/login", post(auth_login))
        .route("/v1/auth/refresh", post(auth_refresh))
        .route("/v1/devices/register", post(devices_register))
        .route("/v1/devices/{device_id}/revoke", post(devices_revoke))
        .route("/v1/sync/bootstrap", post(sync_bootstrap))
        .route(
            "/v1/sync/push",
            post(sync_push).layer(DefaultBodyLimit::max(config.max_sync_push_body_bytes)),
        )
        .route("/v1/sync/pull", get(sync_pull))
        .route("/v1/sync/ack", post(sync_ack))
        .route("/v1/sync/conflicts", get(sync_conflicts))
        .route(
            "/v1/sync/conflicts/{id}/resolve",
            post(sync_conflict_resolve),
        )
        .route(
            "/v1/assets/{*key}",
            get(asset_download)
                .put(asset_upload)
                .layer(DefaultBodyLimit::max(config.max_asset_body_bytes)),
        )
        .with_state(config)
}

async fn healthz() -> Json<HealthResponse> {
    Json(HealthResponse { ok: true })
}

async fn readyz(State(config): State<SyncServerConfig>) -> AppResult<Json<HealthResponse>> {
    sqlx::query("SELECT 1")
        .execute(&config.database)
        .await
        .map_err(|error| AppError::internal(format!("PostgreSQL not ready: {error}")))?;
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("Redis not ready: {error}")))?;
    redis::cmd("PING")
        .query_async::<String>(&mut redis_conn)
        .await
        .map_err(|error| AppError::internal(format!("Redis ping failed: {error}")))?;
    Ok(Json(HealthResponse { ok: true }))
}

async fn version(State(config): State<SyncServerConfig>) -> Json<VersionResponse> {
    Json(VersionResponse {
        name: "guyantools-sync-server",
        version: config.version,
    })
}

async fn auth_register(
    State(config): State<SyncServerConfig>,
    Json(input): Json<AuthRequest>,
) -> AppResult<Json<AuthResponse>> {
    let email = required_trimmed(input.email, "email")?;
    let password = required_trimmed(input.password, "password")?;
    let user_id = Uuid::new_v4();
    let password_hash = hash_password(&password)?;
    let result = sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(email)
        .bind(password_hash)
        .execute(&config.database)
        .await;
    if let Err(error) = result {
        if is_unique_violation(&error) {
            return Err(AppError::conflict("email is already registered"));
        }
        return Err(AppError::internal(format!(
            "failed to register user: {error}"
        )));
    }
    issue_auth_response(&config, user_id).await
}

async fn auth_login(
    State(config): State<SyncServerConfig>,
    Json(input): Json<AuthRequest>,
) -> AppResult<Json<AuthResponse>> {
    let email = required_trimmed(input.email, "email")?;
    let password = required_trimmed(input.password, "password")?;
    let row = sqlx::query("SELECT id, password_hash FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(&config.database)
        .await
        .map_err(|error| AppError::internal(format!("failed to read user: {error}")))?;
    let row = row.ok_or_else(|| AppError::unauthorized("invalid email or password"))?;
    let password_hash: String = row.get("password_hash");
    if !verify_password(&password, &password_hash)? {
        return Err(AppError::unauthorized("invalid email or password"));
    }
    let user_id: Uuid = row.get("id");
    if is_legacy_secret_hash(&password_hash) {
        let upgraded_hash = hash_password(&password)?;
        sqlx::query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2")
            .bind(upgraded_hash)
            .bind(user_id)
            .execute(&config.database)
            .await
            .map_err(|error| AppError::internal(format!("failed to upgrade password hash: {error}")))?;
    }
    issue_auth_response(&config, user_id).await
}

async fn auth_refresh(
    State(config): State<SyncServerConfig>,
    Json(input): Json<AuthRequest>,
) -> AppResult<Json<AuthResponse>> {
    let refresh_token = required_trimmed(input.refresh_token, "refreshToken")?;
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("failed to connect Redis: {error}")))?;
    let user_id: Option<String> = redis_conn
        .get(format!("refresh:{refresh_token}"))
        .await
        .map_err(|error| AppError::internal(format!("failed to read refresh token: {error}")))?;
    let user_id = parse_uuid(
        user_id.ok_or_else(|| AppError::unauthorized("refresh token is expired"))?,
        "refresh token user",
    )?;
    issue_auth_response(&config, user_id).await
}

async fn devices_register(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Json(input): Json<RegisterDeviceRequest>,
) -> AppResult<Json<RegisterDeviceResponse>> {
    let auth = authenticate(&config, &headers, false).await?;
    let device_id = Uuid::new_v4();
    let device_token = format!("device_{}", Uuid::new_v4());
    let device_name = input
        .device_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "GuYanTools Device".to_string());
    let platform = input
        .platform
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    let token_hash = hash_secret(&device_token);

    sqlx::query(
        "INSERT INTO devices (id, user_id, device_name, platform, token_hash) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(device_id)
    .bind(auth.user_id)
    .bind(&device_name)
    .bind(&platform)
    .bind(token_hash)
    .execute(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to register device: {error}")))?;

    cache_device_token(&config, &device_token, auth.user_id, device_id).await?;

    Ok(Json(RegisterDeviceResponse {
        device_id: device_id.to_string(),
        device_token,
        device_name,
        platform,
    }))
}

async fn devices_revoke(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> AppResult<Json<Value>> {
    let auth = authenticate(&config, &headers, false).await?;
    let device_id = parse_uuid(device_id, "deviceId")?;
    let result = sqlx::query(
        "UPDATE devices SET revoked_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2",
    )
    .bind(device_id)
    .bind(auth.user_id)
    .execute(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to revoke device: {error}")))?;
    if result.rows_affected() == 0 {
        return Err(AppError::forbidden(
            "device does not belong to current user",
        ));
    }
    Ok(Json(json!({ "revoked": true, "deviceId": device_id })))
}

async fn sync_bootstrap(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    input: Option<Json<BootstrapRequest>>,
) -> AppResult<Json<BootstrapResponse>> {
    let auth = authenticate(&config, &headers, true).await?;
    let device_id = auth
        .device_id
        .ok_or_else(|| AppError::unauthorized("device required"))?;
    if let Some(input) = input {
        if let Some(request_device_id) = input.device_id.as_deref().filter(|value| !value.trim().is_empty()) {
            let request_device_id = parse_uuid(request_device_id.to_string(), "deviceId")?;
            if request_device_id != device_id {
                return Err(AppError::forbidden("device token does not match deviceId"));
            }
        }
    }
    let cursor = sqlx::query(
        "SELECT last_acked_seq FROM sync_cursors WHERE user_id = $1 AND device_id = $2",
    )
    .bind(auth.user_id)
    .bind(device_id)
    .fetch_optional(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to read cursor: {error}")))?
    .map(|row| row.get::<i64, _>("last_acked_seq"))
    .unwrap_or(0);
    Ok(Json(BootstrapResponse {
        server_time: now_millis(),
        cursor,
        collections: sync_collections(),
    }))
}

async fn sync_push(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Json(input): Json<SyncPushRequest>,
) -> AppResult<Json<SyncPushResponse>> {
    let auth = authenticate(&config, &headers, true).await?;
    let device_id = parse_uuid(input.device_id.clone(), "deviceId")?;
    if Some(device_id) != auth.device_id {
        return Err(AppError::forbidden("device token does not match deviceId"));
    }
    let op_id = input
        .op_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    reject_duplicate_sync_objects(&input.objects, input.tombstones.as_deref())?;

    if let Some(existing) = load_cached_client_op(&config, auth.user_id, device_id, &op_id).await? {
        return Ok(Json(existing));
    }

    let mut tx = config
        .database
        .begin()
        .await
        .map_err(|error| AppError::internal(format!("failed to begin transaction: {error}")))?;

    if let Some(existing) = load_client_op_from_tx(&mut tx, auth.user_id, device_id, &op_id).await?
    {
        cache_client_op(&config, auth.user_id, device_id, &op_id, &existing).await?;
        return Ok(Json(existing));
    }

    let mut accepted = 0i64;
    let mut seq = 0i64;
    let mut last_server_rev = format!("srv-0-{}", Uuid::new_v4());
    let mut observed_server_metadata: Option<(i64, String)> = None;
    let mut applied = Vec::new();
    let mut conflicts = Vec::new();
    for object in input
        .objects
        .into_iter()
        .chain(input.tombstones.unwrap_or_default())
    {
        let deleted = object.deleted.unwrap_or(false);
        let existing = sqlx::query(
            "SELECT server_rev, payload_json, deleted
             FROM sync_objects
             WHERE user_id = $1 AND collection = $2 AND object_id = $3
             FOR UPDATE",
        )
        .bind(auth.user_id)
        .bind(&object.collection)
        .bind(&object.object_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| AppError::internal(format!("failed to read current sync object: {error}")))?;

        if let Some(existing) = existing {
            let current_rev: String = existing.get("server_rev");
            if object.base_rev.as_deref() != Some(current_rev.as_str()) {
                observed_server_metadata = latest_push_metadata(
                    observed_server_metadata,
                    latest_object_server_seq(&mut tx, auth.user_id, &object.collection, &object.object_id).await?,
                    current_rev.clone(),
                );
                let conflict_id = Uuid::new_v4();
                let server_payload = existing.get("payload_json");
                let remote_deleted = existing.get("deleted");
                sqlx::query(
                    "INSERT INTO sync_conflicts
                     (id, user_id, collection, object_id, local_payload_json, remote_payload_json, status, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, 'pending', now())
                     ON CONFLICT (id) DO NOTHING",
                )
                .bind(conflict_id)
                .bind(auth.user_id)
                .bind(&object.collection)
                .bind(&object.object_id)
                .bind(&object.payload)
                .bind(&server_payload)
                .execute(&mut *tx)
                .await
                .map_err(|error| AppError::internal(format!("failed to record sync conflict: {error}")))?;
                conflicts.push(SyncPushConflict {
                    conflict_id: conflict_id.to_string(),
                    collection: object.collection,
                    object_id: object.object_id,
                    server_rev: current_rev,
                    server_payload,
                    attempted_payload: object.payload,
                    deleted: remote_deleted,
                });
                continue;
            }
        }

        let server_rev = format!("srv-{}-{}", now_millis(), Uuid::new_v4());
        sqlx::query(
            "INSERT INTO sync_objects (user_id, collection, object_id, server_rev, payload_json, deleted, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (user_id, collection, object_id)
             DO UPDATE SET server_rev = EXCLUDED.server_rev, payload_json = EXCLUDED.payload_json, deleted = EXCLUDED.deleted, updated_at = now()",
        )
        .bind(auth.user_id)
        .bind(&object.collection)
        .bind(&object.object_id)
        .bind(&server_rev)
        .bind(&object.payload)
        .bind(deleted)
        .execute(&mut *tx)
        .await
        .map_err(|error| AppError::internal(format!("failed to upsert sync object: {error}")))?;

        let op_row = sqlx::query(
            "INSERT INTO sync_ops (id, user_id, device_id, client_op_id, op_id, collection, object_id, op_kind, server_rev, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING server_seq",
        )
        .bind(Uuid::new_v4())
        .bind(auth.user_id)
        .bind(device_id)
        .bind(&op_id)
        .bind(format!("{}:{}", op_id, accepted))
        .bind(&object.collection)
        .bind(&object.object_id)
        .bind(if deleted { "delete" } else { "upsert" })
        .bind(&server_rev)
        .bind(&object.payload)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| AppError::internal(format!("failed to append sync op: {error}")))?;
        seq = op_row.get("server_seq");
        last_server_rev = server_rev;
        applied.push(SyncAppliedObject {
            collection: object.collection,
            object_id: object.object_id,
            server_rev: last_server_rev.clone(),
        });
        accepted += 1;
    }

    let metadata = finalize_push_response_metadata(seq, last_server_rev, observed_server_metadata);
    let response = SyncPushResponse {
        accepted,
        seq: metadata.seq,
        server_rev: metadata.server_rev,
        op_id: Some(op_id.clone()),
        applied,
        conflicts,
    };

    sqlx::query(
        "INSERT INTO sync_client_ops (user_id, device_id, op_id, accepted, seq, server_rev, response_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(auth.user_id)
    .bind(device_id)
    .bind(&op_id)
    .bind(response.accepted)
    .bind(response.seq)
    .bind(&response.server_rev)
    .bind(serde_json::to_value(&response).map_err(|error| {
        AppError::internal(format!("failed to encode client op response: {error}"))
    })?)
    .execute(&mut *tx)
    .await
    .map_err(|error| AppError::internal(format!("failed to record client op: {error}")))?;

    tx.commit()
        .await
        .map_err(|error| AppError::internal(format!("failed to commit sync push: {error}")))?;

    cache_client_op(&config, auth.user_id, device_id, &op_id, &response).await?;
    Ok(Json(response))
}

async fn sync_pull(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Query(query): Query<SyncPullQuery>,
) -> AppResult<Json<SyncPullResponse>> {
    let auth = authenticate(&config, &headers, true).await?;
    let since = query.since.unwrap_or(0);
    let limit = query.limit.unwrap_or(200).clamp(1, 1000);
    let collections = query.collections.map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>()
    });

    let rows = if let Some(collections) = collections {
        sqlx::query(
            "SELECT server_seq, server_rev, device_id, collection, object_id, payload_json, op_kind
             FROM sync_ops
             WHERE user_id = $1 AND server_seq > $2 AND collection = ANY($3)
             ORDER BY server_seq ASC
             LIMIT $4",
        )
        .bind(auth.user_id)
        .bind(since)
        .bind(collections)
        .bind(limit)
        .fetch_all(&config.database)
        .await
    } else {
        sqlx::query(
            "SELECT server_seq, server_rev, device_id, collection, object_id, payload_json, op_kind
             FROM sync_ops
             WHERE user_id = $1 AND server_seq > $2
             ORDER BY server_seq ASC
             LIMIT $3",
        )
        .bind(auth.user_id)
        .bind(since)
        .bind(limit)
        .fetch_all(&config.database)
        .await
    }
    .map_err(|error| AppError::internal(format!("failed to pull sync ops: {error}")))?;

    let objects = rows
        .into_iter()
        .map(|row| PulledSyncObject {
            seq: row.get("server_seq"),
            server_rev: row.get("server_rev"),
            device_id: row.get::<Uuid, _>("device_id").to_string(),
            collection: row.get("collection"),
            object_id: row.get("object_id"),
            payload: row.get("payload_json"),
            deleted: row.get::<String, _>("op_kind") == "delete",
        })
        .collect::<Vec<_>>();
    let cursor = objects.last().map(|object| object.seq).unwrap_or(since);
    Ok(Json(SyncPullResponse { cursor, objects }))
}

async fn sync_ack(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Json(input): Json<SyncAckRequest>,
) -> AppResult<Json<Value>> {
    let auth = authenticate(&config, &headers, true).await?;
    let device_id = parse_uuid(input.device_id.clone(), "deviceId")?;
    if Some(device_id) != auth.device_id {
        return Err(AppError::forbidden("device token does not match deviceId"));
    }
    sqlx::query(
        "INSERT INTO sync_cursors (user_id, device_id, last_acked_seq, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, device_id)
         DO UPDATE SET last_acked_seq = GREATEST(sync_cursors.last_acked_seq, EXCLUDED.last_acked_seq), updated_at = now()",
    )
    .bind(auth.user_id)
    .bind(device_id)
    .bind(input.cursor)
    .execute(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to ack cursor: {error}")))?;
    Ok(Json(
        json!({ "ok": true, "deviceId": input.device_id, "cursor": input.cursor }),
    ))
}

async fn sync_conflicts(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
) -> AppResult<Json<Value>> {
    let auth = authenticate(&config, &headers, true).await?;
    let rows = sqlx::query(
        "SELECT id, collection, object_id, status, created_at, resolved_at
         FROM sync_conflicts
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 200",
    )
    .bind(auth.user_id)
    .fetch_all(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to read conflicts: {error}")))?;
    let conflicts = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.get::<Uuid, _>("id").to_string(),
                "collection": row.get::<String, _>("collection"),
                "objectId": row.get::<String, _>("object_id"),
                "status": row.get::<String, _>("status"),
                "createdAt": row.get::<DateTime<Utc>, _>("created_at").to_rfc3339(),
                "resolvedAt": row.try_get::<DateTime<Utc>, _>("resolved_at").ok().map(|value| value.to_rfc3339()),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "conflicts": conflicts })))
}

async fn sync_conflict_resolve(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<ResolveConflictRequest>,
) -> AppResult<Json<Value>> {
    let auth = authenticate(&config, &headers, true).await?;
    let id = parse_uuid(id, "conflictId")?;
    let result = sqlx::query(
        "UPDATE sync_conflicts SET status = 'resolved', resolved_at = now() WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(auth.user_id)
    .execute(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to resolve conflict: {error}")))?;
    if result.rows_affected() == 0 {
        return Err(AppError::forbidden(
            "conflict does not belong to current user",
        ));
    }
    Ok(Json(
        json!({ "id": id, "status": "resolved", "resolution": input.resolution }),
    ))
}

async fn asset_upload(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Path(key): Path<String>,
    body: Bytes,
) -> AppResult<(StatusCode, Json<Value>)> {
    let auth = authenticate(&config, &headers, true).await?;
    let key = sanitize_asset_key(&key)?;
    let object_key = format!("{}/{}", auth.user_id, key);
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let sha256 = hash_bytes(&body);
    let byte_size = body.len() as i64;

    config
        .s3
        .put_object()
        .bucket(&config.s3_bucket)
        .key(&object_key)
        .content_type(&content_type)
        .body(ByteStream::from(body.to_vec()))
        .send()
        .await
        .map_err(|error| AppError::internal(format!("failed to upload asset: {error}")))?;

    sqlx::query(
        "INSERT INTO assets (user_id, asset_key, bucket, object_key, content_type, byte_size, sha256, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (user_id, asset_key)
         DO UPDATE SET bucket = EXCLUDED.bucket, object_key = EXCLUDED.object_key, content_type = EXCLUDED.content_type,
                       byte_size = EXCLUDED.byte_size, sha256 = EXCLUDED.sha256, updated_at = now()",
    )
    .bind(auth.user_id)
    .bind(&key)
    .bind(&config.s3_bucket)
    .bind(&object_key)
    .bind(&content_type)
    .bind(byte_size)
    .bind(&sha256)
    .execute(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to record asset metadata: {error}")))?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "key": key,
            "stored": true,
            "sha256": sha256,
            "byteSize": byte_size,
        })),
    ))
}

async fn asset_download(
    State(config): State<SyncServerConfig>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> AppResult<Response> {
    let auth = authenticate(&config, &headers, true).await?;
    let key = sanitize_asset_key(&key)?;
    let row = sqlx::query(
        "SELECT bucket, object_key, content_type FROM assets WHERE user_id = $1 AND asset_key = $2",
    )
    .bind(auth.user_id)
    .bind(&key)
    .fetch_optional(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to read asset metadata: {error}")))?;
    let row = row.ok_or_else(|| AppError {
        status: StatusCode::NOT_FOUND,
        message: "asset not found".to_string(),
    })?;
    let bucket: String = row.get("bucket");
    let object_key: String = row.get("object_key");
    let content_type: String = row.get("content_type");
    let output = config
        .s3
        .get_object()
        .bucket(bucket)
        .key(object_key)
        .send()
        .await
        .map_err(|error| AppError::internal(format!("failed to download asset: {error}")))?;
    let bytes = output
        .body
        .collect()
        .await
        .map_err(|error| AppError::internal(format!("failed to read asset stream: {error}")))?
        .into_bytes();
    Ok(([(header::CONTENT_TYPE, content_type)], bytes).into_response())
}

async fn authenticate(
    config: &SyncServerConfig,
    headers: &HeaderMap,
    require_device: bool,
) -> AppResult<AuthContext> {
    let token = bearer_token(headers)?;
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("failed to connect Redis: {error}")))?;
    let user_id: Option<String> = redis_conn
        .get(format!("access:{token}"))
        .await
        .map_err(|error| AppError::internal(format!("failed to read access token: {error}")))?;
    let user_id = parse_uuid(
        user_id.ok_or_else(|| AppError::unauthorized("access token is expired"))?,
        "access token user",
    )?;

    if !require_device {
        return Ok(AuthContext {
            user_id,
            device_id: None,
        });
    }

    let Some(device_token) = headers
        .get("x-guyantools-device-token")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
    else {
        return Err(AppError::unauthorized("device token is required"));
    };

    let cached: Option<String> = redis_conn
        .get(format!("device:{device_token}"))
        .await
        .map_err(|error| AppError::internal(format!("failed to read device token: {error}")))?;
    if let Some(value) = cached {
        let mut parts = value.split(':');
        let cached_user = parse_uuid(
            parts.next().unwrap_or_default().to_string(),
            "cached device user",
        )?;
        let cached_device = parse_uuid(
            parts.next().unwrap_or_default().to_string(),
            "cached device id",
        )?;
        if cached_user == user_id {
            ensure_device_active(config, user_id, cached_device).await?;
            return Ok(AuthContext {
                user_id,
                device_id: Some(cached_device),
            });
        }
        return Err(AppError::forbidden("device token belongs to another user"));
    }

    let token_hash = hash_secret(&device_token);
    let row = sqlx::query(
        "SELECT id FROM devices WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL",
    )
    .bind(user_id)
    .bind(token_hash)
    .fetch_optional(&config.database)
    .await
    .map_err(|error| AppError::internal(format!("failed to validate device token: {error}")))?;
    let row = row.ok_or_else(|| AppError::unauthorized("invalid device token"))?;
    let device_id: Uuid = row.get("id");
    cache_device_token(config, &device_token, user_id, device_id).await?;
    Ok(AuthContext {
        user_id,
        device_id: Some(device_id),
    })
}

async fn ensure_device_active(
    config: &SyncServerConfig,
    user_id: Uuid,
    device_id: Uuid,
) -> AppResult<()> {
    let row = sqlx::query("SELECT revoked_at IS NULL AS active FROM devices WHERE user_id = $1 AND id = $2")
        .bind(user_id)
        .bind(device_id)
        .fetch_optional(&config.database)
        .await
        .map_err(|error| AppError::internal(format!("failed to check device status: {error}")))?;
    let active = row
        .map(|row| row.get::<bool, _>("active"))
        .unwrap_or(false);
    if active {
        return Ok(());
    }
    Err(AppError::unauthorized("device is revoked"))
}

async fn issue_auth_response(
    config: &SyncServerConfig,
    user_id: Uuid,
) -> AppResult<Json<AuthResponse>> {
    let access_token = format!("access_{}", Uuid::new_v4());
    let refresh_token = format!("refresh_{}", Uuid::new_v4());
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("failed to connect Redis: {error}")))?;
    let _: () = redis_conn
        .set_ex(
            format!("access:{access_token}"),
            user_id.to_string(),
            ACCESS_TOKEN_TTL_SECONDS,
        )
        .await
        .map_err(|error| AppError::internal(format!("failed to cache access token: {error}")))?;
    let _: () = redis_conn
        .set_ex(
            format!("refresh:{refresh_token}"),
            user_id.to_string(),
            REFRESH_TOKEN_TTL_SECONDS,
        )
        .await
        .map_err(|error| AppError::internal(format!("failed to cache refresh token: {error}")))?;
    Ok(Json(AuthResponse {
        user_id: user_id.to_string(),
        access_token,
        refresh_token,
    }))
}

async fn cache_device_token(
    config: &SyncServerConfig,
    device_token: &str,
    user_id: Uuid,
    device_id: Uuid,
) -> AppResult<()> {
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("failed to connect Redis: {error}")))?;
    redis_conn
        .set_ex(
            format!("device:{device_token}"),
            format!("{user_id}:{device_id}"),
            DEVICE_TOKEN_TTL_SECONDS,
        )
        .await
        .map_err(|error| AppError::internal(format!("failed to cache device token: {error}")))
}

async fn load_cached_client_op(
    config: &SyncServerConfig,
    user_id: Uuid,
    device_id: Uuid,
    op_id: &str,
) -> AppResult<Option<SyncPushResponse>> {
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("failed to connect Redis: {error}")))?;
    let raw: Option<String> = redis_conn
        .get(format!("client-op:{user_id}:{device_id}:{op_id}"))
        .await
        .map_err(|error| AppError::internal(format!("failed to read cached client op: {error}")))?;
    raw.map(|value| {
        serde_json::from_str::<SyncPushResponse>(&value)
            .map_err(|error| AppError::internal(format!("failed to decode cached op: {error}")))
    })
    .transpose()
}

async fn cache_client_op(
    config: &SyncServerConfig,
    user_id: Uuid,
    device_id: Uuid,
    op_id: &str,
    response: &SyncPushResponse,
) -> AppResult<()> {
    let mut redis_conn = config
        .redis
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| AppError::internal(format!("failed to connect Redis: {error}")))?;
    let payload = serde_json::to_string(response)
        .map_err(|error| AppError::internal(format!("failed to encode client op: {error}")))?;
    redis_conn
        .set_ex(
            format!("client-op:{user_id}:{device_id}:{op_id}"),
            payload,
            ACCESS_TOKEN_TTL_SECONDS,
        )
        .await
        .map_err(|error| AppError::internal(format!("failed to cache client op: {error}")))
}

async fn load_client_op_from_tx(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    device_id: Uuid,
    op_id: &str,
) -> AppResult<Option<SyncPushResponse>> {
    let row = sqlx::query(
        "SELECT accepted, seq, server_rev, op_id, response_json FROM sync_client_ops WHERE user_id = $1 AND device_id = $2 AND op_id = $3",
    )
    .bind(user_id)
    .bind(device_id)
    .bind(op_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| AppError::internal(format!("failed to read client op: {error}")))?;
    if let Some(row) = row {
        if let Ok(response_json) = row.try_get::<Value, _>("response_json") {
            if !response_json.is_null() {
                return serde_json::from_value::<SyncPushResponse>(response_json)
                    .map(Some)
                    .map_err(|error| AppError::internal(format!("failed to decode client op response: {error}")));
            }
        }
        return Ok(Some(SyncPushResponse {
        accepted: row.get::<i32, _>("accepted") as i64,
        seq: row.get("seq"),
        server_rev: row.get("server_rev"),
        op_id: Some(row.get("op_id")),
        applied: Vec::new(),
        conflicts: Vec::new(),
        }));
    }
    Ok(None)
}

fn bearer_token(headers: &HeaderMap) -> AppResult<String> {
    let header_value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::unauthorized("Authorization bearer token is required"))?;
    header_value
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::unauthorized("Authorization bearer token is invalid"))
}

fn required_trimmed(value: Option<String>, field: &str) -> AppResult<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::bad_request(format!("{field} is required")))
}

fn parse_uuid(value: String, field: &str) -> AppResult<Uuid> {
    Uuid::parse_str(&value).map_err(|_| AppError::bad_request(format!("{field} is invalid")))
}

fn reject_duplicate_sync_objects(
    objects: &[SyncObjectRequest],
    tombstones: Option<&[SyncObjectRequest]>,
) -> AppResult<()> {
    let mut seen = HashSet::new();
    let supported_collections = sync_collections().into_iter().collect::<HashSet<_>>();
    for object in objects.iter().chain(tombstones.unwrap_or(&[]).iter()) {
        if !supported_collections.contains(object.collection.as_str()) {
            return Err(AppError::bad_request(format!(
                "unsupported sync collection: {}",
                object.collection
            )));
        }
        let key = (&object.collection, &object.object_id);
        if !seen.insert(key) {
            return Err(AppError::bad_request(format!(
                "duplicate sync object in push: {}:{}",
                object.collection, object.object_id
            )));
        }
    }
    Ok(())
}

struct PushResponseMetadata {
    seq: i64,
    server_rev: String,
}

fn finalize_push_response_metadata(
    accepted_seq: i64,
    accepted_server_rev: String,
    observed_server_metadata: Option<(i64, String)>,
) -> PushResponseMetadata {
    if accepted_seq > 0 {
        return PushResponseMetadata {
            seq: accepted_seq,
            server_rev: accepted_server_rev,
        };
    }

    if let Some((seq, server_rev)) = observed_server_metadata {
        return PushResponseMetadata { seq, server_rev };
    }

    PushResponseMetadata {
        seq: accepted_seq,
        server_rev: accepted_server_rev,
    }
}

fn latest_push_metadata(
    current: Option<(i64, String)>,
    candidate_seq: i64,
    candidate_rev: String,
) -> Option<(i64, String)> {
    if candidate_seq <= 0 {
        return current;
    }
    match current {
        Some((current_seq, _)) if current_seq >= candidate_seq => current,
        _ => Some((candidate_seq, candidate_rev)),
    }
}

async fn latest_object_server_seq(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    collection: &str,
    object_id: &str,
) -> AppResult<i64> {
    let row = sqlx::query(
        "SELECT COALESCE(MAX(server_seq), 0) AS server_seq
         FROM sync_ops
         WHERE user_id = $1 AND collection = $2 AND object_id = $3",
    )
    .bind(user_id)
    .bind(collection)
    .bind(object_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(|error| AppError::internal(format!("failed to read current sync object sequence: {error}")))?;
    Ok(row.get("server_seq"))
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .as_deref()
        == Some("23505")
}

fn hash_secret(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

fn hash_password(value: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(value.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::internal(format!("failed to hash password: {error}")))
}

fn verify_password(value: &str, expected_hash: &str) -> AppResult<bool> {
    if is_legacy_secret_hash(expected_hash) {
        return Ok(hash_secret(value) == expected_hash);
    }

    let parsed_hash = PasswordHash::new(expected_hash)
        .map_err(|_| AppError::unauthorized("invalid email or password"))?;
    Ok(Argon2::default()
        .verify_password(value.as_bytes(), &parsed_hash)
        .is_ok())
}

fn is_legacy_secret_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hash_bytes(value: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value);
    hex::encode(hasher.finalize())
}

fn sanitize_asset_key(value: &str) -> AppResult<String> {
    let key = value.trim().replace('\\', "/");
    if key.is_empty() || key.starts_with('/') || key.contains("..") {
        return Err(AppError::bad_request("asset key is invalid"));
    }
    Ok(key)
}

fn sync_collections() -> Vec<&'static str> {
    vec![
        "app.profile",
        "app.appearance",
        "app.bottom_bar",
        "app.shortcuts",
        "app.features",
        "knowledge.library",
        "knowledge.space",
        "knowledge.folder",
        "knowledge.page",
        "knowledge.asset",
        "knowledge.tag",
        "knowledge.link",
        "ai.assistant",
        "ai.provider",
        "ai.model_config",
    ]
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_password_with_argon2_and_verifies_it() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(hash.starts_with("$argon2"));
        assert!(verify_password("correct horse battery staple", &hash).unwrap());
        assert!(!verify_password("wrong password", &hash).unwrap());
    }

    #[test]
    fn verifies_legacy_sha256_password_hash() {
        let legacy_hash = hash_secret("old-password");
        assert!(is_legacy_secret_hash(&legacy_hash));
        assert!(verify_password("old-password", &legacy_hash).unwrap());
        assert!(!verify_password("new-password", &legacy_hash).unwrap());
    }

    #[test]
    fn rejects_invalid_asset_keys() {
        assert!(sanitize_asset_key("assets/hash.bin").is_ok());
        assert!(sanitize_asset_key("../secret.txt").is_err());
        assert!(sanitize_asset_key("/absolute.txt").is_err());
        assert!(sanitize_asset_key("nested\\..\\secret.txt").is_err());
    }

    #[test]
    fn rejects_unknown_sync_collection_in_push_objects() {
        let objects = vec![SyncObjectRequest {
            collection: "unknown.collection".to_string(),
            object_id: "object-a".to_string(),
            base_rev: None,
            payload: json!({ "value": 1 }),
            deleted: Some(false),
        }];

        assert!(reject_duplicate_sync_objects(&objects, None).is_err());
    }

    #[test]
    fn all_conflict_push_response_uses_observed_server_cursor_and_revision() {
        let metadata = finalize_push_response_metadata(
            0,
            "srv-0-temporary".to_string(),
            Some((42, "srv-current".to_string())),
        );

        assert_eq!(metadata.seq, 42);
        assert_eq!(metadata.server_rev, "srv-current");
    }
}
