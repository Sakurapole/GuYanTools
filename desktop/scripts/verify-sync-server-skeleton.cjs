const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const requiredFiles = [
  'sync_server/Cargo.toml',
  'sync_server/src/main.rs',
  'sync_server/src/config.rs',
  'sync_server/src/routes/mod.rs',
  'sync_server/migrations/001_initial.sql',
  'sync_server/README.md',
  'sync_server/scripts/deploy-ubuntu.sh',
  'desktop/src/main/sync/providers/sync_server_provider.ts',
  'desktop/src/main/sync/secret_sync_policy.ts',
  'desktop/scripts/smoke-sync-server-provider.cjs',
  'desktop/scripts/smoke-sync-server-two-device.cjs',
  'desktop/scripts/smoke-sync-server-live.cjs',
  'desktop/scripts/smoke-sync-service-client.cjs',
  'desktop/scripts/smoke-sync-service-live.cjs',
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error('Missing sync server skeleton files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const routes = fs.readFileSync(path.join(root, 'sync_server/src/routes/mod.rs'), 'utf8');
const config = fs.readFileSync(path.join(root, 'sync_server/src/config.rs'), 'utf8');
const cargo = fs.readFileSync(path.join(root, 'sync_server/Cargo.toml'), 'utf8');
const migrationsDir = path.join(root, 'sync_server/migrations');
const migration = fs.readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
  .join('\n');
const deploy = fs.readFileSync(path.join(root, 'sync_server/scripts/deploy-ubuntu.sh'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'sync_server/README.md'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'sync_server/scripts/smoke-local.ps1'), 'utf8');
const providerSmoke = fs.readFileSync(path.join(root, 'desktop/scripts/smoke-sync-server-provider.cjs'), 'utf8');
const twoDeviceSmoke = fs.readFileSync(path.join(root, 'desktop/scripts/smoke-sync-server-two-device.cjs'), 'utf8');
const liveSmoke = fs.readFileSync(path.join(root, 'desktop/scripts/smoke-sync-server-live.cjs'), 'utf8');
const serviceClientSmoke = fs.readFileSync(path.join(root, 'desktop/scripts/smoke-sync-service-client.cjs'), 'utf8');
const serviceLiveSmoke = fs.readFileSync(path.join(root, 'desktop/scripts/smoke-sync-service-live.cjs'), 'utf8');
for (const token of [
  '/healthz',
  '/readyz',
  '/version',
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/devices/register',
  '/v1/devices/{device_id}/revoke',
  '/v1/sync/bootstrap',
  '/v1/sync/push',
  '/v1/sync/pull',
  '/v1/sync/ack',
  '/v1/sync/conflicts',
  '/v1/sync/conflicts/{id}/resolve',
  '/v1/assets/{*key}',
]) {
  if (!routes.includes(token)) {
    console.error(`Missing sync server route: ${token}`);
    process.exit(1);
  }
}

for (const token of [
  'PgPoolOptions',
  'sqlx::migrate!',
  'redis::Client',
  'S3Client',
  'ensure_bucket',
]) {
  if (!config.includes(token)) {
    console.error(`Sync server config is not wired to real infrastructure: ${token}`);
    process.exit(1);
  }
}

for (const token of [
  'aws-sdk-s3',
  'argon2',
  'redis',
  'sha2',
]) {
  if (!cargo.includes(token)) {
    console.error(`Missing sync server dependency: ${token}`);
    process.exit(1);
  }
}

for (const token of [
  'sync_client_ops',
  'response_json',
  'assets',
  'token_hash',
  'idx_sync_ops_user_seq',
]) {
  if (!migration.includes(token)) {
    console.error(`Missing persistent sync table or index: ${token}`);
    process.exit(1);
  }
}

for (const token of [
  'authenticate(&config, &headers, true)',
  'hash_password(&password)?',
  'verify_password(&password, &password_hash)?',
  'is_legacy_secret_hash',
  'failed to upgrade password hash',
  'if !require_device',
  'ensure_device_active(config, user_id, cached_device).await?',
  'device is revoked',
  'BootstrapRequest',
  'input.device_id',
  'device token does not match deviceId',
  'X-GuYanTools-Device-Token'.toLowerCase(),
  'base_rev',
  'FOR UPDATE',
  'SyncPushConflict',
  'SyncAppliedObject',
  'applied.push',
  'server_payload',
  'attempted_payload',
  'failed to record sync conflict',
  'put_object()',
  'get_object()',
  'sync_client_ops',
  'server_rev',
]) {
  if (!routes.toLowerCase().includes(token.toLowerCase())) {
    console.error(`Missing real sync server behavior: ${token}`);
    process.exit(1);
  }
}

console.log('Sync server persistent backend surface verified.');

for (const token of [
  'apt-get update',
  'docker compose',
  'postgres:16',
  'redis:7',
  'minio/minio',
  'cargo build --release',
  'systemctl enable guyantools-sync-server',
  'systemctl restart guyantools-sync-server',
  'install-deps',
  'write-config',
  'start-deps',
  'wait-deps',
  'install-service',
  'start-service',
  'diagnose',
  'INSTALL_DIR=/www/sync-server-runtime',
  'DATA_DIR=/www/sync-server-runtime/data',
  "curl --noproxy '*'",
  'local bind_port="${BIND_ADDR##*:}"',
  'local url="http://127.0.0.1:${bind_port}/readyz"',
  '/etc/guyantools-sync-server.env',
  '/readyz',
]) {
  if (!deploy.includes(token)) {
    console.error(`Missing Ubuntu deploy behavior: ${token}`);
    process.exit(1);
  }
}

console.log('Sync server Ubuntu deployment script verified.');

for (const token of [
  '80/tcp',
  '443/tcp',
  '38420/tcp',
  'PostgreSQL, Redis, and MinIO should stay private',
  'reverse_proxy 127.0.0.1:38420',
  'https://sync.example.com',
  'http://<server-ip>:38420',
  '/www/sync-server-runtime',
  'INSTALL_DIR=/www/sync-server-runtime',
  'Do not enter PostgreSQL, Redis, or MinIO ports in the app',
  '登录并绑定当前设备',
  'The backend returns an access token, refresh token, device ID, and device token',
  'you do not need to manually create or copy an access token or device token',
  'Step-By-Step Deployment',
  'curl: (52) Empty reply from server',
  "curl --noproxy '*' -fsS http://127.0.0.1:38420/readyz",
  'journalctl -u guyantools-sync-server --no-pager -n 120',
]) {
  if (!readme.includes(token)) {
    console.error(`Missing sync server deployment documentation: ${token}`);
    process.exit(1);
  }
}

console.log('Sync server deployment documentation verified.');

for (const token of [
  'deviceId = $device.deviceId',
  '$wrongDeviceId = [guid]::NewGuid().ToString()',
  'Expected bootstrap with mismatched deviceId to fail',
  'StatusCode -ne 403',
  '$pullAfterAck = Invoke-RestMethod',
  'pull after ack returned already acknowledged objects',
  'baseRev = \'stale-rev\'',
  'batch push did not return per-object revisions',
  'batch update with per-object baseRev should succeed',
  'Expected duplicate object push to fail',
  'Expected unknown collection push to fail',
  'unknown collection push returned unexpected status',
  'stale push retry was not idempotent',
  'stale push was not rejected as a conflict',
  'all-conflict push did not return current server cursor/revision',
  'server did not persist stale push conflict',
  '/v1/sync/conflicts/$($serverConflict.id)/resolve',
  'server conflict persisted status is not resolved',
  'resolvedConflictStatus = $resolvedConflict.status',
  'conflictCount = $stalePush.conflicts.Count',
  "/v1/devices/$($device.deviceId)/revoke",
  'Expected bootstrap with revoked device to fail',
  'StatusCode -ne 401',
]) {
  if (!smoke.includes(token)) {
    console.error(`Missing sync server smoke coverage: ${token}`);
    process.exit(1);
  }
}

console.log('Sync server local smoke authorization coverage verified.');

for (const token of [
  'GUYANTOOLS_SYNC_BASE_URL',
  "require('ts-node/register/transpile-only')",
  "require('../src/main/sync/providers/sync_server_provider')",
  'SyncServerProvider.loginOrRegister',
  'createSyncServerUrl',
  'usedRealProvider: true',
  'provider.testConnection()',
  'provider.push',
  'pullProvider.pull()',
  'pullProvider.ack',
  'invalidAccessProvider',
  'refreshedTokens',
  'stalePush.conflicts.length',
  'provider.uploadAsset',
  'provider.downloadAsset',
  'provider.revokeDevice',
  'HTTP 401',
]) {
  if (!providerSmoke.includes(token)) {
    console.error(`Missing desktop sync server provider smoke behavior: ${token}`);
    process.exit(1);
  }
}

const desktopPackage = fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8');
if (!desktopPackage.includes('"smoke:sync-server-provider": "node scripts/smoke-sync-server-provider.cjs"')) {
  console.error('Missing desktop sync server provider smoke script registration.');
  process.exit(1);
}
if (!desktopPackage.includes('"smoke:sync-server-two-device": "node scripts/smoke-sync-server-two-device.cjs"')) {
  console.error('Missing desktop sync server two-device smoke script registration.');
  process.exit(1);
}
if (!desktopPackage.includes('"smoke:sync-server-live": "node scripts/smoke-sync-server-live.cjs"')) {
  console.error('Missing desktop sync server live smoke script registration.');
  process.exit(1);
}
if (!desktopPackage.includes('"smoke:sync-service-live": "node scripts/smoke-sync-service-live.cjs"')) {
  console.error('Missing desktop sync service live smoke script registration.');
  process.exit(1);
}

console.log('Desktop sync server provider live smoke coverage verified.');

for (const token of [
  "require('ts-node/register/transpile-only')",
  'SyncServerProvider.loginOrRegister',
  'Desktop Smoke Device A',
  'Desktop Smoke Device B',
  'assert.notEqual(deviceA.deviceId, deviceB.deviceId)',
  "'app.profile'",
  "'app.appearance'",
  "'knowledge.library'",
  "'knowledge.page'",
  "'ai.provider'",
  "'ai.assistant'",
  'assertNoSecretFields',
  'sameNameLocalLibrary',
  'Device B same-name library',
  'providerA.uploadAsset',
  'providerB.downloadAsset',
  'stalePush.conflicts.length',
  'serverPayload.profileName',
  'attemptedPayload.profileName',
  'two-device-sync-server',
]) {
  if (!twoDeviceSmoke.includes(token)) {
    console.error(`Missing two-device sync server smoke behavior: ${token}`);
    process.exit(1);
  }
}

console.log('Desktop sync server two-device smoke coverage verified.');

for (const token of [
  "spawn('cargo', ['run', '--manifest-path', 'sync_server/Cargo.toml']",
  'waitReady(endpoint, serverProcess)',
  "runNodeScript('smoke-sync-server-provider.cjs', endpoint)",
  "runNodeScript('smoke-sync-server-two-device.cjs', endpoint)",
  'GUYANTOOLS_SYNC_BASE_URL: endpoint',
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ENDPOINT',
  'serverProcess.kill()',
]) {
  if (!liveSmoke.includes(token)) {
    console.error(`Missing sync server live smoke orchestration behavior: ${token}`);
    process.exit(1);
  }
}

console.log('Desktop sync server live smoke orchestration verified.');

for (const token of [
  'installModuleMocks',
  "if (request === 'electron')",
  'getPath(name)',
  "name === 'userData'",
  'dbManager.initialize',
  'appConfigManager.initialize',
  'syncService.initialize',
  'syncService.loginSyncServer',
  'syncService.syncNow',
  'createKnowledgeLibrary',
  'createKnowledgePage',
  'createKnowledgeAsset',
  'apiKey: \'must-not-sync\'',
  'assertDeviceBReceivedRemoteData',
  'syncedProvider.apiKey, undefined',
  'syncedProvider.enabled, false',
  'syncService.listConflicts',
  'conflictsAfterFirstPull',
  'expected first pull to accept remote baseline without local-default conflicts',
  'device-a-update',
  'device-b-conflict',
  'syncService.resolveConflict',
  'expected no app.appearance conflict after re-sync',
]) {
  if (!serviceClientSmoke.includes(token)) {
    console.error(`Missing sync service client smoke behavior: ${token}`);
    process.exit(1);
  }
}

for (const token of [
  "spawn('cargo', ['run', '--manifest-path', 'sync_server/Cargo.toml']",
  "runClient('device-a-initial'",
  "runClient('device-b-baseline'",
  "runClient('device-a-update'",
  "runScenario('use-remote', endpoint)",
  "runScenario('use-local', endpoint)",
  "device-b-use-local",
  "device-b-conflict",
  'GUYANTOOLS_SMOKE_USER_DATA',
  'GUYANTOOLS_SMOKE_EMAIL',
  'GUYANTOOLS_SMOKE_MARKER',
  'serverProcess.kill()',
]) {
  if (!serviceLiveSmoke.includes(token)) {
    console.error(`Missing sync service live smoke orchestration behavior: ${token}`);
    process.exit(1);
  }
}

console.log('Desktop sync service live smoke coverage verified.');

for (const token of [
  'hashes_password_with_argon2_and_verifies_it',
  'verifies_legacy_sha256_password_hash',
  'rejects_invalid_asset_keys',
]) {
  if (!routes.includes(token)) {
    console.error(`Missing sync server unit test coverage: ${token}`);
    process.exit(1);
  }
}

console.log('Sync server unit test coverage verified.');
