import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SyncProviderConfig, UpdateSyncServerConfigPayload, UpdateSyncWebDavConfigPayload } from '@/contracts/sync';
import type { SyncServerProviderOptions } from './providers/sync_server_provider';
import { JIANGUOYUN_WEBDAV_PRESET } from './providers/webdav_provider';
import { deleteSyncSecret, readSyncSecret, saveSyncSecret } from './secret_store';

const CONFIG_FILE = path.join(app.getPath('userData'), 'sync', 'provider-config.json');
const WEBDAV_PASSWORD_KEY = 'webdav.password';
const SYNC_SERVER_ACCESS_TOKEN_KEY = 'sync-server.access-token';
const SYNC_SERVER_REFRESH_TOKEN_KEY = 'sync-server.refresh-token';
const SYNC_SERVER_DEVICE_TOKEN_KEY = 'sync-server.device-token';

type RuntimeSyncServerConfig = SyncProviderConfig['syncServer'] & Pick<SyncServerProviderOptions, 'accessToken' | 'refreshToken' | 'deviceToken'>;
type RuntimeSyncProviderConfig = SyncProviderConfig & {
  syncServer?: RuntimeSyncServerConfig;
};
export type UpdateSyncServerRuntimeConfigPayload = UpdateSyncServerConfigPayload & Pick<SyncServerProviderOptions, 'accessToken' | 'refreshToken' | 'deviceToken'>;

export async function readSyncProviderConfig(): Promise<SyncProviderConfig> {
  return toRendererProviderConfig(await readSyncProviderRuntimeConfig());
}

export async function readSyncProviderRuntimeConfig(): Promise<RuntimeSyncProviderConfig> {
  const raw = await readFile(CONFIG_FILE, 'utf8').catch(() => '');
  if (!raw) {
    return createDefaultProviderRuntimeConfig();
  }

  try {
    const parsed = JSON.parse(raw) as SyncProviderConfig & { syncServer?: Record<string, unknown> };
    const legacySyncServer = parsed.syncServer;
    const shouldCleanLegacySecrets = hasLegacySyncServerSecrets(legacySyncServer);
    await migrateLegacySyncServerSecret(SYNC_SERVER_ACCESS_TOKEN_KEY, legacySyncServer?.accessToken);
    await migrateLegacySyncServerSecret(SYNC_SERVER_REFRESH_TOKEN_KEY, legacySyncServer?.refreshToken);
    await migrateLegacySyncServerSecret(SYNC_SERVER_DEVICE_TOKEN_KEY, legacySyncServer?.deviceToken);
    const accessToken = await readSyncSecret(SYNC_SERVER_ACCESS_TOKEN_KEY);
    const refreshToken = await readSyncSecret(SYNC_SERVER_REFRESH_TOKEN_KEY);
    const deviceToken = await readSyncSecret(SYNC_SERVER_DEVICE_TOKEN_KEY);
    const config: RuntimeSyncProviderConfig = {
      providerKind: parsed.providerKind === 'sync-server' ? 'sync-server' : 'webdav',
      secretSyncMode: parsed.secretSyncMode === 'encrypted' ? 'encrypted' : 'disabled',
      webdav: parsed.webdav ? {
        preset: parsed.webdav.preset === 'custom' ? 'custom' : 'jianguoyun',
        endpoint: parsed.webdav.endpoint || JIANGUOYUN_WEBDAV_PRESET.endpoint,
        username: parsed.webdav.username || '',
        remoteRoot: parsed.webdav.remoteRoot || JIANGUOYUN_WEBDAV_PRESET.remoteRoot,
        hasPassword: Boolean(parsed.webdav.hasPassword),
      } : createDefaultProviderRuntimeConfig().webdav,
      syncServer: parsed.syncServer ? {
        endpoint: typeof parsed.syncServer.endpoint === 'string' ? parsed.syncServer.endpoint : '',
        deviceId: typeof parsed.syncServer.deviceId === 'string' ? parsed.syncServer.deviceId : '',
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        hasDeviceToken: Boolean(deviceToken),
        accessToken,
        refreshToken,
        deviceToken,
        cursor: typeof parsed.syncServer.cursor === 'number' && Number.isFinite(parsed.syncServer.cursor) ? parsed.syncServer.cursor : 0,
      } : createDefaultProviderRuntimeConfig().syncServer,
    };
    if (shouldCleanLegacySecrets) {
      await writeProviderConfig(config);
    }
    return config;
  } catch {
    return createDefaultProviderRuntimeConfig();
  }
}

export async function updateSyncServerConfig(payload: UpdateSyncServerRuntimeConfigPayload): Promise<SyncProviderConfig> {
  const current = await readSyncProviderRuntimeConfig();
  await saveOptionalSyncSecret(SYNC_SERVER_ACCESS_TOKEN_KEY, payload.accessToken);
  await saveOptionalSyncSecret(SYNC_SERVER_REFRESH_TOKEN_KEY, payload.refreshToken);
  await saveOptionalSyncSecret(SYNC_SERVER_DEVICE_TOKEN_KEY, payload.deviceToken);
  const accessToken = payload.accessToken?.trim() ?? current.syncServer?.accessToken ?? '';
  const refreshToken = payload.refreshToken?.trim() ?? current.syncServer?.refreshToken ?? '';
  const deviceToken = payload.deviceToken?.trim() ?? current.syncServer?.deviceToken ?? '';
  const next: RuntimeSyncProviderConfig = {
    ...current,
    providerKind: 'sync-server',
    syncServer: {
      endpoint: payload.endpoint.trim(),
      deviceId: payload.deviceId?.trim() || current.syncServer?.deviceId || '',
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      hasDeviceToken: Boolean(deviceToken),
      accessToken,
      refreshToken,
      deviceToken,
      cursor: current.syncServer?.cursor ?? 0,
    },
  };
  await writeProviderConfig(next);
  return toRendererProviderConfig(next);
}

export async function clearSyncServerBinding(): Promise<SyncProviderConfig> {
  const current = await readSyncProviderRuntimeConfig();
  await deleteSyncSecret(SYNC_SERVER_ACCESS_TOKEN_KEY);
  await deleteSyncSecret(SYNC_SERVER_REFRESH_TOKEN_KEY);
  await deleteSyncSecret(SYNC_SERVER_DEVICE_TOKEN_KEY);
  const next: RuntimeSyncProviderConfig = {
    ...current,
    syncServer: {
      ...(current.syncServer ?? createDefaultProviderRuntimeConfig().syncServer!),
      deviceId: '',
      hasAccessToken: false,
      hasRefreshToken: false,
      hasDeviceToken: false,
      accessToken: '',
      refreshToken: '',
      deviceToken: '',
      cursor: 0,
    },
  };
  await writeProviderConfig(next);
  return toRendererProviderConfig(next);
}

export async function updateSyncServerCursor(cursor: number): Promise<SyncProviderConfig> {
  const current = await readSyncProviderRuntimeConfig();
  const next: RuntimeSyncProviderConfig = {
    ...current,
    syncServer: {
      ...(current.syncServer ?? createDefaultProviderRuntimeConfig().syncServer!),
      cursor: Math.max(0, Math.floor(cursor)),
    },
  };
  await writeProviderConfig(next);
  return toRendererProviderConfig(next);
}

export async function updateSyncWebDavConfig(payload: UpdateSyncWebDavConfigPayload): Promise<SyncProviderConfig> {
  const current = await readSyncProviderRuntimeConfig();
  if (payload.password !== undefined) {
    await saveSyncSecret(WEBDAV_PASSWORD_KEY, payload.password);
  }

  const next: RuntimeSyncProviderConfig = {
    ...current,
    providerKind: 'webdav',
    webdav: {
      preset: payload.preset,
      endpoint: payload.endpoint.trim() || JIANGUOYUN_WEBDAV_PRESET.endpoint,
      username: payload.username.trim(),
      remoteRoot: payload.remoteRoot.trim() || JIANGUOYUN_WEBDAV_PRESET.remoteRoot,
      hasPassword: payload.password !== undefined ? payload.password.length > 0 : Boolean(current.webdav?.hasPassword),
    },
  };
  await writeProviderConfig(next);
  return toRendererProviderConfig(next);
}

export async function readWebDavPassword(): Promise<string> {
  return readSyncSecret(WEBDAV_PASSWORD_KEY);
}

function createDefaultProviderRuntimeConfig(): RuntimeSyncProviderConfig & { syncServer: RuntimeSyncServerConfig } {
  return {
    providerKind: 'webdav',
    secretSyncMode: 'disabled',
    webdav: {
      preset: 'jianguoyun',
      endpoint: JIANGUOYUN_WEBDAV_PRESET.endpoint,
      username: '',
      remoteRoot: JIANGUOYUN_WEBDAV_PRESET.remoteRoot,
      hasPassword: false,
    },
    syncServer: {
      endpoint: 'http://127.0.0.1:38420/',
      deviceId: '',
      hasAccessToken: false,
      hasRefreshToken: false,
      hasDeviceToken: false,
      accessToken: '',
      refreshToken: '',
      deviceToken: '',
      cursor: 0,
    },
  };
}

async function writeProviderConfig(config: RuntimeSyncProviderConfig | SyncProviderConfig) {
  await mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(toPersistedProviderConfig(config), null, 2), 'utf8');
}

async function saveOptionalSyncSecret(key: string, value?: string): Promise<void> {
  if (value === undefined) {
    return;
  }
  await saveSyncSecret(key, value.trim());
}

async function migrateLegacySyncServerSecret(key: string, value: unknown): Promise<void> {
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }
  const existing = await readSyncSecret(key);
  if (existing) {
    return;
  }
  await saveSyncSecret(key, value.trim());
}

function hasLegacySyncServerSecrets(syncServer: Record<string, unknown> | undefined): boolean {
  return Boolean(
    typeof syncServer?.accessToken === 'string'
    || typeof syncServer?.refreshToken === 'string'
    || typeof syncServer?.deviceToken === 'string',
  );
}

function toPersistedProviderConfig(config: SyncProviderConfig): Record<string, unknown> {
  return {
    providerKind: config.providerKind,
    secretSyncMode: config.secretSyncMode,
    webdav: config.webdav,
    syncServer: config.syncServer ? {
      endpoint: config.syncServer.endpoint,
      deviceId: config.syncServer.deviceId,
      cursor: config.syncServer.cursor,
    } : undefined,
  };
}

function toRendererProviderConfig(config: RuntimeSyncProviderConfig | SyncProviderConfig): SyncProviderConfig {
  const syncServerRecord = (config.syncServer ?? {}) as unknown as Record<string, unknown>;
  const accessToken = 'accessToken' in syncServerRecord ? syncServerRecord.accessToken : undefined;
  const refreshToken = 'refreshToken' in syncServerRecord ? syncServerRecord.refreshToken : undefined;
  const deviceToken = 'deviceToken' in syncServerRecord ? syncServerRecord.deviceToken : undefined;
  return {
    providerKind: config.providerKind,
    secretSyncMode: config.secretSyncMode,
    webdav: config.webdav,
    syncServer: config.syncServer ? {
      endpoint: config.syncServer.endpoint,
      deviceId: config.syncServer.deviceId,
      hasAccessToken: Boolean(accessToken || config.syncServer.hasAccessToken),
      hasRefreshToken: Boolean(refreshToken || config.syncServer.hasRefreshToken),
      hasDeviceToken: Boolean(deviceToken || config.syncServer.hasDeviceToken),
      cursor: config.syncServer.cursor,
    } : undefined,
  };
}
