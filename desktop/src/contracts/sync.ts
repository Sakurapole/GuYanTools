export type SyncProviderKind = 'webdav' | 'sync-server';
export type SecretSyncMode = 'disabled' | 'encrypted';

export type SyncCollectionKind =
  | 'app.profile'
  | 'app.appearance'
  | 'app.bottom_bar'
  | 'app.shortcuts'
  | 'app.features'
  | 'knowledge.library'
  | 'knowledge.space'
  | 'knowledge.folder'
  | 'knowledge.page'
  | 'knowledge.asset'
  | 'knowledge.tag'
  | 'knowledge.link'
  | 'ai.assistant'
  | 'ai.provider'
  | 'ai.model_config';

export type SyncStatus =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'conflict'
  | 'device_revoked';

export type SyncConflictResolution = 'use-local' | 'use-remote' | 'keep-both' | 'manual';
export type SyncRunPhase = 'download' | 'upload';

export interface SyncRunProgress {
  phase: SyncRunPhase;
  percent: number;
  completed: number;
  total: number;
}

export interface SyncDeviceIdentity {
  deviceId: string;
  deviceName: string;
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';
  appVersion: string;
  createdAt: number;
}

export interface SyncProfileSummary {
  profileId: string;
  profileName: string;
  ownerDeviceId: string;
  ownerDeviceName: string;
  schemaVersion: number;
  appVersion: string;
  payloadHash: string;
  updatedAt: number;
  isLocal: boolean;
  isActive: boolean;
  isDefault: boolean;
}

export interface SyncObjectEnvelope<TPayload = unknown> {
  collection: SyncCollectionKind;
  objectId: string;
  ownerDeviceId: string;
  schemaVersion: number;
  baseRev?: string;
  localRev?: string;
  remoteRev?: string;
  payloadHash: string;
  payload: TPayload;
  deleted: boolean;
  updatedAt: number;
}

export interface SyncConflictSummary {
  conflictId: string;
  collection: SyncCollectionKind;
  objectId: string;
  title: string;
  localDeviceName: string;
  remoteDeviceName: string;
  localUpdatedAt: number;
  remoteUpdatedAt: number;
  status: 'pending' | 'resolved';
}

export interface SyncPendingItemSummary {
  id: string;
  collection: SyncCollectionKind;
  objectId: string;
  operation: 'upsert' | 'delete';
  title: string;
  payloadHash: string;
  payloadBytes: number;
  requestBytes?: number;
  assetFileBytes?: number;
  assetStoragePath?: string;
  assetRemoteKey?: string;
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncCenterState {
  enabled: boolean;
  providerKind: SyncProviderKind;
  status: SyncStatus;
  lastSuccessAt?: number;
  lastError?: string;
  syncProgress?: SyncRunProgress | null;
  pendingCount: number;
  conflictCount: number;
  activeProfileId: string;
  defaultProfileId: string;
}

export interface SyncConnectionResult {
  ok: boolean;
  message: string;
}

export interface SyncWebDavProviderConfig {
  preset: 'jianguoyun' | 'custom';
  endpoint: string;
  username: string;
  remoteRoot: string;
  hasPassword: boolean;
}

export interface SyncServerProviderConfig {
  endpoint: string;
  deviceId: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasDeviceToken: boolean;
  cursor: number;
}

export interface SyncProviderConfig {
  providerKind: SyncProviderKind;
  webdav?: SyncWebDavProviderConfig;
  syncServer?: SyncServerProviderConfig;
  secretSyncMode: SecretSyncMode;
}

export interface UpdateSyncWebDavConfigPayload {
  preset: 'jianguoyun' | 'custom';
  endpoint: string;
  username: string;
  remoteRoot: string;
  password?: string;
}

export interface UpdateSyncServerConfigPayload {
  endpoint: string;
  deviceId?: string;
}

export interface SyncServerLoginPayload {
  endpoint: string;
  email: string;
  password: string;
  deviceName: string;
  platform?: SyncDeviceIdentity['platform'];
}

export interface SyncServerLoginResult {
  userId: string;
  deviceId: string;
  deviceName: string;
  platform: SyncDeviceIdentity['platform'];
}

export interface SyncRunSummary {
  pushed: number;
  pulled: number;
  conflicts: number;
  skipped: number;
  startedAt: number;
  finishedAt: number;
}

export type SyncEvent =
  | { type: 'state-changed'; state: SyncCenterState }
  | { type: 'profiles-changed' }
  | { type: 'conflicts-changed' }
  | { type: 'sync-finished'; summary: SyncRunSummary };

export interface SyncApi {
  getState: () => Promise<SyncCenterState>;
  listProfiles: () => Promise<SyncProfileSummary[]>;
  listConflicts: () => Promise<SyncConflictSummary[]>;
  listPendingItems: () => Promise<SyncPendingItemSummary[]>;
  getProviderConfig: () => Promise<SyncProviderConfig>;
  updateWebDavConfig: (payload: UpdateSyncWebDavConfigPayload) => Promise<SyncProviderConfig>;
  updateSyncServerConfig: (payload: UpdateSyncServerConfigPayload) => Promise<SyncProviderConfig>;
  loginSyncServer: (payload: SyncServerLoginPayload) => Promise<SyncServerLoginResult>;
  logoutSyncServer: () => Promise<SyncProviderConfig>;
  testConnection: () => Promise<SyncConnectionResult>;
  syncNow: () => Promise<SyncRunSummary>;
  applyProfile: (profileId: string) => Promise<void>;
  setDefaultProfile: (profileId: string) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: SyncConflictResolution) => Promise<void>;
  onEvent: (listener: (event: SyncEvent) => void) => () => void;
}
