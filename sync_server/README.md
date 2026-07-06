# GuYanTools Sync Server Deployment

This backend is designed to run behind HTTPS. PostgreSQL, Redis, and MinIO should stay private on the server.

## Public Ports

Recommended public exposure:

| Port | Public | Purpose |
| --- | --- | --- |
| 80/tcp | Yes | HTTP challenge and redirect to HTTPS. |
| 443/tcp | Yes | Public sync API through Nginx/Caddy reverse proxy. |
| 38420/tcp | No by default | Raw sync server. Keep bound to `127.0.0.1` when using HTTPS proxy. |
| 5430/tcp | No | PostgreSQL container port, bound to `127.0.0.1`. |
| 6379/tcp | No | Redis container port, bound to `127.0.0.1`. |
| 9000/tcp | No | MinIO S3 API, bound to `127.0.0.1`; sync server accesses it locally. |
| 9001/tcp | No | MinIO console, bound to `127.0.0.1`; expose only through SSH tunnel or VPN. |

For a minimal public deployment, open only `80` and `443`.

## Domain And HTTPS

Point a DNS record such as `sync.example.com` to the Ubuntu server IP.

Recommended Caddy setup:

```caddyfile
sync.example.com {
  reverse_proxy 127.0.0.1:38420
}
```

Caddy will request and renew HTTPS certificates automatically.

Nginx example:

```nginx
server {
  listen 80;
  server_name sync.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name sync.example.com;

  ssl_certificate /etc/letsencrypt/live/sync.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/sync.example.com/privkey.pem;

  location / {
    client_max_body_size 100m;
    proxy_pass http://127.0.0.1:38420;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

For Nginx, `client_max_body_size` must be large enough for the biggest knowledge asset. If it stays at the default value, large uploads may fail with HTTP 413.
The sync server also enforces its own asset request body limit through `GUYANTOOLS_SYNC_MAX_ASSET_BYTES`, which defaults to `104857600` bytes (100 MiB). Keep the reverse proxy limit and this environment variable aligned.

If you use Nginx, issue certificates with Certbot or another ACME client before enabling the HTTPS server block.

## App Configuration

Use one of these forms in the app's self-hosted sync provider setting:

```text
https://sync.example.com
```

or, for LAN/testing only:

```text
http://<server-ip>:38420
```

Use the domain + HTTPS form for internet sync. Do not enter PostgreSQL, Redis, or MinIO ports in the app. The app talks only to the sync server HTTP API.

In the app, the recommended flow is:

```text
Settings -> Sync Center -> Self-hosted backend
1. Enter the service URL.
2. Enter account email and password.
3. Click "登录并绑定当前设�?.
```

The backend returns an access token, refresh token, device ID, and device token after login and device registration. The app saves these locally through its sync secret store. In normal use you do not need to manually create or copy an access token or device token. Manual token fields are only for recovery or advanced debugging.

If using direct IP + port for testing, set the server bind address to a non-loopback address before starting the service:

```bash
sudo BIND_ADDR=0.0.0.0:38420 bash sync_server/scripts/deploy-ubuntu.sh all
```

Then open `38420/tcp` in the firewall. This is useful for testing but not recommended for long-term public deployment.
Even when the service binds to `0.0.0.0:38420`, run local health checks against `127.0.0.1:38420` on the server.

## One-Step Deployment

From the repository root on Ubuntu:

```bash
sudo PUBLIC_BASE_URL=https://sync.example.com bash sync_server/scripts/deploy-ubuntu.sh all
```

The script creates:

```text
/opt/guyantools-sync-server/guyantools-sync-server
/opt/guyantools-sync-server/docker-compose.yml
/etc/guyantools-sync-server.env
/etc/systemd/system/guyantools-sync-server.service
/var/lib/guyantools-sync-server/
```

To place the runtime under a custom directory such as `/www/sync-server-runtime`, set both `INSTALL_DIR` and `DATA_DIR`:

```bash
sudo INSTALL_DIR=/www/sync-server-runtime \
  DATA_DIR=/www/sync-server-runtime/data \
  PUBLIC_BASE_URL=https://sync.example.com \
  bash sync_server/scripts/deploy-ubuntu.sh all
```

With this layout, the script creates:

```text
/www/sync-server-runtime/guyantools-sync-server
/www/sync-server-runtime/docker-compose.yml
/www/sync-server-runtime/data/postgres
/www/sync-server-runtime/data/redis
/www/sync-server-runtime/data/minio
```

## Step-By-Step Deployment

Use these commands when you want to inspect each stage:

```bash
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data PUBLIC_BASE_URL=https://sync.example.com bash sync_server/scripts/deploy-ubuntu.sh write-config
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data bash sync_server/scripts/deploy-ubuntu.sh build
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data bash sync_server/scripts/deploy-ubuntu.sh start-deps
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data bash sync_server/scripts/deploy-ubuntu.sh wait-deps
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data bash sync_server/scripts/deploy-ubuntu.sh install-service
sudo bash sync_server/scripts/deploy-ubuntu.sh start-service
sudo bash sync_server/scripts/deploy-ubuntu.sh check
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data bash sync_server/scripts/deploy-ubuntu.sh summary
sudo INSTALL_DIR=/www/sync-server-runtime DATA_DIR=/www/sync-server-runtime/data bash sync_server/scripts/deploy-ubuntu.sh diagnose
```

Useful diagnostics:

```bash
systemctl status guyantools-sync-server
journalctl -u guyantools-sync-server -f
docker compose -f /opt/guyantools-sync-server/docker-compose.yml ps
curl -fsS http://127.0.0.1:38420/readyz
```

If `curl -fsS http://127.0.0.1:38420/readyz` returns `curl: (52) Empty reply from server`, run:

```bash
sudo bash sync_server/scripts/deploy-ubuntu.sh diagnose
```

Then check:

1. `systemctl status guyantools-sync-server`
2. `journalctl -u guyantools-sync-server --no-pager -n 120`
3. `docker compose -f /opt/guyantools-sync-server/docker-compose.yml ps`
4. `ss -ltnp '( sport = :38420 )'`

If the service is bound behind Caddy or Nginx, curl the local upstream on `127.0.0.1:38420` first, then test the public HTTPS domain.

If the verbose output shows `ALL_PROXY`, `HTTP_PROXY`, or `HTTPS_PROXY`, bypass the proxy for local checks:

```bash
curl --noproxy '*' -fsS http://127.0.0.1:38420/readyz
```

or set `NO_PROXY` for the current shell:

```bash
export NO_PROXY=127.0.0.1,localhost
curl -fsS http://127.0.0.1:38420/readyz
```

For the `/www/sync-server-runtime` layout, replace the compose path with:

```bash
docker compose -f /www/sync-server-runtime/docker-compose.yml ps
```
