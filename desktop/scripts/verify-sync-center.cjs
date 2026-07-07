const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'src/contracts/sync.ts',
  'src/main/sync/ipc.ts',
  'src/main/sync/sync_service.ts',
  'src/main/sync/sync_scheduler.ts',
  'src/main/sync/providers/provider_types.ts',
  'src/main/sync/providers/webdav_provider.ts',
  'src/main/sync/providers/sync_server_provider.ts',
  'src/main/sync/mappers/app_config_mapper.ts',
  'src/main/sync/mappers/knowledge_mapper.ts',
  'src/main/sync/mappers/ai_mapper.ts',
  'src/windows/main/stores/sync_store.ts',
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error('Missing sync center files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Sync center file surface exists.');

const serviceSource = fs.readFileSync(path.join(root, 'src/main/sync/sync_service.ts'), 'utf8');
const serviceTokens = [
  'listPendingSyncOutbox',
  'upsertSyncOutboxItem',
  'upsertSyncObjectState',
  'markSyncOutboxItemsSyncedByObject',
  'appConfigManager.subscribe',
  'exportKnowledgeObjectsForSync',
  'exportAiConfigForSync',
  'database.listKnowledgeSpaces?.(library.id)',
  'database.listKnowledgeTree?.({',
  'libraryId: library.id',
  'runWithoutCapturingLocalChanges',
  'handleRemoteObject',
  'recordSyncFailure',
  'isLikelyOfflineError',
  "status: isLikelyOfflineError(message) ? 'offline' : 'error'",
  'prepareRemoteKnowledgeAsset',
  'database.applyKnowledgeSyncObject',
  'createAppConfigPatchFromRemoteObject',
  'applyDeletedRemoteObject',
  "object.collection.startsWith('knowledge.')",
  'SyncServerProvider',
  'updateSyncServerConfig',
  'nextSyncServerCursor',
  'pushResult.cursor',
  'Math.max(nextSyncServerCursor ?? 0, pushResult.cursor)',
  'pushResult.serverRev',
  'getObjectRemoteRevision',
  'syncProfileToEnvelope',
  'dirtyProfileObjects',
  'hasPendingPushObjects',
  'dedupedPendingObjects',
  'dedupeSyncObjectsByIdentity',
  'dedupedPendingTombstones',
  "item.collection !== 'app.profile'",
  'profileKeys',
  'upsertLocalProfileFromExport',
  'await this.upsertLocalProfileFromExport(exported.profile)',
  'provider.ack?.(nextSyncServerCursor)',
  'serverConflictId',
  'parseServerConflictMetadata',
  'resolveServerConflictIfNeeded',
  'resolveConflict(serverConflictId, resolution)',
  'recordAppliedRemoteObjectState',
  'const localObject = await this.findCurrentLocalObject(object.collection, object.objectId)',
  'clearPendingOutboxForObject',
  'resolvePendingConflictsForObject',
  'await this.clearPendingOutboxForObject(object)',
  'const pending = await this.db().listPendingSyncOutbox()',
  'hasSamePendingObject',
  'pendingForObject.length > 0',
  'clearStalePendingWikilinkOutbox',
  "getKnowledgeLinkType(parseJsonObject(item.payloadJson)) === 'wikilink'",
  'getPendingAssetDiagnostics',
  'recordPendingFailureForObject',
  'recordPendingFailureForObjects',
  'estimateProviderPushRequestBytes',
  'SyncProviderObjectError',
  'const { serverRev } = parseServerConflictMetadata(conflict.basePayloadJson)',
  'baseRev: serverRev',
  'remoteRev: serverRev',
  'enqueueChangedObjects([localObject ?? conflictToLocalEnvelope(conflict, this.deviceIdentity.deviceId)], serverRev)',
  "object.collection === 'knowledge.asset'",
  'provider?.downloadAsset',
  "app.getPath('userData'), 'knowledge-assets'",
  'storagePath',
  'setSyncProgress',
  'clearSyncProgress',
  'syncProgress',
];
const missingServiceTokens = serviceTokens.filter((token) => !serviceSource.includes(token));
if (missingServiceTokens.length > 0) {
  console.error(`Missing sync service tokens: ${missingServiceTokens.join(', ')}`);
  process.exit(1);
}
if (serviceSource.includes("if (object.deleted) {\n        return;\n      }\n      const applyKnowledgeSyncObject")) {
  console.error('Remote deleted knowledge objects must not be skipped before applyKnowledgeSyncObject handling.');
  process.exit(1);
}
if (serviceSource.includes('state.remoteRev === object.payloadHash') || serviceSource.includes('state.remoteRev !== object.payloadHash')) {
  console.error('Sync service must compare remoteRev with provider revisions, not payload hashes.');
  process.exit(1);
}
if (serviceSource.includes('const profileObjects = localProfiles.map') || serviceSource.includes('profiles: profileObjects')) {
  console.error('Sync service must only push dirty profile objects, not every local profile on every sync.');
  process.exit(1);
}
if (!serviceSource.includes('if (hasPendingPushObjects)')) {
  console.error('Sync service must skip provider.push when there are no local pending objects.');
  process.exit(1);
}
const ensureLocalProfileBody = serviceSource.match(/private async ensureLocalProfile\(\): Promise<NativeSyncProfile\[]> \{([\s\S]*?)\n  private async captureAppConfigChange/);
if (!ensureLocalProfileBody) {
  console.error('Unable to locate ensureLocalProfile body for first-sync verification.');
  process.exit(1);
}
if (ensureLocalProfileBody[1].includes('recordObjectState(exported.profile, false)')) {
  console.error('First local profile creation must enqueue local config for upload before it is marked clean.');
  process.exit(1);
}
if (!ensureLocalProfileBody[1].includes('await this.enqueueChangedObjects([exported.profile, ...exported.objects])')) {
  console.error('First local profile creation must enqueue the local profile and config objects for initial upload.');
  process.exit(1);
}

const schedulerSource = fs.readFileSync(path.join(root, 'src/main/sync/sync_scheduler.ts'), 'utf8');
const schedulerTokens = [
  'STARTUP_DELAY_MS',
  'DEFAULT_INTERVAL_MS',
  'CHANGE_DEBOUNCE_MS',
  'backoffUntil',
  'syncService.syncNow',
];
const missingSchedulerTokens = schedulerTokens.filter((token) => !schedulerSource.includes(token));
if (missingSchedulerTokens.length > 0) {
  console.error(`Missing sync scheduler tokens: ${missingSchedulerTokens.join(', ')}`);
  process.exit(1);
}

console.log('Sync service and scheduler surfaces verified.');

const contractSource = fs.readFileSync(path.join(root, 'src/contracts/sync.ts'), 'utf8');
for (const token of [
  'SyncServerProviderConfig',
  'SyncPendingItemSummary',
  'SyncRunProgress',
  'SyncRunPhase',
  'UpdateSyncServerConfigPayload',
  'SyncServerLoginPayload',
  'SyncServerLoginResult',
  'deviceId: string',
  'hasAccessToken: boolean',
  'hasRefreshToken: boolean',
  'hasDeviceToken: boolean',
  'listPendingItems',
  'payloadBytes',
  'requestBytes',
  'assetFileBytes',
  'assetStoragePath',
  'assetRemoteKey',
  'syncProgress?: SyncRunProgress | null;',
  'loginSyncServer',
  'logoutSyncServer',
  'updateSyncServerConfig',
]) {
  if (!contractSource.includes(token)) {
    console.error(`Missing sync contract token: ${token}`);
    process.exit(1);
  }
}
for (const token of [
  'accessToken: string',
  'refreshToken: string',
  'deviceToken: string',
  'accessToken?: string',
  'refreshToken?: string',
  'deviceToken?: string',
]) {
  if (contractSource.includes(token)) {
    console.error(`Renderer sync contract must not expose sync server secrets: ${token}`);
    process.exit(1);
  }
}

const ipcSource = fs.readFileSync(path.join(root, 'src/main/sync/ipc.ts'), 'utf8');
for (const token of ['sync:list-pending-items', 'listPendingItems', 'sync:login-sync-server', 'loginSyncServer', 'sync:logout-sync-server', 'logoutSyncServer']) {
  if (!ipcSource.includes(token)) {
    console.error(`Missing sync server login IPC token: ${token}`);
    process.exit(1);
  }
}

const providerSource = fs.readFileSync(path.join(root, 'src/main/sync/providers/sync_server_provider.ts'), 'utf8');
for (const token of [
  'loginOrRegister',
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/refresh',
  '/v1/devices/register',
  '/v1/sync/bootstrap',
  'deviceId: this.options.deviceId',
  '请先登录并绑定当前设备。',
  'this.options.deviceId',
  'refreshAccessToken',
  'retryAfterRefresh',
  'serverDeviceId',
  'fetchAssetWithRefresh',
  'revokeDevice',
  'requestAccessOnly',
  'includeDeviceToken',
  'cursor: response.seq',
  'async ack',
  '/v1/sync/ack',
  'serverRev: response.serverRev',
  'createStableSyncServerOpId',
  'const opId = createStableSyncServerOpId',
  'opId,',
  'conflictId: string',
  'async resolveConflict',
  '/v1/sync/conflicts/',
  'JSON.stringify({ resolution })',
  '/v1/devices/',
  '/revoke',
  'createSyncServerUrl',
  'const [requestPathname, requestSearch',
  'base.search = requestSearch',
  'createSyncPushRequestBytes',
  'payloadBytes=',
]) {
  if (!providerSource.includes(token)) {
    console.error(`Missing sync server auth provider token: ${token}`);
    process.exit(1);
  }
}

const webdavProviderSource = fs.readFileSync(path.join(root, 'src/main/sync/providers/webdav_provider.ts'), 'utf8');
for (const token of [
  'SyncProviderObjectError',
  'payloadBytes=',
  'requestBytes',
  'object.collection',
  'object.objectId',
]) {
  if (!webdavProviderSource.includes(token)) {
    console.error(`Missing WebDAV diagnostic token: ${token}`);
    process.exit(1);
  }
}

const providerTypesSource = fs.readFileSync(path.join(root, 'src/main/sync/providers/provider_types.ts'), 'utf8');
if (!providerTypesSource.includes('class SyncProviderObjectError')) {
  console.error('Provider types must expose SyncProviderObjectError for object-level sync failure diagnostics.');
  process.exit(1);
}
for (const token of [
  "new URL('/v1/auth/login', endpoint)",
  "new URL('/v1/auth/register', endpoint)",
  "new URL('/v1/devices/register', endpoint)",
]) {
  if (providerSource.includes(token)) {
    console.error(`Sync server provider must preserve configured URL path prefix instead of using root-relative URL: ${token}`);
    process.exit(1);
  }
}
if (providerSource.includes('desktop-${Date.now()}')) {
  console.error('Sync server provider must use a stable content-based opId for idempotent retries.');
  process.exit(1);
}

const providerConfigSource = fs.readFileSync(path.join(root, 'src/main/sync/provider_config_store.ts'), 'utf8');
for (const token of [
  'SYNC_SERVER_ACCESS_TOKEN_KEY',
  'SYNC_SERVER_REFRESH_TOKEN_KEY',
  'SYNC_SERVER_DEVICE_TOKEN_KEY',
  'readSyncSecret(SYNC_SERVER_ACCESS_TOKEN_KEY)',
  'saveOptionalSyncSecret(SYNC_SERVER_ACCESS_TOKEN_KEY',
  'deleteSyncSecret(SYNC_SERVER_ACCESS_TOKEN_KEY)',
  'clearSyncServerBinding',
  'hasLegacySyncServerSecrets',
  'writeProviderConfig(config)',
  'toRendererProviderConfig',
]) {
  if (!providerConfigSource.includes(token)) {
    console.error(`Missing sync server secret-store token: ${token}`);
    process.exit(1);
  }
}
if (!providerConfigSource.includes('export type UpdateSyncServerRuntimeConfigPayload')) {
  console.error('Sync server runtime token payload must remain main-process-only.');
  process.exit(1);
}
for (const token of [
  'parsed.syncServer.accessToken',
  'parsed.syncServer.refreshToken',
  'parsed.syncServer.deviceToken',
  'accessToken: payload.accessToken?.trim() || current.syncServer?.accessToken',
  'refreshToken: payload.refreshToken?.trim() || current.syncServer?.refreshToken',
  'deviceToken: payload.deviceToken?.trim() || current.syncServer?.deviceToken',
]) {
  if (providerConfigSource.includes(token)) {
    console.error(`Sync server token must not be persisted in provider-config.json: ${token}`);
    process.exit(1);
  }
}

const settingsSource = fs.readFileSync(path.join(root, 'src/windows/main/pages/Settings.vue'), 'utf8');
for (const token of [
  'onBeforeUnmount',
  'stopSyncEventSubscription',
  'stopSyncEventSubscription = syncStore.bindEvents()',
  'stopSyncEventSubscription?.()',
  'syncPendingVirtualListRef',
  'syncPendingVisibleItems',
  'syncPendingCollectionCounts',
  'sync-pending-virtual-list',
  'syncPendingVirtualOffsetY',
  '待同步明细',
  'formatSyncBytes',
  'payloadBytes',
  'assetFileBytes',
  'assetStoragePath',
  'lastError',
  "scheduleSettingsTabLoad(nextTab, nextTab === 'sync-center')",
  "scheduleSettingsTabLoad(settingsStore.activeSettingsTab, settingsStore.activeSettingsTab === 'sync-center')",
  'syncServerEmail',
  'syncServerPassword',
  'syncServerDeviceName',
  'syncServerDeviceId',
  'loginSyncServer',
  '登录并绑定当前设备',
  'logoutSyncServer',
  '退出并解绑当前设备',
  'syncProgressVisible',
  'syncProgressLabel',
  'syncProgressPercent',
  'syncProgressDetail',
  'sync-progress__bar-fill',
]) {
  if (!settingsSource.includes(token)) {
    console.error(`Missing sync server login UI token: ${token}`);
    process.exit(1);
  }
}
for (const token of [
  'syncServerAccessToken',
  'syncServerDeviceToken',
  'Bearer token',
  'device token',
]) {
  if (settingsSource.includes(token)) {
    console.error(`Sync server tokens must not be shown or manually edited in Settings.vue: ${token}`);
    process.exit(1);
  }
}

console.log('Sync server login and device binding surfaces verified.');

const nativeBindingSource = fs.readFileSync(path.resolve(root, '..', 'multi_platform_core/src/bindings/napi.rs'), 'utf8');
for (const token of [
  'markSyncOutboxItemsSyncedByObject',
  'mark_outbox_items_synced_by_object',
  'SyncService::mark_outbox_items_synced_by_object',
]) {
  if (!nativeBindingSource.includes(token)) {
    console.error(`Missing sync native binding token: ${token}`);
    process.exit(1);
  }
}

const rustSyncServiceSource = fs.readFileSync(path.resolve(root, '..', 'multi_platform_core/src/services/sync_service.rs'), 'utf8');
for (const token of [
  'mark_outbox_items_synced_by_object',
  "WHERE collection = ?1 AND object_id = ?2 AND status = 'pending'",
]) {
  if (!rustSyncServiceSource.includes(token)) {
    console.error(`Missing sync Rust service token: ${token}`);
    process.exit(1);
  }
}

console.log('Sync conflict outbox cleanup surfaces verified.');
