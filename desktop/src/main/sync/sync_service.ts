import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dbManager, type JsDatabase } from '@/core/database';
import type { AppConfig, AppConfigPatch } from '@/contracts/app_config';
import type { AiAssistantConfig, AiModelConfig, AiProviderConfig } from '@/contracts/ai';
import type {
  SyncCenterState,
  SyncCollectionKind,
  SyncConflictResolution,
  SyncConflictSummary,
  SyncConnectionResult,
  SyncDeviceIdentity,
  SyncEvent,
  SyncRunProgress,
  SyncRunPhase,
  SyncObjectEnvelope,
  SyncPendingItemSummary,
  SyncProfileSummary,
  SyncProviderConfig,
  SyncRunSummary,
  SyncServerLoginPayload,
  SyncServerLoginResult,
  UpdateSyncServerConfigPayload,
  UpdateSyncWebDavConfigPayload,
} from '@/contracts/sync';
import { appConfigManager } from '../app-config/manager';
import { createAppConfigPatchFromSyncProfile, exportAppConfigForSync, sanitizeAppConfigForSync } from './mappers/app_config_mapper';
import { exportAiConfigForSync } from './mappers/ai_mapper';
import { exportKnowledgeForSync } from './mappers/knowledge_mapper';
import {
  clearSyncServerBinding,
  readSyncProviderConfig,
  readSyncProviderRuntimeConfig,
  readWebDavPassword,
  updateSyncServerCursor,
  updateSyncServerConfig,
  updateSyncWebDavConfig,
} from './provider_config_store';
import { SyncServerProvider } from './providers/sync_server_provider';
import { createKnowledgeAssetRemoteKey, WebDavSyncProvider } from './providers/webdav_provider';
import { SyncProviderObjectError, type SyncProvider, type SyncProviderAppliedObject, type SyncProviderPushConflict } from './providers/provider_types';
import type {
  KnowledgeAsset,
  KnowledgeLibrary,
  KnowledgeLink,
  KnowledgeNode,
  KnowledgePageDetail,
  KnowledgeSpace,
  KnowledgeTag,
} from '@/contracts/knowledge';

type SyncEventListener = (event: SyncEvent) => void;
type NativeSyncProfile = {
  profileId: string;
  profileName: string;
  ownerDeviceId: string;
  schemaVersion: number;
  appVersion: string;
  payloadHash: string;
  isLocal: boolean;
  isActive: boolean;
  isDefault: boolean;
  payloadJson: string;
  createdAt: number;
  updatedAt: number;
};
type NativeSyncConflict = {
  conflictId: string;
  collection: string;
  objectId: string;
  title: string;
  localPayloadJson: string;
  remotePayloadJson: string;
  basePayloadJson?: string;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
  status: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
};
type NativeSyncObjectState = {
  collection: string;
  objectId: string;
  ownerDeviceId: string;
  schemaVersion: number;
  baseRev?: string;
  localRev?: string;
  remoteRev?: string;
  payloadHash: string;
  dirty: boolean;
  deleted: boolean;
  updatedAt: number;
};
type NativeSyncOutboxItem = {
  opId: string;
  collection: string;
  objectId: string;
  opKind: 'upsert' | 'delete';
  baseRev?: string;
  payloadJson: string;
  payloadHash: string;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};
type SyncMetadataDatabase = JsDatabase & {
  listSyncProfiles: () => Promise<NativeSyncProfile[]>;
  upsertSyncProfile: (profile: NativeSyncProfile) => Promise<NativeSyncProfile>;
  setActiveSyncProfile: (profileId: string) => Promise<void>;
  setDefaultSyncProfile: (profileId: string) => Promise<void>;
  listSyncConflicts: () => Promise<NativeSyncConflict[]>;
  listSyncObjectStates: () => Promise<NativeSyncObjectState[]>;
  upsertSyncObjectState: (state: NativeSyncObjectState) => Promise<NativeSyncObjectState>;
  listPendingSyncOutbox: () => Promise<NativeSyncOutboxItem[]>;
  upsertSyncOutboxItem: (item: NativeSyncOutboxItem) => Promise<NativeSyncOutboxItem>;
  markSyncOutboxItemsSynced: (opIds: string[], updatedAt: number) => Promise<void>;
  markSyncOutboxItemsSyncedByObject: (collection: string, objectId: string, updatedAt: number) => Promise<void>;
  upsertSyncConflict: (conflict: NativeSyncConflict) => Promise<NativeSyncConflict>;
  resolveSyncConflict: (conflictId: string, resolvedAt: number) => Promise<void>;
  listKnowledgeLibraries?: () => Promise<KnowledgeLibrary[]>;
  listKnowledgeSpaces?: (libraryId?: string) => Promise<KnowledgeSpace[]>;
  listKnowledgeTree?: (input?: Record<string, unknown>) => Promise<KnowledgeNode[]>;
  getKnowledgePage?: (pageId: string) => Promise<KnowledgePageDetail>;
  getKnowledgeAsset?: (assetId: string) => Promise<KnowledgeAsset>;
  listKnowledgeTags?: (input?: Record<string, unknown>) => Promise<KnowledgeTag[]>;
  listKnowledgePageLinks?: (pageId: string) => Promise<KnowledgeLink[]>;
  applyKnowledgeSyncObject?: (collection: string, payloadJson: string) => Promise<void>;
  deleteKnowledgeNode?: (nodeId: string) => Promise<void>;
};

class SyncService {
  private readonly listeners = new Set<SyncEventListener>();
  private readonly deviceIdentity: SyncDeviceIdentity = {
    deviceId: createStableDeviceId(),
    deviceName: os.hostname() || '本机',
    platform: currentPlatformKey(),
    appVersion: app.getVersion(),
    createdAt: Date.now(),
  };
  private state: SyncCenterState = {
    enabled: false,
    providerKind: 'webdav',
    status: 'disabled',
    syncProgress: null,
    pendingCount: 0,
    conflictCount: 0,
    activeProfileId: '',
    defaultProfileId: '',
  };
  private initialized = false;
  private applyingRemoteProfile = false;
  private syncInFlight: Promise<SyncRunSummary> | null = null;
  private requestAutoSync: (() => void) | null = null;

  async initialize(options: { requestAutoSync?: () => void } = {}): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.requestAutoSync = options.requestAutoSync ?? null;
    appConfigManager.subscribe((config) => {
      void this.captureAppConfigChange(config);
    });
    this.initialized = true;
    await this.ensureLocalProfile();
  }

  getDeviceIdentity(): SyncDeviceIdentity {
    return { ...this.deviceIdentity };
  }

  async getState(): Promise<SyncCenterState> {
    await this.ensureLocalProfile();
    await this.refreshStateFromProfiles();
    return { ...this.state };
  }

  async listProfiles(): Promise<SyncProfileSummary[]> {
    const profiles = await this.ensureLocalProfile();
    return profiles.map((profile) => this.toProfileSummary(profile));
  }

  async listConflicts(): Promise<SyncConflictSummary[]> {
    const conflicts = await this.db().listSyncConflicts();
    return conflicts.map((conflict) => ({
      conflictId: conflict.conflictId,
      collection: conflict.collection as SyncConflictSummary['collection'],
      objectId: conflict.objectId,
      title: conflict.title,
      localDeviceName: '本机',
      remoteDeviceName: '远程设备',
      localUpdatedAt: conflict.localUpdatedAt,
      remoteUpdatedAt: conflict.remoteUpdatedAt,
      status: conflict.status,
    }));
  }

  async listPendingItems(): Promise<SyncPendingItemSummary[]> {
    const items = await this.db().listPendingSyncOutbox();
    return Promise.all(items.map(async (item) => {
      const payload = parseJsonObject(item.payloadJson);
      const assetDiagnostics = await this.getPendingAssetDiagnostics(item.collection, item.objectId, payload);
      const payloadBytes = byteLengthUtf8(item.payloadJson);
      return {
        id: item.opId,
        collection: item.collection as SyncCollectionKind,
        objectId: item.objectId,
        operation: item.opKind,
        title: createPendingItemTitle(item),
        payloadHash: item.payloadHash,
        payloadBytes,
        requestBytes: estimateSyncObjectRequestBytes(item, payload),
        ...assetDiagnostics,
        retryCount: item.retryCount,
        lastError: item.lastError,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    }));
  }

  async getProviderConfig(): Promise<SyncProviderConfig> {
    return readSyncProviderConfig();
  }

  async updateWebDavConfig(payload: UpdateSyncWebDavConfigPayload): Promise<SyncProviderConfig> {
    const config = await updateSyncWebDavConfig(payload);
    this.state = {
      ...this.state,
      providerKind: 'webdav',
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
    return config;
  }

  async updateSyncServerConfig(payload: UpdateSyncServerConfigPayload): Promise<SyncProviderConfig> {
    const config = await updateSyncServerConfig(payload);
    this.state = {
      ...this.state,
      providerKind: 'sync-server',
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
    return config;
  }

  async loginSyncServer(payload: SyncServerLoginPayload): Promise<SyncServerLoginResult> {
    const result = await SyncServerProvider.loginOrRegister({
      ...payload,
      platform: payload.platform || this.deviceIdentity.platform,
    });
    await updateSyncServerConfig({
      endpoint: payload.endpoint,
      deviceId: result.deviceId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      deviceToken: result.deviceToken,
    });
    return {
      userId: result.userId,
      deviceId: result.deviceId,
      deviceName: result.deviceName,
      platform: result.platform,
    };
  }

  async logoutSyncServer(): Promise<SyncProviderConfig> {
    const config = await readSyncProviderRuntimeConfig();
    if (config.syncServer?.endpoint && config.syncServer.deviceId && config.syncServer.accessToken) {
      await this.createSyncServerProvider(config.syncServer)
        .revokeDevice(config.syncServer.deviceId)
        .catch((): void => undefined);
    }
    const next = await clearSyncServerBinding();
    this.state = {
      ...this.state,
      providerKind: 'sync-server',
      enabled: false,
      status: 'disabled',
      lastError: undefined,
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
    return next;
  }

  async testConnection(): Promise<SyncConnectionResult> {
    const config = await readSyncProviderRuntimeConfig();
    const webdav = config.webdav;
    if (config.providerKind === 'webdav' && webdav) {
      if (!webdav.username || !webdav.hasPassword) {
        return {
          ok: false,
          message: '请先配置 WebDAV 用户名和第三方应用密码。',
        };
      }

      const provider = new WebDavSyncProvider({
        endpoint: webdav.endpoint,
        username: webdav.username,
        password: await readWebDavPassword(),
        remoteRoot: webdav.remoteRoot,
      });
      return provider.testConnection();
    }

    if (config.providerKind === 'sync-server' && config.syncServer?.endpoint) {
      const provider = this.createSyncServerProvider(config.syncServer);
      return provider.testConnection();
    }

    return {
      ok: false,
      message: '同步中心尚未配置 WebDAV 或同步后端。',
    };
  }

  async syncNow(): Promise<SyncRunSummary> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }
    this.syncInFlight = this.runSyncNow()
      .catch((error) => {
        this.recordSyncFailure(error);
        throw error;
      })
      .finally(() => {
        this.clearSyncProgress();
        this.syncInFlight = null;
      });
    return this.syncInFlight;
  }

  private async runSyncNow(): Promise<SyncRunSummary> {
    const startedAt = Date.now();
    let profiles = await this.ensureLocalProfile();
    let localProfiles = profiles.filter((profile) => profile.isLocal && profile.ownerDeviceId === this.deviceIdentity.deviceId);
    const provider = await this.createProvider();
    let pulled = 0;
    let pushed = 0;
    let conflicts = 0;
    let skipped = 0;
    let nextSyncServerCursor: number | undefined;
    this.state = {
      ...this.state,
      enabled: Boolean(provider),
      status: provider ? 'syncing' : 'disabled',
      lastError: undefined,
      syncProgress: null,
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
    if (provider) {
      await this.captureCurrentSyncObjects();
      profiles = await this.db().listSyncProfiles();
      localProfiles = profiles.filter((profile) => profile.isLocal && profile.ownerDeviceId === this.deviceIdentity.deviceId);
      const pullResult = await provider.pull();
      const remoteObjects = sortRemoteObjectsForApply(pullResult.objects);
      const remoteDeletedObjects = sortRemoteObjectsForApply(pullResult.deletedObjects);
      const remoteTotal = remoteObjects.length + remoteDeletedObjects.length;
      let remoteCompleted = 0;
      this.updateSyncProgress('download', remoteCompleted, remoteTotal);
      for (const object of remoteObjects) {
        if (object.collection !== 'app.profile') {
          const result = await this.handleRemoteObject(object);
          pulled += result.pulled;
          conflicts += result.conflicts;
          skipped += result.skipped;
          remoteCompleted += 1;
          this.updateSyncProgress('download', remoteCompleted, remoteTotal);
          continue;
        }
        const existing = profiles.find((profile) => profile.profileId === object.objectId);
        if (existing?.payloadHash === object.payloadHash) {
          skipped += 1;
          remoteCompleted += 1;
          this.updateSyncProgress('download', remoteCompleted, remoteTotal);
          continue;
        }
        await this.db().upsertSyncProfile({
          profileId: object.objectId,
          profileName: getRemoteProfileName(object.payload),
          ownerDeviceId: object.ownerDeviceId,
          schemaVersion: object.schemaVersion,
          appVersion: '',
          payloadHash: object.payloadHash,
          isLocal: false,
          isActive: false,
          isDefault: false,
          payloadJson: JSON.stringify(object.payload),
          createdAt: object.updatedAt,
          updatedAt: object.updatedAt,
        });
        pulled += 1;
        remoteCompleted += 1;
        this.updateSyncProgress('download', remoteCompleted, remoteTotal);
      }

      for (const object of remoteDeletedObjects) {
        const result = await this.handleRemoteObject(object);
        pulled += result.pulled;
        conflicts += result.conflicts;
        skipped += result.skipped;
        remoteCompleted += 1;
        this.updateSyncProgress('download', remoteCompleted, remoteTotal);
      }
      if (typeof pullResult.cursor === 'number') {
        nextSyncServerCursor = pullResult.cursor;
        await updateSyncServerCursor(nextSyncServerCursor);
        await provider.ack?.(nextSyncServerCursor).catch((): void => undefined);
      }

      const pending = await this.db().listPendingSyncOutbox();
      const objectStates = await this.db().listSyncObjectStates();
      const localProfileById = new Map(localProfiles.map((profile) => [profile.profileId, profile]));
      const dirtyProfileObjects = dedupeSyncObjectsByIdentity(pending
        .filter((item) => item.opKind !== 'delete' && item.collection === 'app.profile')
        .map((item) => {
          const profile = localProfileById.get(item.objectId);
          if (profile) {
            return syncProfileToEnvelope(
              profile,
              objectStates.find((state) => state.collection === 'app.profile' && state.objectId === profile.profileId),
            );
          }
          return outboxItemToEnvelope(item, this.deviceIdentity.deviceId);
        }));
      const profileKeys = new Set(dirtyProfileObjects.map((profile) => `${profile.collection}:${profile.objectId}`));
      const pendingObjects = pending
        .filter((item) => item.opKind !== 'delete' && item.collection !== 'app.profile')
        .map((item) => outboxItemToEnvelope(item, this.deviceIdentity.deviceId));
      const dedupedPendingObjects = dedupeSyncObjectsByIdentity(
        pendingObjects.filter((object) => !profileKeys.has(`${object.collection}:${object.objectId}`)),
      );
      const pendingTombstones = pending
        .filter((item) => item.opKind === 'delete')
        .map((item) => outboxItemToEnvelope(item, this.deviceIdentity.deviceId));
      const dedupedPendingTombstones = dedupeSyncObjectsByIdentity(pendingTombstones);
      const hasPendingPushObjects = dirtyProfileObjects.length > 0
        || dedupedPendingObjects.length > 0
        || dedupedPendingTombstones.length > 0;
      if (hasPendingPushObjects) {
        const pushTotal = dirtyProfileObjects.length + dedupedPendingObjects.length + dedupedPendingTombstones.length;
        this.updateSyncProgress('upload', 0, pushTotal);
        await this.uploadPendingKnowledgeAssets(provider, dedupedPendingObjects, (completed) => {
          this.updateSyncProgress('upload', completed, pushTotal);
        });
        const pushInput = {
          deviceId: this.deviceIdentity.deviceId,
          profiles: dirtyProfileObjects,
          objects: dedupedPendingObjects,
          tombstones: dedupedPendingTombstones,
        };
        const pushResult = await provider.push(pushInput).catch(async (error) => {
          if (error instanceof SyncProviderObjectError) {
            const message = createSyncObjectFailureMessage(
              `对象写入失败，估算请求体 ${formatBytes(error.requestBytes ?? 0)}`,
              error,
            );
            await this.recordPendingFailureForObject(error.collection, error.objectId, message);
            throw error;
          }
          const requestBytes = estimateProviderPushRequestBytes(pushInput);
          const message = createSyncObjectFailureMessage(
            `批量同步请求失败，估算请求体 ${formatBytes(requestBytes)}`,
            error,
          );
          await this.recordPendingFailureForObjects(
            [...dirtyProfileObjects, ...dedupedPendingObjects, ...dedupedPendingTombstones],
            message,
          );
          throw error;
        });
        pushed = pushResult.pushed;
        if (pushResult.conflicts?.length) {
          for (const conflict of pushResult.conflicts) {
            await this.recordServerPushConflict(conflict);
          }
          conflicts += pushResult.conflicts.length;
        }
        if (typeof pushResult.cursor === 'number') {
          nextSyncServerCursor = Math.max(nextSyncServerCursor ?? 0, pushResult.cursor);
          await updateSyncServerCursor(nextSyncServerCursor);
        }
        if (pending.length > 0) {
          const now = Date.now();
          const conflictedKeys = new Set((pushResult.conflicts ?? []).map((item) => `${item.collection}:${item.objectId}`));
          const appliedRevisions = createAppliedRevisionMap(pushResult.applied ?? []);
          const syncedPending = pending.filter((item) => !conflictedKeys.has(`${item.collection}:${item.objectId}`));
          await this.db().markSyncOutboxItemsSynced(syncedPending.map((item) => item.opId), now);
          for (const object of [...dirtyProfileObjects, ...dedupedPendingObjects, ...dedupedPendingTombstones]) {
            if (conflictedKeys.has(`${object.collection}:${object.objectId}`)) {
              continue;
            }
            await this.markObjectClean(object, now, appliedRevisions.get(`${object.collection}:${object.objectId}`) ?? pushResult.serverRev);
          }
        }
        this.updateSyncProgress('upload', pushTotal, pushTotal);
      }
    }

    await this.refreshStateFromProfiles();
    const summary: SyncRunSummary = {
      pushed,
      pulled,
      conflicts,
      skipped,
      startedAt,
      finishedAt: Date.now(),
    };
    this.state = {
      ...this.state,
      status: conflicts > 0 ? 'conflict' : provider ? 'idle' : 'disabled',
      lastSuccessAt: provider ? summary.finishedAt : this.state.lastSuccessAt,
      lastError: undefined,
      syncProgress: null,
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
    this.emit({ type: 'sync-finished', summary });
    return summary;
  }

  async applyProfile(_profileId: string): Promise<void> {
    const profileId = _profileId;
    const profiles = await this.ensureLocalProfile();
    const profile = profiles.find((item) => item.profileId === profileId);
    if (!profile) {
      throw new Error('同步配置档案不存在。');
    }

    const payload = JSON.parse(profile.payloadJson) as AppConfig;
    await this.runWithoutCapturingLocalChanges(async () => {
      await appConfigManager.updateConfig(createSafeAppConfigPatchFromSyncProfile({
        collection: 'app.profile',
        objectId: profile.profileId,
        ownerDeviceId: profile.ownerDeviceId,
        schemaVersion: profile.schemaVersion,
        payloadHash: profile.payloadHash,
        payload,
        deleted: false,
        updatedAt: profile.updatedAt,
      }));
    });
    await this.db().setActiveSyncProfile(profileId);
    await this.refreshStateFromProfiles();
    this.emit({ type: 'profiles-changed' });
  }

  async setDefaultProfile(profileId: string): Promise<void> {
    await this.ensureLocalProfile();
    await this.db().setDefaultSyncProfile(profileId);
    await this.refreshStateFromProfiles();
    this.emit({ type: 'profiles-changed' });
  }

  async resolveConflict(_conflictId: string, _resolution: SyncConflictResolution): Promise<void> {
    const conflictId = _conflictId;
    if (_resolution === 'manual') {
      throw new Error('手动合并将在后续版本开放。');
    }
    const conflict = (await this.db().listSyncConflicts()).find((item) => item.conflictId === conflictId);
    if (!conflict) {
      throw new Error('同步冲突不存在或已解决。');
    }
    if (_resolution === 'use-remote') {
      const remoteObject = conflictToRemoteEnvelope(conflict);
      await this.applyRemoteObject(remoteObject);
      await this.recordAppliedRemoteObjectState(remoteObject);
      await this.clearPendingOutboxForObject(remoteObject);
      await this.resolvePendingConflictsForObject(remoteObject);
    }
    if (_resolution === 'use-local') {
      const remoteObject = conflictToRemoteEnvelope(conflict);
      const localObject = await this.findCurrentLocalObject(remoteObject.collection, remoteObject.objectId);
      const { serverRev } = parseServerConflictMetadata(conflict.basePayloadJson);
      await this.enqueueChangedObjects([localObject ?? conflictToLocalEnvelope(conflict, this.deviceIdentity.deviceId)], serverRev);
      await this.resolvePendingConflictsForObject(remoteObject);
    }
    if (_resolution === 'keep-both') {
      const remoteObject = conflictToRemoteEnvelope(conflict);
      if (isAppConfigCollection(remoteObject.collection)) {
        await this.storeKeepBothRemoteProfile(conflict, remoteObject);
        await this.clearPendingOutboxForObject(remoteObject);
        const localObject = await this.findCurrentLocalObject(remoteObject.collection, remoteObject.objectId);
        if (localObject) {
          await this.enqueueChangedObjects([localObject], getObjectRemoteRevision(remoteObject));
        }
        await this.resolvePendingConflictsForObject(remoteObject);
        await this.resolveServerConflictIfNeeded(conflict, _resolution);
        await this.db().resolveSyncConflict(conflictId, Date.now());
        await this.refreshStateFromProfiles();
        this.emit({ type: 'conflicts-changed' });
        this.emit({ type: 'profiles-changed' });
        return;
      }
      const duplicatedRemote = duplicateRemoteObjectForKeepBoth(remoteObject);
      await this.applyRemoteObject(duplicatedRemote);
      await this.recordAppliedRemoteObjectState(duplicatedRemote);
      await this.clearPendingOutboxForObject(remoteObject);
      await this.resolvePendingConflictsForObject(remoteObject);
    }
    await this.resolveServerConflictIfNeeded(conflict, _resolution);
    await this.db().resolveSyncConflict(conflictId, Date.now());
    await this.refreshStateFromProfiles();
    this.emit({ type: 'conflicts-changed' });
  }

  async runWithoutCapturingLocalChanges<T>(fn: () => Promise<T>): Promise<T> {
    this.applyingRemoteProfile = true;
    try {
      return await fn();
    } finally {
      this.applyingRemoteProfile = false;
    }
  }

  subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SyncEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private recordSyncFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.state = {
      ...this.state,
      status: isLikelyOfflineError(message) ? 'offline' : 'error',
      lastError: message,
      syncProgress: null,
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
  }

  private setSyncProgress(progress: SyncRunProgress | null) {
    this.state = {
      ...this.state,
      syncProgress: progress,
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
  }

  private clearSyncProgress() {
    if (!this.state.syncProgress) {
      return;
    }

    this.setSyncProgress(null);
  }

  private db(): SyncMetadataDatabase {
    return dbManager.getDatabase() as SyncMetadataDatabase;
  }

  private async ensureLocalProfile(): Promise<NativeSyncProfile[]> {
    const profiles = await this.db().listSyncProfiles();
    if (profiles.some((profile) => profile.isLocal && profile.ownerDeviceId === this.deviceIdentity.deviceId)) {
      return profiles;
    }

    const config = await appConfigManager.getConfig();
    const exported = exportAppConfigForSync(config, {
      profileId: `local-${this.deviceIdentity.deviceId}`,
      ownerDeviceId: this.deviceIdentity.deviceId,
    });
    await this.upsertLocalProfileFromExport(exported.profile, profiles);
    await this.enqueueChangedObjects([exported.profile, ...exported.objects]);
    return this.db().listSyncProfiles();
  }

  private async captureAppConfigChange(config: AppConfig): Promise<void> {
    if (this.applyingRemoteProfile) {
      return;
    }

    const exported = exportAppConfigForSync(config, {
      profileId: `local-${this.deviceIdentity.deviceId}`,
      ownerDeviceId: this.deviceIdentity.deviceId,
    });
    const profiles = await this.db().listSyncProfiles();
    await this.upsertLocalProfileFromExport(exported.profile, profiles);
    const aiObjects = exportAiConfigForSync(config.features.aiAgent, {
      ownerDeviceId: this.deviceIdentity.deviceId,
      updatedAt: exported.profile.updatedAt,
    }).objects;
    await this.enqueueChangedObjects([exported.profile, ...exported.objects, ...aiObjects]);
    this.requestAutoSync?.();
  }

  private async captureCurrentSyncObjects(): Promise<void> {
    const config = await appConfigManager.getConfig();
    const exported = exportAppConfigForSync(config, {
      profileId: `local-${this.deviceIdentity.deviceId}`,
      ownerDeviceId: this.deviceIdentity.deviceId,
    });
    await this.upsertLocalProfileFromExport(exported.profile);
    const aiObjects = exportAiConfigForSync(config.features.aiAgent, {
      ownerDeviceId: this.deviceIdentity.deviceId,
      updatedAt: exported.profile.updatedAt,
    }).objects;
    const knowledgeObjects = await this.exportKnowledgeObjectsForSync();
    await this.clearStalePendingWikilinkOutbox(knowledgeObjects);
    await this.enqueueChangedObjects([exported.profile, ...exported.objects, ...aiObjects, ...knowledgeObjects]);
  }

  private async upsertLocalProfileFromExport(
    profileObject: SyncObjectEnvelope<AppConfig>,
    knownProfiles?: NativeSyncProfile[],
  ): Promise<void> {
    const profiles = knownProfiles ?? await this.db().listSyncProfiles();
    const existingProfile = profiles.find((profile) => profile.profileId === profileObject.objectId);
    const now = profileObject.updatedAt;
    await this.db().upsertSyncProfile({
      profileId: profileObject.objectId,
      profileName: `${this.deviceIdentity.deviceName} 本地配置`,
      ownerDeviceId: this.deviceIdentity.deviceId,
      schemaVersion: profileObject.schemaVersion,
      appVersion: this.deviceIdentity.appVersion,
      payloadHash: profileObject.payloadHash,
      isLocal: true,
      isActive: existingProfile?.isActive ?? profiles.every((item) => !item.isActive),
      isDefault: existingProfile?.isDefault ?? profiles.every((item) => !item.isDefault),
      payloadJson: JSON.stringify(profileObject.payload),
      createdAt: existingProfile?.createdAt ?? now,
      updatedAt: now,
    });
  }

  private async exportKnowledgeObjectsForSync(): Promise<SyncObjectEnvelope[]> {
    const database = this.db();
    if (!database.listKnowledgeLibraries || !database.listKnowledgeSpaces || !database.listKnowledgeTree) {
      return [];
    }

    const libraries = await database.listKnowledgeLibraries();
    const spaces = dedupeById((await Promise.all(
      libraries.map((library) => database.listKnowledgeSpaces?.(library.id) ?? Promise.resolve([])),
    )).flat());
    const nodes = dedupeById((await Promise.all(
      libraries.map((library) => database.listKnowledgeTree?.({
        libraryId: library.id,
        includeArchived: true,
      }) ?? Promise.resolve([])),
    )).flat());
    const tags = dedupeById((await Promise.all(
      libraries.map((library) => database.listKnowledgeTags?.({ libraryId: library.id }) ?? Promise.resolve([])),
    )).flat());
    const pageNodes = nodes.filter((node) => node.nodeType === 'page' || node.nodeType === 'document');
    const pageDetails = await Promise.all(pageNodes.map((node) => this.safeGetKnowledgePage(node.id)));
    const pages = pageDetails
      .filter((detail): detail is KnowledgePageDetail => Boolean(detail))
      .map((detail) => detail.page);
    const links = (await Promise.all(pageNodes.map((node) => this.safeListKnowledgePageLinks(node.id))))
      .flat();
    const assetIds = new Set<string>();
    for (const page of pages) {
      if (page.sourceAssetId) {
        assetIds.add(page.sourceAssetId);
      }
    }
    for (const link of links) {
      if (link.targetType === 'asset' && link.targetId) {
        assetIds.add(link.targetId);
      }
      if (link.sourceType === 'asset') {
        assetIds.add(link.sourceId);
      }
    }
    const assets = (await Promise.all(Array.from(assetIds).map((assetId) => this.safeGetKnowledgeAsset(assetId))))
      .filter((asset): asset is KnowledgeAsset => Boolean(asset));

    return exportKnowledgeForSync({
      libraries,
      spaces,
      nodes,
      pageDetails: pageDetails.filter((detail): detail is KnowledgePageDetail => Boolean(detail)),
      assets,
      tags,
      links,
    }, {
      ownerDeviceId: this.deviceIdentity.deviceId,
    }).objects;
  }

  private async findCurrentLocalObject(collection: SyncCollectionKind, objectId: string): Promise<SyncObjectEnvelope | null> {
    const config = await appConfigManager.getConfig();
    const exported = exportAppConfigForSync(config, {
      profileId: `local-${this.deviceIdentity.deviceId}`,
      ownerDeviceId: this.deviceIdentity.deviceId,
    });
    const aiObjects = exportAiConfigForSync(config.features.aiAgent, {
      ownerDeviceId: this.deviceIdentity.deviceId,
      updatedAt: Date.now(),
    }).objects;
    const knowledgeObjects = await this.exportKnowledgeObjectsForSync();
    return [exported.profile, ...exported.objects, ...aiObjects, ...knowledgeObjects]
      .find((object) => object.collection === collection && object.objectId === objectId) ?? null;
  }

  private async safeGetKnowledgePage(pageId: string): Promise<KnowledgePageDetail | null> {
    const database = this.db();
    if (!database.getKnowledgePage) {
      return null;
    }
    return database.getKnowledgePage(pageId).catch((): null => null);
  }

  private async safeListKnowledgePageLinks(pageId: string): Promise<KnowledgeLink[]> {
    const database = this.db();
    if (!database.listKnowledgePageLinks) {
      return [];
    }
    return database.listKnowledgePageLinks(pageId).catch((): KnowledgeLink[] => []);
  }

  private async safeGetKnowledgeAsset(assetId: string): Promise<KnowledgeAsset | null> {
    const database = this.db();
    if (!database.getKnowledgeAsset) {
      return null;
    }
    return database.getKnowledgeAsset(assetId).catch((): null => null);
  }

  private async getPendingAssetDiagnostics(
    collection: string,
    objectId: string,
    payload: unknown,
  ): Promise<Pick<SyncPendingItemSummary, 'assetFileBytes' | 'assetStoragePath' | 'assetRemoteKey'>> {
    if (collection !== 'knowledge.asset') {
      return {};
    }
    const asset = await this.safeGetKnowledgeAsset(objectId);
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const storagePath = asset?.storagePath || (typeof record.storagePath === 'string' ? record.storagePath : '');
    const hash = asset?.hash || (typeof record.hash === 'string' ? record.hash : '');
    const extension = asset?.extension || (typeof record.extension === 'string' ? record.extension : undefined);
    const assetFileBytes = storagePath && !storagePath.startsWith('sync-pending://')
      ? await stat(storagePath).then((info) => info.size).catch((): undefined => undefined)
      : typeof record.sizeBytes === 'number' ? record.sizeBytes : undefined;
    return {
      assetFileBytes,
      assetStoragePath: storagePath || undefined,
      assetRemoteKey: hash ? createKnowledgeAssetRemoteKey(hash, extension) : undefined,
    };
  }

  private async clearStalePendingWikilinkOutbox(knowledgeObjects: SyncObjectEnvelope[]): Promise<void> {
    const currentWikilinkIds = new Set(
      knowledgeObjects
        .filter((object) => object.collection === 'knowledge.link' && getKnowledgeLinkType(object.payload) === 'wikilink')
        .map((object) => object.objectId),
    );
    const pending = await this.db().listPendingSyncOutbox();
    const now = Date.now();
    for (const item of pending) {
      if (
        item.collection === 'knowledge.link'
        && !currentWikilinkIds.has(item.objectId)
        && getKnowledgeLinkType(parseJsonObject(item.payloadJson)) === 'wikilink'
      ) {
        await this.db().markSyncOutboxItemsSyncedByObject(item.collection, item.objectId, now);
      }
    }
  }

  private async uploadPendingKnowledgeAssets(
    provider: SyncProvider,
    objects: SyncObjectEnvelope[],
    onProgress?: (completed: number) => void,
  ): Promise<void> {
    const assetObjects = objects.filter((object) => object.collection === 'knowledge.asset' && !object.deleted);
    let completed = 0;
    for (const object of assetObjects) {
      const asset = await this.safeGetKnowledgeAsset(object.objectId);
      if (!asset || !asset.hash || asset.storagePath.startsWith('sync-pending://')) {
        completed += 1;
        onProgress?.(completed);
        continue;
      }
      const bytes = await readFile(asset.storagePath).catch((): null => null);
      if (!bytes) {
        completed += 1;
        onProgress?.(completed);
        continue;
      }
      const assetRemoteKey = createKnowledgeAssetRemoteKey(asset.hash, asset.extension);
      await provider.uploadAsset(assetRemoteKey, bytes, asset.mimeType || 'application/octet-stream').catch(async (error) => {
        const message = createSyncObjectFailureMessage(
          `附件上传失败，文件 ${formatBytes(bytes.byteLength)}，远端 ${assetRemoteKey}`,
          error,
        );
        await this.recordPendingFailureForObjects([object], message);
        throw error;
      });
      completed += 1;
      onProgress?.(completed);
    }
  }

  private async prepareRemoteKnowledgeAsset(object: SyncObjectEnvelope): Promise<unknown> {
    if (object.collection !== 'knowledge.asset' || !object.payload || typeof object.payload !== 'object') {
      return object.payload;
    }

    const record = object.payload as Record<string, unknown>;
    const hash = typeof record.hash === 'string' ? record.hash.trim() : '';
    if (!hash) {
      return object.payload;
    }

    const extension = typeof record.extension === 'string' ? record.extension : '';
    const assetPath = path.join(app.getPath('userData'), 'knowledge-assets', `${hash}${normalizeAssetExtension(extension)}`);
    const existing = await readFile(assetPath).catch((): null => null);
    if (!existing) {
      const provider = await this.createProvider();
      const bytes = await provider?.downloadAsset(createKnowledgeAssetRemoteKey(hash, extension));
      if (bytes) {
        await mkdir(path.dirname(assetPath), { recursive: true });
        await writeFile(assetPath, bytes, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') {
            throw error;
          }
        });
      }
    }

    return {
      ...record,
      storagePath: assetPath,
    };
  }

  private async enqueueChangedObjects(objects: SyncObjectEnvelope[], baseRevOverride?: string): Promise<void> {
    const states = await this.db().listSyncObjectStates();
    const pending = await this.db().listPendingSyncOutbox();
    for (const object of objects) {
      const state = states.find((item) => item.collection === object.collection && item.objectId === object.objectId);
      const opKind = object.deleted ? 'delete' : 'upsert';
      const pendingForObject = pending.filter((item) =>
        item.collection === object.collection
        && item.objectId === object.objectId);
      const hasSamePendingObject = pendingForObject.some((item) =>
        item.opKind === opKind
        && item.payloadHash === object.payloadHash);
      if (!baseRevOverride && state?.payloadHash === object.payloadHash && (!state.dirty || hasSamePendingObject)) {
        continue;
      }
      if (pendingForObject.length > 0) {
        await this.db().markSyncOutboxItemsSyncedByObject(object.collection, object.objectId, Date.now());
      }
      const baseRev = baseRevOverride ?? state?.remoteRev ?? state?.baseRev;
      const now = Date.now();
      await this.db().upsertSyncObjectState({
        collection: object.collection,
        objectId: object.objectId,
        ownerDeviceId: object.ownerDeviceId,
        schemaVersion: object.schemaVersion,
        baseRev,
        localRev: object.payloadHash,
        remoteRev: baseRevOverride ?? state?.remoteRev,
        payloadHash: object.payloadHash,
        dirty: true,
        deleted: object.deleted,
        updatedAt: now,
      });
      await this.db().upsertSyncOutboxItem({
        opId: createStableOutboxId(object),
        collection: object.collection,
        objectId: object.objectId,
        opKind,
        baseRev,
        payloadJson: JSON.stringify(object.payload),
        payloadHash: object.payloadHash,
        status: 'pending',
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private async recordPendingFailureForObjects(objects: SyncObjectEnvelope[], message: string): Promise<void> {
    const pending = await this.db().listPendingSyncOutbox();
    const now = Date.now();
    const keys = new Set(objects.map((object) => `${object.collection}:${object.objectId}`));
    for (const item of pending) {
      if (!keys.has(`${item.collection}:${item.objectId}`)) {
        continue;
      }
      await this.db().upsertSyncOutboxItem({
        ...item,
        status: 'pending',
        retryCount: item.retryCount + 1,
        lastError: `${item.collection}:${item.objectId} ${message}`,
        updatedAt: now,
      });
    }
  }

  private async recordPendingFailureForObject(collection: string, objectId: string, message: string): Promise<void> {
    const pending = await this.db().listPendingSyncOutbox();
    const item = pending.find((entry) => entry.collection === collection && entry.objectId === objectId);
    if (!item) {
      return;
    }
    await this.db().upsertSyncOutboxItem({
      ...item,
      status: 'pending',
      retryCount: item.retryCount + 1,
      lastError: `${collection}:${objectId} ${message}`,
      updatedAt: Date.now(),
    });
  }

  private async handleRemoteObject(object: SyncObjectEnvelope): Promise<{ pulled: number; conflicts: number; skipped: number }> {
    const states = await this.db().listSyncObjectStates();
    const state = states.find((item) => item.collection === object.collection && item.objectId === object.objectId);
    const remoteRev = getObjectRemoteRevision(object);
    if (state?.remoteRev === remoteRev && (!state.dirty || state.payloadHash === object.payloadHash)) {
      await this.clearPendingOutboxForObject(object);
      return { pulled: 0, conflicts: 0, skipped: 1 };
    }

    if (state?.dirty && state.remoteRev && state.remoteRev !== remoteRev) {
      await this.recordConflict(object, state);
      return { pulled: 0, conflicts: 1, skipped: 0 };
    }

    await this.applyRemoteObject(object);
    await this.recordAppliedRemoteObjectState(object);
    await this.clearPendingOutboxForObject(object);
    return { pulled: 1, conflicts: 0, skipped: 0 };
  }

  private async applyRemoteObject(object: SyncObjectEnvelope): Promise<void> {
    if (object.deleted) {
      await this.applyDeletedRemoteObject(object);
      return;
    }

    if (object.collection.startsWith('knowledge.')) {
      const database = this.db();
      if (!database.applyKnowledgeSyncObject) {
        return;
      }
      const payload = await this.prepareRemoteKnowledgeAsset(object);
      await database.applyKnowledgeSyncObject(object.collection, JSON.stringify(payload));
      return;
    }

    const patch = await this.createAppConfigPatchFromRemoteObject(object);
    if (!patch) {
      return;
    }

    await this.runWithoutCapturingLocalChanges(async () => {
      await appConfigManager.updateConfig(patch);
    });
  }

  private async applyDeletedRemoteObject(object: SyncObjectEnvelope): Promise<void> {
    if (object.collection.startsWith('knowledge.')) {
      if (object.collection === 'knowledge.folder' || object.collection === 'knowledge.page') {
        await this.db().deleteKnowledgeNode?.(object.objectId);
      }
      return;
    }
  }

  private async createAppConfigPatchFromRemoteObject(object: SyncObjectEnvelope): Promise<AppConfigPatch | null> {
    if (object.deleted) {
      return null;
    }

    if (object.collection === 'app.appearance') {
      return { appearance: object.payload as AppConfig['appearance'] };
    }
    if (object.collection === 'app.bottom_bar') {
      return { bottomBar: object.payload as AppConfig['bottomBar'] };
    }
    if (object.collection === 'app.shortcuts') {
      return { shortcuts: object.payload as AppConfig['shortcuts'] };
    }
    if (object.collection === 'app.features') {
      const config = await appConfigManager.getConfig();
      const sanitized = sanitizeRemoteAppConfigForApply({
        ...config,
        features: object.payload as AppConfig['features'],
      });
      return { features: sanitized.features };
    }
    if (object.collection === 'ai.assistant') {
      return this.createAiAssistantPatch(object.payload);
    }
    if (object.collection === 'ai.provider') {
      return this.createAiProviderPatch(object.payload);
    }
    if (object.collection === 'ai.model_config') {
      return this.createAiModelPatch(object.objectId, object.payload);
    }

    return null;
  }

  private async createAiAssistantPatch(payload: unknown): Promise<AppConfigPatch | null> {
    const assistant = payload as Partial<AiAssistantConfig> & { id?: string };
    if (!assistant.id) {
      return null;
    }
    const config = await appConfigManager.getConfig();
    const existing = config.features.aiAgent.assistants.find((item) => item.id === assistant.id);
    const nextAssistant: AiAssistantConfig = {
      ...createFallbackAssistant(assistant.id),
      ...existing,
      ...assistant,
      id: assistant.id,
    };
    return {
      features: {
        aiAgent: {
          assistants: upsertById(config.features.aiAgent.assistants, nextAssistant),
        },
      },
    };
  }

  private async createAiProviderPatch(payload: unknown): Promise<AppConfigPatch | null> {
    const provider = payload as Partial<AiProviderConfig> & { id?: string; hasCredential?: boolean };
    if (!provider.id || !provider.kind || !provider.name) {
      return null;
    }
    const config = await appConfigManager.getConfig();
    const existing = config.features.aiAgent.providers.find((item) => item.id === provider.id);
    const hasLocalCredential = Boolean(existing?.apiKey || existing?.apiKeyRef);
    const nextProvider: AiProviderConfig = {
      ...createFallbackProvider(provider.id),
      ...existing,
      ...provider,
      id: provider.id,
      kind: provider.kind,
      name: provider.name,
      apiKey: existing?.apiKey,
      apiKeyRef: existing?.apiKeyRef,
      models: (provider.models ?? existing?.models ?? []).map((model) => ({
        ...createFallbackModel(model.id),
        ...model,
      })),
      createdAt: existing?.createdAt ?? provider.createdAt ?? Date.now(),
      updatedAt: provider.updatedAt ?? Date.now(),
      enabled: hasLocalCredential ? Boolean(provider.enabled ?? existing?.enabled) : false,
    };
    return {
      features: {
        aiAgent: {
          providers: upsertById(config.features.aiAgent.providers, nextProvider),
        },
      },
    };
  }

  private async createAiModelPatch(objectId: string, payload: unknown): Promise<AppConfigPatch | null> {
    if (objectId === 'research-settings') {
      const research = payload as Partial<AppConfig['features']['aiAgent']['research']>;
      const config = await appConfigManager.getConfig();
      return {
        features: {
          aiAgent: {
            research: {
              ...config.features.aiAgent.research,
              ...research,
              webSearchApiKey: undefined,
            },
          },
        },
      };
    }

    const providerId = typeof (payload as Record<string, unknown>).providerId === 'string'
      ? (payload as Record<string, unknown>).providerId as string
      : objectId.split(':')[0];
    const model = payload as Partial<AiModelConfig> & { id?: string };
    if (!providerId || !model.id) {
      return null;
    }

    const config = await appConfigManager.getConfig();
    const provider = config.features.aiAgent.providers.find((item) => item.id === providerId);
    if (!provider) {
      return null;
    }
    const nextProvider: AiProviderConfig = {
      ...provider,
      models: upsertById(provider.models, {
        ...createFallbackModel(model.id),
        ...model,
        id: model.id,
      }),
      updatedAt: Date.now(),
    };
    return {
      features: {
        aiAgent: {
          providers: upsertById(config.features.aiAgent.providers, nextProvider),
        },
      },
    };
  }

  private async recordConflict(object: SyncObjectEnvelope, state: NativeSyncObjectState): Promise<void> {
    const existing = (await this.db().listSyncConflicts())
      .some((conflict) =>
        conflict.collection === object.collection
        && conflict.objectId === object.objectId
        && conflict.status === 'pending');
    if (existing) {
      return;
    }
    const now = Date.now();
    await this.db().upsertSyncConflict({
      conflictId: `${object.collection}:${object.objectId}:${object.payloadHash}`,
      collection: object.collection,
      objectId: object.objectId,
      title: getObjectTitle(object),
      localPayloadJson: JSON.stringify({
        collection: state.collection,
        objectId: state.objectId,
        payloadHash: state.payloadHash,
        localRev: state.localRev,
      }),
      remotePayloadJson: JSON.stringify(object.payload),
      basePayloadJson: state.baseRev ? JSON.stringify({ baseRev: state.baseRev }) : undefined,
      localUpdatedAt: state.updatedAt,
      remoteUpdatedAt: object.updatedAt,
      status: 'pending',
      createdAt: now,
    });
  }

  private async recordServerPushConflict(conflict: SyncProviderPushConflict): Promise<void> {
    const now = Date.now();
    const localObject = await this.findCurrentLocalObject(conflict.collection, conflict.objectId);
    const serverConflictId = conflict.conflictId;
    await this.db().upsertSyncConflict({
      conflictId: `${conflict.collection}:${conflict.objectId}:${serverConflictId ?? conflict.serverRev}`,
      collection: conflict.collection,
      objectId: conflict.objectId,
      title: getObjectTitle({
        collection: conflict.collection,
        objectId: conflict.objectId,
        ownerDeviceId: 'server',
        schemaVersion: 1,
        payloadHash: createHash('sha256').update(JSON.stringify(conflict.serverPayload)).digest('hex'),
        payload: conflict.serverPayload,
        deleted: conflict.deleted,
        updatedAt: now,
      }),
      localPayloadJson: JSON.stringify(localObject?.payload ?? conflict.attemptedPayload),
      remotePayloadJson: JSON.stringify(conflict.serverPayload),
      basePayloadJson: JSON.stringify({
        serverRev: conflict.serverRev,
        serverConflictId,
      }),
      localUpdatedAt: localObject?.updatedAt ?? now,
      remoteUpdatedAt: now,
      status: 'pending',
      createdAt: now,
    });
  }

  private async resolveServerConflictIfNeeded(
    conflict: NativeSyncConflict,
    resolution: SyncConflictResolution,
  ): Promise<void> {
    const { serverConflictId } = parseServerConflictMetadata(conflict.basePayloadJson);
    if (!serverConflictId) {
      return;
    }

    const config = await readSyncProviderRuntimeConfig();
    if (config.providerKind !== 'sync-server' || !config.syncServer?.endpoint) {
      return;
    }

    const provider = this.createSyncServerProvider(config.syncServer);
    await provider.resolveConflict(serverConflictId, resolution);
  }

  private async clearPendingOutboxForObject(object: Pick<SyncObjectEnvelope, 'collection' | 'objectId'>): Promise<void> {
    await this.db().markSyncOutboxItemsSyncedByObject(object.collection, object.objectId, Date.now());
  }

  private async resolvePendingConflictsForObject(object: Pick<SyncObjectEnvelope, 'collection' | 'objectId'>): Promise<void> {
    const now = Date.now();
    const conflicts = await this.db().listSyncConflicts();
    for (const conflict of conflicts) {
      if (conflict.collection === object.collection && conflict.objectId === object.objectId && conflict.status === 'pending') {
        await this.db().resolveSyncConflict(conflict.conflictId, now);
      }
    }
  }

  private async storeKeepBothRemoteProfile(conflict: NativeSyncConflict, remoteObject: SyncObjectEnvelope): Promise<void> {
    const config = await appConfigManager.getConfig();
    const remoteConfig = createRemoteConfigForKeepBoth(config, remoteObject);
    const payload = sanitizeRemoteAppConfigForApply(remoteConfig);
    const payloadJson = JSON.stringify(payload);
    const now = Date.now();
    await this.db().upsertSyncProfile({
      profileId: `keep-both-${remoteObject.collection}-${remoteObject.objectId}-${createHash('sha256').update(payloadJson).digest('hex').slice(0, 12)}`,
      profileName: `保留远端配置 ${getObjectTitle(remoteObject)}`,
      ownerDeviceId: remoteObject.ownerDeviceId,
      schemaVersion: remoteObject.schemaVersion,
      appVersion: '',
      payloadHash: createHash('sha256').update(payloadJson).digest('hex'),
      isLocal: false,
      isActive: false,
      isDefault: false,
      payloadJson,
      createdAt: conflict.remoteUpdatedAt || now,
      updatedAt: conflict.remoteUpdatedAt || now,
    });
  }

  private async recordAppliedRemoteObjectState(object: SyncObjectEnvelope): Promise<void> {
    const localObject = await this.findCurrentLocalObject(object.collection, object.objectId);
    await this.recordObjectState({
      ...object,
      payload: localObject?.payload ?? object.payload,
      payloadHash: localObject?.payloadHash ?? object.payloadHash,
      updatedAt: localObject?.updatedAt ?? object.updatedAt,
    }, false);
  }

  private async recordObjectState(object: SyncObjectEnvelope, dirty: boolean): Promise<void> {
    const remoteRev = getObjectRemoteRevision(object);
    await this.db().upsertSyncObjectState({
      collection: object.collection,
      objectId: object.objectId,
      ownerDeviceId: object.ownerDeviceId,
      schemaVersion: object.schemaVersion,
      baseRev: remoteRev,
      localRev: object.payloadHash,
      remoteRev,
      payloadHash: object.payloadHash,
      dirty,
      deleted: object.deleted,
      updatedAt: object.updatedAt,
    });
  }

  private async markObjectClean(object: SyncObjectEnvelope, updatedAt: number, serverRev?: string): Promise<void> {
    const remoteRev = serverRev || getObjectRemoteRevision(object);
    await this.db().upsertSyncObjectState({
      collection: object.collection,
      objectId: object.objectId,
      ownerDeviceId: object.ownerDeviceId,
      schemaVersion: object.schemaVersion,
      baseRev: remoteRev,
      localRev: object.payloadHash,
      remoteRev,
      payloadHash: object.payloadHash,
      dirty: false,
      deleted: object.deleted,
      updatedAt,
    });
  }

  private async refreshStateFromProfiles() {
    const [profiles, conflicts, pending] = await Promise.all([
      this.db().listSyncProfiles(),
      this.db().listSyncConflicts(),
      this.db().listPendingSyncOutbox(),
    ]);
    const active = profiles.find((profile) => profile.isActive);
    const defaultProfile = profiles.find((profile) => profile.isDefault);
    this.state = {
      ...this.state,
      conflictCount: conflicts.length,
      pendingCount: pending.length,
      activeProfileId: active?.profileId ?? '',
      defaultProfileId: defaultProfile?.profileId ?? '',
    };
    this.emit({ type: 'state-changed', state: { ...this.state } });
  }

  private updateSyncProgress(phase: SyncRunPhase, completed: number, total: number): void {
    const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((completed / total) * 100))) : 100;
    this.setSyncProgress({
      phase,
      completed,
      total,
      percent,
    });
  }

  private toProfileSummary(profile: NativeSyncProfile): SyncProfileSummary {
    return {
      profileId: profile.profileId,
      profileName: profile.profileName,
      ownerDeviceId: profile.ownerDeviceId,
      ownerDeviceName: profile.ownerDeviceId === this.deviceIdentity.deviceId
        ? this.deviceIdentity.deviceName
        : profile.ownerDeviceId,
      schemaVersion: profile.schemaVersion,
      appVersion: profile.appVersion,
      payloadHash: profile.payloadHash,
      updatedAt: profile.updatedAt,
      isLocal: profile.isLocal,
      isActive: profile.isActive,
      isDefault: profile.isDefault,
    };
  }

  private async createProvider(): Promise<SyncProvider | null> {
    const config = await readSyncProviderRuntimeConfig();
    if (config.providerKind === 'sync-server' && config.syncServer?.endpoint) {
      return this.createSyncServerProvider(config.syncServer);
    }

    if (config.providerKind !== 'webdav' || !config.webdav?.username || !config.webdav.hasPassword) {
      return null;
    }

    return new WebDavSyncProvider({
      endpoint: config.webdav.endpoint,
      username: config.webdav.username,
      password: await readWebDavPassword(),
      remoteRoot: config.webdav.remoteRoot,
    });
  }

  private createSyncServerProvider(config: NonNullable<SyncProviderConfig['syncServer']>): SyncServerProvider {
    return new SyncServerProvider({
      ...config,
      onTokensRefreshed: async (tokens) => {
        await updateSyncServerConfig({
          endpoint: config.endpoint,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      },
    });
  }
}

function currentPlatformKey(): SyncDeviceIdentity['platform'] {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux') return 'linux';
  return 'unknown';
}

function createStableDeviceId() {
  const seed = `${os.hostname() || 'device'}:${process.platform}:${app.getPath('userData')}`;
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

function getRemoteProfileName(payload: unknown) {
  if (payload && typeof payload === 'object') {
    return '远程应用配置';
  }
  return '远程配置';
}

function createSafeAppConfigPatchFromSyncProfile(profile: SyncObjectEnvelope<AppConfig>): AppConfigPatch {
  return createAppConfigPatchFromSyncProfile({
    ...profile,
    payload: sanitizeRemoteAppConfigForApply(profile.payload),
  });
}

function sanitizeRemoteAppConfigForApply(config: AppConfig): AppConfig {
  const sanitized = sanitizeAppConfigForSync(config);
  return {
    ...sanitized,
    features: {
      ...sanitized.features,
      aiAgent: {
        ...sanitized.features.aiAgent,
        providers: sanitized.features.aiAgent.providers.map((provider) => ({
          ...provider,
          enabled: false,
        })),
      },
    },
  };
}

function outboxItemToEnvelope(item: NativeSyncOutboxItem, ownerDeviceId: string): SyncObjectEnvelope {
  return {
    collection: item.collection as SyncCollectionKind,
    objectId: item.objectId,
    ownerDeviceId,
    schemaVersion: 1,
    baseRev: item.baseRev,
    localRev: item.payloadHash,
    payloadHash: item.payloadHash,
    payload: parseJsonObject(item.payloadJson),
    deleted: item.opKind === 'delete',
    updatedAt: item.updatedAt,
  };
}

function estimateSyncObjectRequestBytes(item: NativeSyncOutboxItem, payload: unknown): number {
  return byteLengthUtf8(JSON.stringify({
    collection: item.collection,
    objectId: item.objectId,
    baseRev: item.baseRev,
    payload,
    deleted: item.opKind === 'delete',
  }));
}

function estimateProviderPushRequestBytes(input: {
  deviceId: string;
  profiles: SyncObjectEnvelope[];
  objects: SyncObjectEnvelope[];
  tombstones: SyncObjectEnvelope[];
}): number {
  return byteLengthUtf8(JSON.stringify({
    deviceId: input.deviceId,
    opId: 'diagnostic',
    objects: [...input.profiles, ...input.objects].map(toProviderRequestObject),
    tombstones: input.tombstones.map((object) => ({
      ...toProviderRequestObject(object),
      deleted: true,
    })),
  }));
}

function toProviderRequestObject(object: SyncObjectEnvelope) {
  return {
    collection: object.collection,
    objectId: object.objectId,
    baseRev: object.baseRev,
    payload: object.payload,
    deleted: object.deleted,
  };
}

function byteLengthUtf8(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '未知大小';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function createSyncObjectFailureMessage(context: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${context}：${message}`;
}

function createPendingItemTitle(item: NativeSyncOutboxItem): string {
  const operation = item.opKind === 'delete' ? '删除' : '更新';
  return `${operation} ${item.collection}:${item.objectId}`;
}

function syncProfileToEnvelope(profile: NativeSyncProfile, state?: NativeSyncObjectState): SyncObjectEnvelope<AppConfig> {
  return {
    collection: 'app.profile',
    objectId: profile.profileId,
    ownerDeviceId: profile.ownerDeviceId,
    schemaVersion: profile.schemaVersion,
    baseRev: state?.remoteRev ?? state?.baseRev,
    localRev: profile.payloadHash,
    remoteRev: state?.remoteRev,
    payloadHash: profile.payloadHash,
    payload: JSON.parse(profile.payloadJson) as AppConfig,
    deleted: false,
    updatedAt: profile.updatedAt,
  };
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getKnowledgeLinkType(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as Record<string, unknown>;
  return typeof record.linkType === 'string' ? record.linkType : '';
}

function isAppConfigCollection(collection: SyncCollectionKind): boolean {
  return collection === 'app.appearance'
    || collection === 'app.bottom_bar'
    || collection === 'app.shortcuts'
    || collection === 'app.features'
    || collection === 'app.profile';
}

function createRemoteConfigForKeepBoth(config: AppConfig, remoteObject: SyncObjectEnvelope): AppConfig {
  if (remoteObject.collection === 'app.profile') {
    return remoteObject.payload as AppConfig;
  }
  if (remoteObject.collection === 'app.appearance') {
    return {
      ...config,
      appearance: remoteObject.payload as AppConfig['appearance'],
    };
  }
  if (remoteObject.collection === 'app.bottom_bar') {
    return {
      ...config,
      bottomBar: remoteObject.payload as AppConfig['bottomBar'],
    };
  }
  if (remoteObject.collection === 'app.shortcuts') {
    return {
      ...config,
      shortcuts: remoteObject.payload as AppConfig['shortcuts'],
    };
  }
  if (remoteObject.collection === 'app.features') {
    return {
      ...config,
      features: remoteObject.payload as AppConfig['features'],
    };
  }
  return config;
}

function isLikelyOfflineError(message: string): boolean {
  return /network|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|offline/i.test(message);
}

function parseServerConflictMetadata(value?: string): { serverRev?: string; serverConflictId?: string } {
  if (!value) {
    return {};
  }
  const metadata = parseJsonObject(value);
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const record = metadata as Record<string, unknown>;
  return {
    serverRev: typeof record.serverRev === 'string'
      ? record.serverRev
      : typeof record.baseRev === 'string' ? record.baseRev : undefined,
    serverConflictId: typeof record.serverConflictId === 'string' ? record.serverConflictId : undefined,
  };
}

function normalizeAssetExtension(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9.]/g, '');
  if (!normalized) {
    return '';
  }
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function sortRemoteObjectsForApply(objects: SyncObjectEnvelope[]): SyncObjectEnvelope[] {
  const order: Partial<Record<SyncCollectionKind, number>> = {
    'knowledge.library': 10,
    'knowledge.space': 20,
    'knowledge.folder': 30,
    'knowledge.asset': 40,
    'knowledge.page': 50,
    'knowledge.tag': 60,
    'knowledge.link': 70,
  };
  return [...objects].sort((left, right) => {
    const leftOrder = order[left.collection] ?? 0;
    const rightOrder = order[right.collection] ?? 0;
    return leftOrder - rightOrder;
  });
}

function duplicateRemoteObjectForKeepBoth(object: SyncObjectEnvelope): SyncObjectEnvelope {
  const duplicatedId = `${object.objectId}-remote-${object.ownerDeviceId}`;
  const payload = duplicateKnowledgePayload(object.payload, duplicatedId);
  return {
    ...object,
    objectId: duplicatedId,
    payload,
    payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    updatedAt: Date.now(),
  };
}

function duplicateKnowledgePayload(payload: unknown, duplicatedId: string): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if (record.node && typeof record.node === 'object' && record.page && typeof record.page === 'object') {
    return {
      ...record,
      node: {
        ...(record.node as Record<string, unknown>),
        id: duplicatedId,
        parentId: undefined,
      },
      page: {
        ...(record.page as Record<string, unknown>),
        id: duplicatedId,
      },
    };
  }
  if (typeof record.id === 'string') {
    return {
      ...record,
      id: duplicatedId,
      parentId: undefined,
    };
  }
  return payload;
}

function createStableOutboxId(object: SyncObjectEnvelope) {
  return `${object.collection}:${object.objectId}:${object.payloadHash}:${randomUUID()}`;
}

function getObjectRemoteRevision(object: SyncObjectEnvelope): string {
  return object.remoteRev || object.baseRev || object.payloadHash;
}

function createAppliedRevisionMap(applied: SyncProviderAppliedObject[]): Map<string, string> {
  return new Map(applied.map((item) => [`${item.collection}:${item.objectId}`, item.serverRev]));
}

function dedupeSyncObjectsByIdentity(objects: SyncObjectEnvelope[]): SyncObjectEnvelope[] {
  return Array.from(
    objects.reduce((items, object) => {
      items.set(`${object.collection}:${object.objectId}`, object);
      return items;
    }, new Map<string, SyncObjectEnvelope>()).values(),
  );
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(
    items.reduce((deduped, item) => {
      deduped.set(item.id, item);
      return deduped;
    }, new Map<string, T>()).values(),
  );
}

function getObjectTitle(object: SyncObjectEnvelope) {
  const payload = object.payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['title', 'name', 'displayName', 'originalName']) {
      if (typeof record[key] === 'string' && record[key]) {
        return record[key];
      }
    }
  }
  return `${object.collection}:${object.objectId}`;
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) {
    return [...items, next];
  }
  return items.map((item, itemIndex) => itemIndex === index ? next : item);
}

function createFallbackAssistant(id: string): AiAssistantConfig {
  const now = Date.now();
  return {
    id,
    name: '远程助手',
    emoji: 'AI',
    systemPrompt: '',
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
    createdAt: now,
    updatedAt: now,
  };
}

function createFallbackProvider(id: string): AiProviderConfig {
  const now = Date.now();
  return {
    id,
    kind: 'openai-compatible',
    name: '远程模型服务',
    enabled: false,
    models: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createFallbackModel(id: string): AiModelConfig {
  return {
    id,
    displayName: id,
    providerModelId: id,
    capabilities: {
      streaming: true,
      vision: false,
      toolCalling: false,
      structuredOutput: false,
      reasoning: false,
      embedding: false,
      nativeWebSearch: false,
      nativeFileSearch: false,
    },
  };
}

function conflictToRemoteEnvelope(conflict: NativeSyncConflict): SyncObjectEnvelope {
  const payload = parseJsonObject(conflict.remotePayloadJson);
  const { serverRev } = parseServerConflictMetadata(conflict.basePayloadJson);
  const body = JSON.stringify(payload);
  return {
    collection: conflict.collection as SyncCollectionKind,
    objectId: conflict.objectId,
    ownerDeviceId: 'remote',
    schemaVersion: 1,
    baseRev: serverRev,
    remoteRev: serverRev,
    payloadHash: createHash('sha256').update(body).digest('hex'),
    payload,
    deleted: false,
    updatedAt: conflict.remoteUpdatedAt,
  };
}

function conflictToLocalEnvelope(conflict: NativeSyncConflict, ownerDeviceId: string): SyncObjectEnvelope {
  const payload = parseJsonObject(conflict.localPayloadJson);
  const payloadHash = typeof (payload as Record<string, unknown>).payloadHash === 'string'
    ? (payload as Record<string, unknown>).payloadHash as string
    : createHash('sha256').update(conflict.localPayloadJson).digest('hex');
  return {
    collection: conflict.collection as SyncCollectionKind,
    objectId: conflict.objectId,
    ownerDeviceId,
    schemaVersion: 1,
    payloadHash,
    payload,
    deleted: false,
    updatedAt: Date.now(),
  };
}

export const syncService = new SyncService();
