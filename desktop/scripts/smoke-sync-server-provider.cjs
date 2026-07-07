const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'CommonJS',
  moduleResolution: 'Node',
});
require('ts-node/register/transpile-only');

const desktopRoot = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.join(desktopRoot, 'src', request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  SyncServerProvider,
  createSyncServerUrl,
} = require('../src/main/sync/providers/sync_server_provider');

const baseUrl = normalizeEndpoint(process.env.GUYANTOOLS_SYNC_BASE_URL || 'http://127.0.0.1:38420');

async function main() {
  assert.equal(createSyncServerUrl(`${baseUrl}nested/base/`, '/v1/version').toString(), `${baseUrl}nested/base/v1/version`);
  await assertSyncServerReady(baseUrl);

  const email = `desktop-provider-${randomUUID().replace(/-/g, '')}@example.local`;
  const password = 'provider-smoke-password';
  const login = await SyncServerProvider.loginOrRegister({
    endpoint: baseUrl,
    email,
    password,
    deviceName: 'Desktop Provider Smoke A',
    platform: currentPlatformKey(),
  });
  assert.ok(login.accessToken);
  assert.ok(login.refreshToken);
  assert.ok(login.deviceToken);

  const refreshedTokens = [];
  const provider = new SyncServerProvider({
    endpoint: baseUrl,
    deviceId: login.deviceId,
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    deviceToken: login.deviceToken,
    onTokensRefreshed: (tokens) => refreshedTokens.push(tokens),
  });

  const connection = await provider.testConnection();
  assert.equal(connection.ok, true);

  const objectId = `profile-provider-${randomUUID()}`;
  const firstPush = await provider.push({
    deviceId: login.deviceId,
    profiles: [createEnvelope('app.profile', objectId, login.deviceId, { profileName: 'Provider A', updatedAt: 1 })],
    objects: [],
    tombstones: [],
  });
  assert.equal(firstPush.pushed, 1);
  assert.equal(firstPush.applied.length, 1);

  const pullProvider = new SyncServerProvider({
    endpoint: baseUrl,
    deviceId: login.deviceId,
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    deviceToken: login.deviceToken,
    cursor: 0,
  });
  const pulled = await pullProvider.pull();
  assert.ok(pulled.objects.some((object) => object.objectId === objectId));
  await pullProvider.ack(pulled.cursor || 0);
  const afterAck = await new SyncServerProvider({
    endpoint: baseUrl,
    deviceId: login.deviceId,
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    deviceToken: login.deviceToken,
    cursor: pulled.cursor,
  }).pull();
  assert.equal(afterAck.objects.length, 0);

  const serverRev = firstPush.applied[0].serverRev;
  const secondPush = await provider.push({
    deviceId: login.deviceId,
    profiles: [createEnvelope('app.profile', objectId, login.deviceId, { profileName: 'Provider A Updated', updatedAt: 2 }, serverRev)],
    objects: [],
    tombstones: [],
  });
  assert.equal(secondPush.pushed, 1);
  assert.equal(secondPush.conflicts.length, 0);

  const stalePush = await provider.push({
    deviceId: login.deviceId,
    profiles: [createEnvelope('app.profile', objectId, login.deviceId, { profileName: 'Provider A Stale', updatedAt: 3 }, 'stale-rev')],
    objects: [],
    tombstones: [],
  });
  assert.equal(stalePush.pushed, 0);
  assert.equal(stalePush.conflicts.length, 1);
  assert.equal(stalePush.conflicts[0].serverRev, secondPush.applied[0].serverRev);

  const assetKey = `provider-smoke/${randomUUID()}.txt`;
  await provider.uploadAsset(assetKey, Buffer.from('desktop-provider-asset', 'utf8'), 'text/plain');
  const asset = await provider.downloadAsset(assetKey);
  assert.equal(asset.toString('utf8'), 'desktop-provider-asset');

  const invalidAccessProvider = new SyncServerProvider({
    endpoint: baseUrl,
    deviceId: login.deviceId,
    accessToken: 'expired-access-token',
    refreshToken: login.refreshToken,
    deviceToken: login.deviceToken,
    onTokensRefreshed: (tokens) => refreshedTokens.push(tokens),
  });
  const refreshedConnection = await invalidAccessProvider.testConnection();
  assert.equal(refreshedConnection.ok, true);
  assert.ok(refreshedTokens.length > 0);

  await provider.revokeDevice(login.deviceId);
  await assert.rejects(() => provider.testConnection().then((result) => {
    if (!result.ok) throw new Error('HTTP 401');
  }), /HTTP 401/);

  console.log(JSON.stringify({
    ok: true,
    usedRealProvider: true,
    userId: login.userId,
    deviceId: login.deviceId,
    pushed: firstPush.pushed + secondPush.pushed,
    pulled: pulled.objects.length,
    conflicts: stalePush.conflicts.length,
    refreshedTokens: refreshedTokens.length,
    assetDownloaded: asset.toString('utf8'),
  }));
}

async function assertSyncServerReady(endpoint) {
  const readyUrl = new URL('/readyz', endpoint).toString();
  let response;
  try {
    response = await fetch(readyUrl);
  } catch (error) {
    throw new Error(createNotReadyMessage(endpoint, error));
  }

  if (!response.ok) {
    throw new Error(createNotReadyMessage(endpoint, new Error(`HTTP ${response.status}`)));
  }
}

function createNotReadyMessage(endpoint, error) {
  const reason = error instanceof Error ? error.message : String(error);
  return [
    `Sync server is not ready at ${endpoint}`,
    `Reason: ${reason}`,
    'Start a local server first, for example:',
    '  cargo run --manifest-path sync_server/Cargo.toml',
    'or point GUYANTOOLS_SYNC_BASE_URL to an existing server.',
  ].join('\n');
}

function createEnvelope(collection, objectId, ownerDeviceId, payload, baseRev) {
  const body = JSON.stringify(payload);
  const payloadHash = createHash('sha256').update(body).digest('hex');
  return {
    collection,
    objectId,
    ownerDeviceId,
    schemaVersion: 1,
    baseRev,
    localRev: payloadHash,
    payloadHash,
    payload,
    deleted: false,
    updatedAt: Date.now(),
  };
}

function normalizeEndpoint(value) {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function currentPlatformKey() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux') return 'linux';
  return 'unknown';
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
