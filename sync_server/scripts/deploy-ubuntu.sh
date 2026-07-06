#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="guyantools-sync-server"
ACTION="${1:-all}"
APP_USER="${APP_USER:-guyantools-sync}"
INSTALL_DIR="${INSTALL_DIR:-/opt/guyantools-sync-server}"
DATA_DIR="${DATA_DIR:-/var/lib/guyantools-sync-server}"
ENV_FILE="${ENV_FILE:-/etc/guyantools-sync-server.env}"
SERVICE_FILE="${SERVICE_FILE:-/etc/systemd/system/guyantools-sync-server.service}"
COMPOSE_FILE="${COMPOSE_FILE:-${INSTALL_DIR}/docker-compose.yml}"

existing_env_value() {
  local key="$1"
  local line
  if [[ ! -r "${ENV_FILE}" ]]; then
    return 1
  fi
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  if [[ -z "${line}" ]]; then
    return 1
  fi
  printf '%s' "${line#*=}"
}

postgres_password_from_url() {
  local url="$1"
  printf '%s' "${url}" | sed -n 's#^postgres://[^:]*:\([^@]*\)@.*#\1#p'
}

INPUT_DATABASE_URL="${DATABASE_URL:-}"
INPUT_POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
EXISTING_DATABASE_URL="$(existing_env_value DATABASE_URL || true)"
EXISTING_POSTGRES_PASSWORD="$(existing_env_value POSTGRES_PASSWORD || true)"
EXISTING_S3_SECRET_ACCESS_KEY="$(existing_env_value S3_SECRET_ACCESS_KEY || true)"
EXISTING_MINIO_ROOT_PASSWORD="$(existing_env_value MINIO_ROOT_PASSWORD || true)"

BIND_ADDR="${BIND_ADDR:-127.0.0.1:38420}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:38420}"

POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16}"
POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-5430}"
POSTGRES_DB="${POSTGRES_DB:-guyantools_sync}"
POSTGRES_USER="${POSTGRES_USER:-guyantools}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${EXISTING_POSTGRES_PASSWORD}}"
if [[ -z "${POSTGRES_PASSWORD}" && -n "${EXISTING_DATABASE_URL}" ]]; then
  POSTGRES_PASSWORD="$(postgres_password_from_url "${EXISTING_DATABASE_URL}")"
fi
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}"

REDIS_IMAGE="${REDIS_IMAGE:-redis:7}"
REDIS_HOST_PORT="${REDIS_HOST_PORT:-6379}"

MINIO_IMAGE="${MINIO_IMAGE:-minio/minio:latest}"
MINIO_API_PORT="${MINIO_API_PORT:-9000}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9001}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-guyantools}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-${EXISTING_MINIO_ROOT_PASSWORD:-${EXISTING_S3_SECRET_ACCESS_KEY}}}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(openssl rand -hex 24)}"
S3_BUCKET="${S3_BUCKET:-guyantools-sync-assets}"
S3_REGION="${S3_REGION:-us-east-1}"
GUYANTOOLS_SYNC_MAX_ASSET_BYTES="${GUYANTOOLS_SYNC_MAX_ASSET_BYTES:-104857600}"
GUYANTOOLS_SYNC_MAX_PUSH_BYTES="${GUYANTOOLS_SYNC_MAX_PUSH_BYTES:-33554432}"

if [[ -n "${INPUT_DATABASE_URL}" ]]; then
  DATABASE_URL="${INPUT_DATABASE_URL}"
elif [[ -n "${EXISTING_DATABASE_URL}" && -z "${INPUT_POSTGRES_PASSWORD}" ]]; then
  DATABASE_URL="${EXISTING_DATABASE_URL}"
else
  DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${POSTGRES_DB}"
fi
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:${REDIS_HOST_PORT}/}"
S3_ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:${MINIO_API_PORT}}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must run as root. Use: sudo bash sync_server/scripts/deploy-ubuntu.sh" >&2
    exit 1
  fi
}

require_ubuntu() {
  if [[ ! -r /etc/os-release ]]; then
    echo "Cannot detect OS: /etc/os-release is missing." >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    echo "This deployment script targets Ubuntu. Detected: ${PRETTY_NAME:-unknown}." >&2
    exit 1
  fi
}

repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/../.." && pwd
}

ensure_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
  mkdir -p "${INSTALL_DIR}" "${DATA_DIR}/postgres" "${DATA_DIR}/redis" "${DATA_DIR}/minio"
  chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"
}

write_compose_file() {
  cat >"${COMPOSE_FILE}" <<EOF
services:
  postgres:
    image: ${POSTGRES_IMAGE}
    container_name: guyantools-sync-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "127.0.0.1:${POSTGRES_HOST_PORT}:5432"
    volumes:
      - ${DATA_DIR}/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: ${REDIS_IMAGE}
    container_name: guyantools-sync-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "127.0.0.1:${REDIS_HOST_PORT}:6379"
    volumes:
      - ${DATA_DIR}/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10

  minio:
    image: ${MINIO_IMAGE}
    container_name: guyantools-sync-minio
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - "127.0.0.1:${MINIO_API_PORT}:9000"
      - "127.0.0.1:${MINIO_CONSOLE_PORT}:9001"
    volumes:
      - ${DATA_DIR}/minio:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://127.0.0.1:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 10
EOF
}

write_env_file() {
  umask 077
  cat >"${ENV_FILE}" <<EOF
GUYANTOOLS_SYNC_BIND=${BIND_ADDR}
DATABASE_URL=${DATABASE_URL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_URL=${REDIS_URL}
S3_ENDPOINT=${S3_ENDPOINT}
S3_ACCESS_KEY_ID=${MINIO_ROOT_USER}
S3_SECRET_ACCESS_KEY=${MINIO_ROOT_PASSWORD}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
S3_BUCKET=${S3_BUCKET}
S3_REGION=${S3_REGION}
GUYANTOOLS_SYNC_MAX_ASSET_BYTES=${GUYANTOOLS_SYNC_MAX_ASSET_BYTES}
GUYANTOOLS_SYNC_MAX_PUSH_BYTES=${GUYANTOOLS_SYNC_MAX_PUSH_BYTES}
PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
EOF
}

build_binary() {
  local root
  root="$(repo_root)"
  cd "${root}"
  if [[ -r "${HOME}/.cargo/env" ]]; then
    # shellcheck disable=SC1090
    source "${HOME}/.cargo/env"
  fi
  cargo build --release --manifest-path sync_server/Cargo.toml
  install -m 0755 sync_server/target/release/guyantools-sync-server "${INSTALL_DIR}/${APP_NAME}"
}

write_systemd_unit() {
  cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=GuYanTools Sync Server
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
EnvironmentFile=${ENV_FILE}
ExecStart=${INSTALL_DIR}/${APP_NAME}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF
}

start_dependencies() {
  systemctl enable --now docker
  docker compose -f "${COMPOSE_FILE}" up -d
}

wait_deps() {
  local deadline=$((SECONDS + 180))
  until container_healthy guyantools-sync-postgres \
    && container_healthy guyantools-sync-redis \
    && container_healthy guyantools-sync-minio; do
    if (( SECONDS >= deadline )); then
      echo "Dependency containers did not become healthy in time." >&2
      docker compose -f "${COMPOSE_FILE}" ps >&2 || true
      exit 1
    fi
    sleep 2
  done
}

container_healthy() {
  local name="$1"
  local status
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${name}" 2>/dev/null || true)"
  [[ "${status}" == "healthy" || "${status}" == "running" ]]
}

start_service() {
  systemctl daemon-reload
  systemctl enable guyantools-sync-server
  systemctl restart guyantools-sync-server
}

wait_ready() {
  local bind_port="${BIND_ADDR##*:}"
  local url="http://127.0.0.1:${bind_port}/readyz"
  local deadline=$((SECONDS + 90))
  until curl --noproxy '*' -fsS "${url}" >/dev/null; do
    if (( SECONDS >= deadline )); then
      echo "Service did not become ready: ${url}" >&2
      journalctl -u guyantools-sync-server --no-pager -n 80 >&2 || true
      exit 1
    fi
    sleep 2
  done
}

diagnose() {
  echo "== systemd =="
  systemctl status guyantools-sync-server --no-pager || true
  echo
  echo "== journal =="
  journalctl -u guyantools-sync-server --no-pager -n 120 || true
  echo
  echo "== compose ps =="
  docker compose -f "${COMPOSE_FILE}" ps || true
  echo
  local bind_port="${BIND_ADDR##*:}"
  echo "== port ${bind_port} =="
  ss -ltnp "( sport = :${bind_port} )" || true
  echo
  echo "== readyz =="
  curl --noproxy '*' -v "http://${BIND_ADDR}/readyz" || true
}

print_summary() {
  local bind_port="${BIND_ADDR##*:}"
  cat <<EOF
GuYanTools sync server deployed.

Service:
  systemctl status guyantools-sync-server
  journalctl -u guyantools-sync-server -f

Health:
  curl --noproxy '*' -fsS http://127.0.0.1:${bind_port}/readyz

Config:
  ${ENV_FILE}

Local dependencies:
  docker compose -f ${COMPOSE_FILE} ps

Public URL:
  ${PUBLIC_BASE_URL}

Note:
  This script binds PostgreSQL, Redis, and MinIO to 127.0.0.1 only.
  Configure Nginx/Caddy and HTTPS separately if the service must be public.
EOF
}

usage() {
  cat <<EOF
Usage:
  sudo bash sync_server/scripts/deploy-ubuntu.sh [step]

  Steps:
  write-config      Create app user, directories, compose file, and env file.
  build             Build and install the release binary.
  start-deps        Start PostgreSQL, Redis, and MinIO with docker compose.
  wait-deps         Wait for dependency containers to become healthy.
  install-service   Write and enable the systemd unit.
  start-service     Start or restart the sync server service.
  check             Check /readyz.
  diagnose          Show service, journal, compose, port, and curl evidence.
  summary           Print service and config locations.
  all               Run all steps in order.

Common environment overrides:
  INSTALL_DIR=/www/sync-server-runtime
  DATA_DIR=/www/sync-server-runtime/data
  BIND_ADDR=127.0.0.1:38420
  PUBLIC_BASE_URL=https://sync.example.com
  GUYANTOOLS_SYNC_MAX_ASSET_BYTES=104857600
  GUYANTOOLS_SYNC_MAX_PUSH_BYTES=33554432
  POSTGRES_PASSWORD=<strong-password>
  MINIO_ROOT_PASSWORD=<strong-password>
EOF
}

main() {
  if [[ "${ACTION}" == "help" || "${ACTION}" == "--help" || "${ACTION}" == "-h" ]]; then
    usage
    return
  fi

  require_root
  require_ubuntu

  case "${ACTION}" in
    write-config)
      ensure_user
      write_compose_file
      write_env_file
      ;;
    build)
      ensure_user
      build_binary
      ;;
    start-deps)
      start_dependencies
      ;;
    wait-deps)
      wait_deps
      ;;
    install-service)
      ensure_user
      write_systemd_unit
      systemctl daemon-reload
      systemctl enable guyantools-sync-server
      ;;
    start-service)
      systemctl restart guyantools-sync-server
      ;;
    check)
      wait_ready
      ;;
    diagnose)
      diagnose
      ;;
    summary)
      print_summary
      ;;
    all)
      ensure_user
      write_compose_file
      write_env_file
      build_binary
      write_systemd_unit
      start_dependencies
      wait_deps
      start_service
      wait_ready
      print_summary
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
