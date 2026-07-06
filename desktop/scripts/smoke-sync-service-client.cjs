const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'CommonJS',
  moduleResolution: 'Node',
});
require('ts-node/register/transpile-only');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const userData = process.env.GUYANTOOLS_SMOKE_USER_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'guyantools-sync-service-'));
const endpoint = normalizeEndpoint(process.env.GUYANTOOLS_SYNC_BASE_URL || 'http://127.0.0.1:38420');
const role = process.env.GUYANTOOLS_SMOKE_ROLE || 'device-a';
const email = requiredEnv('GUYANTOOLS_SMOKE_EMAIL');
const password = process.env.GUYANTOOLS_SMOKE_PASSWORD || 'sync-service-smoke-password';
const marker = process.env.GUYANTOOLS_SMOKE_MARKER || 'sync-service-smoke';

installModuleMocks();

const { dbManager } = require('../src/core/database');
const { appConfigManager } = require('../src/main/app-config/manager');
const { syncService } = require('../src/main/sync/sync_service');

async function main() {
  await dbManager.initialize(path.join(userData, 'guyantools.db'));
  await appConfigManager.initialize();
  await syncService.initialize();
  await syncService.updateSyncServerConfig({ endpoint });
  await syncService.loginSyncServer({
    endpoint,
    email,
    password,
    deviceName: `Sync Service Smoke ${role}`,
    platform: currentPlatformKey(),
  });

  if (role === 'device-a' || role === 'device-a-initial') {
    await seedDeviceA();
    const firstSync = await syncService.syncNow();
    assert.ok(firstSync.pushed >= 1, `expected Device A to push objects, got ${JSON.stringify(firstSync)}`);
    console.log(JSON.stringify({
      ok: true,
      role,
      userData,
      pushed: firstSync.pushed,
      pulled: firstSync.pulled,
      conflicts: firstSync.conflicts,
    }));
    return;
  }

  if (role === 'device-a-update') {
    await seedDeviceAConflictWinner();
    const winnerSync = await syncService.syncNow();
    assert.ok(winnerSync.pushed >= 1, `expected Device A conflict winner to push, got ${JSON.stringify(winnerSync)}`);
    console.log(JSON.stringify({
      ok: true,
      role,
      userData,
      pushed: winnerSync.pushed,
      pulled: winnerSync.pulled,
      conflicts: winnerSync.conflicts,
    }));
    return;
  }

  if (role === 'device-b-baseline') {
    const firstPull = await syncService.syncNow();
    assert.ok(firstPull.pulled >= 1, `expected Device B to pull objects, got ${JSON.stringify(firstPull)}`);
    const conflictsAfterFirstPull = await syncService.listConflicts();
    assert.deepEqual(
      conflictsAfterFirstPull,
      [],
      `expected first pull to accept remote baseline without local-default conflicts, got ${JSON.stringify(conflictsAfterFirstPull)}`,
    );
    await assertDeviceBReceivedRemoteData();
    console.log(JSON.stringify({
      ok: true,
      role,
      userData,
      pulled: firstPull.pulled,
      conflicts: conflictsAfterFirstPull.length,
      profiles: (await syncService.listProfiles()).length,
    }));
    return;
  }

  if (role === 'device-b' || role === 'device-b-conflict') {
    await runDeviceBConflictResolution('use-remote');
    return;
  }

  if (role === 'device-b-use-local') {
    await runDeviceBConflictResolution('use-local');
    return;
  }

  if (role === 'device-b-keep-both') {
    await runDeviceBConflictResolution('keep-both');
    return;
  }

  throw new Error(`unknown smoke role: ${role}`);
}

async function runDeviceBConflictResolution(resolution) {
    await seedDeviceBConflict();
    const conflictSync = await syncService.syncNow();
    const conflicts = await syncService.listConflicts();
    assert.ok(
      conflictSync.conflicts >= 1 || conflicts.some((conflict) => conflict.collection === 'app.appearance'),
      `expected Device B app config conflict, got ${JSON.stringify({ conflictSync, conflicts })}`,
    );
    const appearanceConflict = conflicts.find((conflict) => conflict.collection === 'app.appearance');
    assert.ok(appearanceConflict, `expected app.appearance conflict, got ${JSON.stringify(conflicts)}`);
    await syncService.resolveConflict(appearanceConflict.conflictId, resolution);
    const conflictsAfterResolve = await syncService.listConflicts();
    assert.ok(
      !conflictsAfterResolve.some((conflict) => conflict.collection === 'app.appearance'),
      `expected app.appearance conflict to be resolved, got ${JSON.stringify(conflictsAfterResolve)}`,
    );
    const resolvedConfig = await appConfigManager.getConfig();
    if (resolution === 'use-local' || resolution === 'keep-both') {
      assert.equal(resolvedConfig.appearance.theme, 'light');
      assert.equal(resolvedConfig.appearance.language, 'en');
    } else {
      assert.equal(resolvedConfig.appearance.theme, 'dark');
      assert.equal(resolvedConfig.appearance.language, 'zh');
    }
    const afterResolveSync = await syncService.syncNow();
    const conflictsAfterSync = await syncService.listConflicts();
    assert.equal(
      conflictsAfterSync.some((conflict) => conflict.collection === 'app.appearance'),
      false,
      `expected no app.appearance conflict after re-sync, got ${JSON.stringify({ afterResolveSync, conflictsAfterSync })}`,
    );
    if (resolution === 'keep-both') {
      const profiles = await syncService.listProfiles();
      assert.ok(
        profiles.some((profile) => !profile.isLocal && profile.profileId.includes('keep-both')),
        `expected keep-both to preserve remote config as a remote profile, got ${JSON.stringify(profiles)}`,
      );
    }
    console.log(JSON.stringify({
      ok: true,
      role,
      userData,
      pulled: afterResolveSync.pulled,
      resolution,
      conflicts: Math.max(conflictSync.conflicts, conflicts.length),
      profiles: (await syncService.listProfiles()).length,
    }));
}

async function seedDeviceA() {
  const database = dbManager.getDatabase();
  const library = await database.createKnowledgeLibrary({
    name: `${marker} Research`,
    description: 'Device A library',
  });
  await database.createKnowledgePage({
    libraryId: library.id,
    title: `${marker} Note`,
    pageType: 'markdown',
    contentMarkdown: `# ${marker} Note`,
    contentText: `${marker} Note`,
  });
  const assetPath = path.join(userData, 'asset-source.txt');
  fs.writeFileSync(assetPath, `${marker} asset`, 'utf8');
  await database.createKnowledgeAsset({
    libraryId: library.id,
    hash: createHash('sha256').update(`${marker} asset`).digest('hex'),
    originalName: 'asset-source.txt',
    mimeType: 'text/plain',
    extension: '.txt',
    sizeBytes: Buffer.byteLength(`${marker} asset`),
    storagePath: assetPath,
    extractedText: `${marker} asset`,
    importStatus: 'ready',
  });

  await appConfigManager.updateConfig({
    appearance: {
      theme: 'dark',
      language: 'zh',
    },
    features: {
      aiAgent: {
        enabled: true,
        providers: [{
          id: `${marker}-provider`,
          kind: 'openai-compatible',
          name: `${marker} Provider`,
          baseUrl: 'https://api.example.invalid/v1',
          enabled: true,
          apiKey: 'must-not-sync',
          models: [{
            id: `${marker}-model`,
            displayName: `${marker} Model`,
            providerModelId: 'smoke-model',
            capabilities: {
              streaming: true,
              vision: false,
              toolCalling: true,
              structuredOutput: false,
              reasoning: false,
              embedding: false,
              nativeWebSearch: false,
              nativeFileSearch: false,
            },
          }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
        assistants: [{
          id: `${marker}-assistant`,
          name: `${marker} Assistant`,
          emoji: 'AI',
          providerId: `${marker}-provider`,
          modelId: `${marker}-model`,
          systemPrompt: 'Be concise.',
          knowledgeMode: 'intent',
          mcpMode: 'disabled',
          commonPhrases: [],
          memoryEnabled: false,
          temperatureEnabled: false,
          temperature: 0.7,
          topPEnabled: false,
          topP: 1,
          contextMessages: 20,
          maxOutputTokensEnabled: false,
          streaming: true,
          toolCallMode: 'auto',
          maxToolCallsEnabled: false,
          maxToolCalls: 8,
          customParameters: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
      },
    },
  });
}

async function assertDeviceBReceivedRemoteData() {
  const config = await appConfigManager.getConfig();
  assert.equal(config.appearance.theme, 'dark');
  assert.ok(config.features.aiAgent.providers.some((provider) => provider.id === `${marker}-provider`));
  const syncedProvider = config.features.aiAgent.providers.find((provider) => provider.id === `${marker}-provider`);
  assert.equal(syncedProvider.apiKey, undefined);
  assert.equal(syncedProvider.enabled, false);
  assert.ok(config.features.aiAgent.assistants.some((assistant) => assistant.id === `${marker}-assistant`));

  const database = dbManager.getDatabase();
  const libraries = await database.listKnowledgeLibraries();
  const syncedLibrary = libraries.find((library) => library.name === `${marker} Research`);
  assert.ok(syncedLibrary);
  const tree = await database.listKnowledgeTree({ libraryId: syncedLibrary.id, includeArchived: true });
  assert.ok(
    tree.some((node) => node.title === `${marker} Note`),
    `expected synced knowledge page in tree: ${JSON.stringify(tree.map((node) => ({
      id: node.id,
      type: node.nodeType,
      title: node.title,
    })))}`,
  );
}

async function seedDeviceBConflict() {
  await appConfigManager.updateConfig({
    appearance: {
      theme: 'light',
      language: 'en',
    },
  });
}

async function seedDeviceAConflictWinner() {
  await appConfigManager.updateConfig({
    appearance: {
      theme: 'dark',
      language: 'zh',
      fontFamily: 'system-default',
      baseFontSize: 18,
    },
  });
}

function installModuleMocks() {
  const originalLoad = Module._load;
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === 'electron') {
      return createElectronMock();
    }
    if (request.startsWith('@/')) {
      return originalLoad.call(this, path.join(desktopRoot, 'src', request.slice(2)), parent, isMain);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

function createElectronMock() {
  return {
    app: {
      getPath(name) {
        if (name === 'userData') {
          return userData;
        }
        if (name === 'temp') {
          return os.tmpdir();
        }
        return userData;
      },
      getVersion() {
        return '0.0.3-smoke';
      },
    },
    safeStorage: {
      isEncryptionAvailable() {
        return false;
      },
      encryptString(value) {
        return Buffer.from(value, 'utf8');
      },
      decryptString(value) {
        return Buffer.from(value).toString('utf8');
      },
    },
  };
}

function normalizeEndpoint(value) {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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
