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

const { SyncServerProvider } = require('../src/main/sync/providers/sync_server_provider');

const baseUrl = normalizeEndpoint(process.env.GUYANTOOLS_SYNC_BASE_URL || 'http://127.0.0.1:38420');

async function main() {
  await assertSyncServerReady(baseUrl);

  const email = `two-device-${randomUUID().replace(/-/g, '')}@example.local`;
  const password = 'two-device-smoke-password';
  const deviceA = await SyncServerProvider.loginOrRegister({
    endpoint: baseUrl,
    email,
    password,
    deviceName: 'Desktop Smoke Device A',
    platform: currentPlatformKey(),
  });
  const deviceB = await SyncServerProvider.loginOrRegister({
    endpoint: baseUrl,
    email,
    password,
    deviceName: 'Desktop Smoke Device B',
    platform: currentPlatformKey(),
  });
  assert.notEqual(deviceA.deviceId, deviceB.deviceId);

  const providerA = createProvider(deviceA);
  const providerB = createProvider(deviceB);

  assert.equal((await providerA.testConnection()).ok, true);
  assert.equal((await providerB.testConnection()).ok, true);

  const suffix = randomUUID();
  const profileId = `profile-${suffix}`;
  const appProfile = createEnvelope('app.profile', profileId, deviceA.deviceId, {
    profileName: 'Device A Profile',
    appearance: { theme: 'dark' },
    features: { syncCenter: { enabled: true } },
  });
  const appAppearance = createEnvelope('app.appearance', 'appearance', deviceA.deviceId, {
    theme: 'dark',
    accentColor: '#2f6feb',
  });
  const knowledgeLibrary = createEnvelope('knowledge.library', `library-${suffix}`, deviceA.deviceId, {
    id: `library-${suffix}`,
    name: 'Research',
    description: 'Device A library',
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const knowledgePage = createEnvelope('knowledge.page', `page-${suffix}`, deviceA.deviceId, {
    node: {
      id: `page-${suffix}`,
      libraryId: `library-${suffix}`,
      spaceId: null,
      parentId: null,
      nodeType: 'page',
      title: 'Note',
      sortOrder: 0,
      isArchived: false,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    page: {
      id: `page-${suffix}`,
      pageType: 'markdown',
      contentMarkdown: '# Note',
      contentText: 'Note',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  const aiProvider = createEnvelope('ai.provider', `provider-${suffix}`, deviceA.deviceId, {
    id: `provider-${suffix}`,
    kind: 'openai-compatible',
    name: 'Remote Provider',
    baseUrl: 'https://api.example.invalid/v1',
    enabled: true,
    hasCredential: true,
    models: [{
      id: `model-${suffix}`,
      displayName: 'Remote Model',
      providerModelId: 'remote-model',
      capabilities: { streaming: true, vision: false, toolCalling: true },
    }],
  });
  const aiAssistant = createEnvelope('ai.assistant', `assistant-${suffix}`, deviceA.deviceId, {
    id: `assistant-${suffix}`,
    name: 'Research Assistant',
    emoji: 'AI',
    providerId: `provider-${suffix}`,
    modelId: `model-${suffix}`,
    systemPrompt: 'Be concise.',
    knowledgeMode: 'intent',
    needsConfiguration: false,
  });

  const firstPush = await providerA.push({
    deviceId: deviceA.deviceId,
    profiles: [appProfile],
    objects: [appAppearance, knowledgeLibrary, knowledgePage, aiProvider, aiAssistant],
    tombstones: [],
  });
  assert.equal(firstPush.pushed, 6);
  assert.equal(firstPush.conflicts.length, 0);

  const assetKey = `assets/${suffix}/note.txt`;
  await providerA.uploadAsset(assetKey, Buffer.from('two-device-asset', 'utf8'), 'text/plain');
  const pulledAsset = await providerB.downloadAsset(assetKey);
  assert.equal(pulledAsset.toString('utf8'), 'two-device-asset');

  const pulledByB = await createProvider(deviceB, 0).pull();
  assertPulledObject(pulledByB.objects, 'app.profile', profileId);
  assertPulledObject(pulledByB.objects, 'app.appearance', 'appearance');
  assertPulledObject(pulledByB.objects, 'knowledge.library', `library-${suffix}`);
  assertPulledObject(pulledByB.objects, 'knowledge.page', `page-${suffix}`);
  assertPulledObject(pulledByB.objects, 'ai.provider', `provider-${suffix}`);
  assertPulledObject(pulledByB.objects, 'ai.assistant', `assistant-${suffix}`);
  assertNoSecretFields(pulledByB.objects.find((object) => object.collection === 'ai.provider').payload);
  await providerB.ack(pulledByB.cursor);

  const sameNameLocalLibrary = createEnvelope('knowledge.library', `library-local-${suffix}`, deviceB.deviceId, {
    id: `library-local-${suffix}`,
    name: 'Research',
    description: 'Device B same-name library',
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const sameNamePush = await providerB.push({
    deviceId: deviceB.deviceId,
    profiles: [],
    objects: [sameNameLocalLibrary],
    tombstones: [],
  });
  assert.equal(sameNamePush.pushed, 1);
  assert.equal(sameNamePush.conflicts.length, 0);
  const sameNamePull = await createProvider(deviceA, 0).pull();
  const researchLibraries = sameNamePull.objects.filter((object) =>
    object.collection === 'knowledge.library' && object.payload?.name === 'Research');
  assert.ok(researchLibraries.some((object) => object.objectId === `library-${suffix}`));
  assert.ok(researchLibraries.some((object) => object.objectId === `library-local-${suffix}`));

  const conflictObjectId = `profile-conflict-${suffix}`;
  const conflictBase = createEnvelope('app.profile', conflictObjectId, deviceA.deviceId, {
    profileName: 'Base Profile',
    appearance: { theme: 'system' },
  });
  const conflictCreate = await providerA.push({
    deviceId: deviceA.deviceId,
    profiles: [conflictBase],
    objects: [],
    tombstones: [],
  });
  assert.equal(conflictCreate.pushed, 1);
  const baseRev = conflictCreate.applied[0].serverRev;

  const localWinner = createEnvelope('app.profile', conflictObjectId, deviceA.deviceId, {
    profileName: 'Device A Winner',
    appearance: { theme: 'dark' },
  }, baseRev);
  const staleLoser = createEnvelope('app.profile', conflictObjectId, deviceB.deviceId, {
    profileName: 'Device B Stale',
    appearance: { theme: 'light' },
  }, baseRev);
  const winnerPush = await providerA.push({
    deviceId: deviceA.deviceId,
    profiles: [localWinner],
    objects: [],
    tombstones: [],
  });
  assert.equal(winnerPush.pushed, 1);
  const stalePush = await providerB.push({
    deviceId: deviceB.deviceId,
    profiles: [staleLoser],
    objects: [],
    tombstones: [],
  });
  assert.equal(stalePush.pushed, 0);
  assert.equal(stalePush.conflicts.length, 1);
  assert.equal(stalePush.conflicts[0].serverRev, winnerPush.applied[0].serverRev);
  assert.equal(stalePush.conflicts[0].serverPayload.profileName, 'Device A Winner');
  assert.equal(stalePush.conflicts[0].attemptedPayload.profileName, 'Device B Stale');

  const finalPull = await createProvider(deviceB, 0).pull();
  const finalConflictObject = finalPull.objects
    .filter((object) => object.collection === 'app.profile' && object.objectId === conflictObjectId)
    .at(-1);
  assert.equal(finalConflictObject.payload.profileName, 'Device A Winner');

  console.log(JSON.stringify({
    ok: true,
    usedRealProvider: true,
    scenario: 'two-device-sync-server',
    userId: deviceA.userId,
    deviceA: deviceA.deviceId,
    deviceB: deviceB.deviceId,
    pushedObjects: firstPush.pushed + sameNamePush.pushed + conflictCreate.pushed + winnerPush.pushed,
    pulledByB: pulledByB.objects.length,
    sameNameLibraries: researchLibraries.length,
    conflicts: stalePush.conflicts.length,
    assetDownloaded: pulledAsset.toString('utf8'),
  }));
}

function createProvider(login, cursor) {
  return new SyncServerProvider({
    endpoint: baseUrl,
    deviceId: login.deviceId,
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    deviceToken: login.deviceToken,
    cursor,
  });
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

function assertPulledObject(objects, collection, objectId) {
  assert.ok(
    objects.some((object) => object.collection === collection && object.objectId === objectId),
    `expected pull to contain ${collection}:${objectId}`,
  );
}

function assertNoSecretFields(value) {
  const body = JSON.stringify(value);
  for (const token of ['apiKey', 'apiKeyRef', 'webSearchApiKey', 'modelscopeApiToken']) {
    assert.equal(body.includes(token), false, `AI sync payload leaked ${token}`);
  }
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
