import { createHash } from 'node:crypto';
import type {
  SyncConflictResolution,
  SyncConnectionResult,
  SyncObjectEnvelope,
  SyncServerLoginPayload,
  SyncServerLoginResult,
} from '@/contracts/sync';
import type {
  SyncProvider,
  SyncProviderAppliedObject,
  SyncProviderPushConflict,
  SyncPullResult,
  SyncPushInput,
} from './provider_types';

export interface SyncServerProviderOptions {
  endpoint: string;
  deviceId?: string;
  accessToken?: string;
  refreshToken?: string;
  deviceToken?: string;
  cursor?: number;
  onTokensRefreshed?: (tokens: Pick<AuthResponse, 'accessToken' | 'refreshToken'>) => Promise<void> | void;
}

interface ServerPullObject {
  seq: number;
  serverRev: string;
  deviceId: string;
  collection: SyncObjectEnvelope['collection'];
  objectId: string;
  payload: unknown;
  deleted: boolean;
}

interface ServerPullResponse {
  cursor: number;
  objects: ServerPullObject[];
}

interface AuthResponse {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

interface ServerPushConflict {
  conflictId: string;
  collection: SyncObjectEnvelope['collection'];
  objectId: string;
  serverRev: string;
  serverPayload: unknown;
  attemptedPayload: unknown;
  deleted: boolean;
}

interface ServerAppliedObject {
  collection: SyncObjectEnvelope['collection'];
  objectId: string;
  serverRev: string;
}

interface RegisterDeviceResponse {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  platform: SyncServerLoginResult['platform'];
}

type SyncServerLoginRuntimeResult = SyncServerLoginResult & {
  accessToken: string;
  refreshToken: string;
  deviceToken: string;
};
type SyncServerRequestInit = RequestInit & {
  diagnosticLabel?: string;
};

export class SyncServerProvider implements SyncProvider {
  private readonly endpoint: string;

  constructor(private readonly options: SyncServerProviderOptions) {
    this.endpoint = normalizeSyncServerEndpoint(options.endpoint);
  }

  static async loginOrRegister(payload: SyncServerLoginPayload): Promise<SyncServerLoginRuntimeResult> {
    const endpoint = normalizeSyncServerEndpoint(payload.endpoint);
    const authBody = JSON.stringify({
      email: payload.email.trim(),
      password: payload.password,
    });
    const loginResponse = await fetch(createSyncServerUrl(endpoint, '/v1/auth/login'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: authBody,
    });
    const auth = loginResponse.ok
      ? await loginResponse.json() as AuthResponse
      : await registerSyncServerAccount(endpoint, authBody);

    const deviceResponse = await fetch(createSyncServerUrl(endpoint, '/v1/devices/register'), {
      method: 'POST',
      headers: {
        ...jsonHeaders(),
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({
        deviceName: payload.deviceName.trim() || 'GuYanTools Device',
        platform: payload.platform || currentPlatformKey(),
      }),
    });
    if (!deviceResponse.ok) {
      throw new Error(`同步后端设备注册失败：HTTP ${deviceResponse.status}`);
    }

    const device = await deviceResponse.json() as RegisterDeviceResponse;
    return {
      userId: auth.userId,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      deviceId: device.deviceId,
      deviceToken: device.deviceToken,
      deviceName: device.deviceName,
      platform: normalizePlatform(device.platform),
    };
  }

  async testConnection(): Promise<SyncConnectionResult> {
    if (!this.endpoint) {
      return {
        ok: false,
        message: '请先配置自建同步后端地址。',
      };
    }

    if (!this.options.accessToken || !this.options.deviceToken || !this.options.deviceId) {
      return {
        ok: false,
        message: '请先登录并绑定当前设备。',
      };
    }

    const response = await this.request<{ serverTime: number }>('/v1/sync/bootstrap', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: this.options.deviceId,
      }),
    }).catch((): null => null);
    return {
      ok: Boolean(response),
      message: response ? '自建同步后端授权连接成功' : '自建同步后端授权连接失败。',
    };
  }

  async revokeDevice(deviceId = this.options.deviceId): Promise<void> {
    const targetDeviceId = deviceId?.trim();
    if (!targetDeviceId) {
      return;
    }
    await this.requestAccessOnly(`/v1/devices/${encodeURIComponent(targetDeviceId)}/revoke`, {
      method: 'POST',
    });
  }

  async resolveConflict(conflictId: string, resolution: SyncConflictResolution): Promise<void> {
    const targetConflictId = conflictId.trim();
    if (!targetConflictId) {
      return;
    }
    await this.request(`/v1/sync/conflicts/${encodeURIComponent(targetConflictId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    });
  }

  async pull(): Promise<SyncPullResult> {
    const since = Math.max(0, this.options.cursor ?? 0);
    const response = await this.request<ServerPullResponse>(`/v1/sync/pull?since=${since}`);
    const objects = response.objects.map((object) => this.toEnvelope(object));
    return {
      profiles: [],
      objects: objects.filter((object) => !object.deleted),
      deletedObjects: objects.filter((object) => object.deleted),
      cursor: response.cursor,
    };
  }

  async ack(cursor: number): Promise<void> {
    const serverDeviceId = this.options.deviceId;
    if (!serverDeviceId || cursor <= 0) {
      return;
    }
    await this.request('/v1/sync/ack', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: serverDeviceId,
        cursor,
      }),
    });
  }

  async push(input: SyncPushInput): Promise<{
    pushed: number;
    cursor?: number;
    serverRev?: string;
    applied?: SyncProviderAppliedObject[];
    conflicts?: SyncProviderPushConflict[];
  }> {
    const serverDeviceId = this.options.deviceId || input.deviceId;
    const objects = [...input.profiles, ...input.objects].map(toServerObject);
    const tombstones = input.tombstones.map((object) => ({
      ...toServerObject(object),
      deleted: true,
    }));
    const opId = createStableSyncServerOpId(serverDeviceId, objects, tombstones);
    const body = JSON.stringify({
      deviceId: serverDeviceId,
      opId,
      objects,
      tombstones,
    });
    const requestBytes = createSyncPushRequestBytes(body);
    const response = await this.request<{
      accepted: number;
      seq: number;
      serverRev: string;
      applied?: ServerAppliedObject[];
      conflicts?: ServerPushConflict[];
    }>('/v1/sync/push', {
      method: 'POST',
      body,
      diagnosticLabel: `同步后端批量推送失败：objects=${objects.length} tombstones=${tombstones.length} payloadBytes=${requestBytes}`,
    });
    await this.ack(response.seq).catch((): void => undefined);
    return {
      pushed: response.accepted,
      cursor: response.seq,
      serverRev: response.serverRev,
      applied: response.applied ?? [],
      conflicts: response.conflicts ?? [],
    };
  }

  async uploadAsset(key: string, bytes: Buffer, mimeType?: string): Promise<void> {
    const payloadBytes = bytes.byteLength;
    const response = await this.fetchAssetWithRefresh(`/v1/assets/${encodeAssetKey(key)}`, {
      method: 'PUT',
      headers: {
        ...this.headers(),
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      throw new Error(`同步后端资产上传失败：${key} payloadBytes=${payloadBytes} HTTP ${response.status}${await readErrorBody(response)}`);
    }
  }

  async downloadAsset(key: string): Promise<Buffer | null> {
    const response = await this.fetchAssetWithRefresh(`/v1/assets/${encodeAssetKey(key)}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) {
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async request<T = unknown>(path: string, init: SyncServerRequestInit = {}): Promise<T> {
    return this.requestOnce<T>(path, init, true, true);
  }

  private async requestAccessOnly<T = unknown>(path: string, init: SyncServerRequestInit = {}): Promise<T> {
    return this.requestOnce<T>(path, init, true, false);
  }

  private async requestOnce<T = unknown>(
    path: string,
    init: SyncServerRequestInit = {},
    retryAfterRefresh: boolean,
    includeDeviceToken: boolean,
  ): Promise<T> {
    const { diagnosticLabel, ...fetchInit } = init;
    const response = await fetch(this.url(path), {
      ...fetchInit,
      headers: {
        ...this.headers(includeDeviceToken),
        'Content-Type': 'application/json; charset=utf-8',
        ...(fetchInit.headers ?? {}),
      },
    });
    if (response.status === 401 && retryAfterRefresh) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.requestOnce<T>(path, init, false, includeDeviceToken);
      }
    }
    if (!response.ok) {
      const prefix = diagnosticLabel || '同步后端请求失败';
      throw new Error(`${prefix}：HTTP ${response.status}${await readErrorBody(response)}`);
    }
    return response.json() as Promise<T>;
  }

  private async fetchAssetWithRefresh(path: string, init: RequestInit, retryAfterRefresh = true): Promise<Response> {
    const response = await fetch(this.url(path), init);
    if (response.status === 401 && retryAfterRefresh) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.fetchAssetWithRefresh(path, {
          ...init,
          headers: {
            ...(init.headers ?? {}),
            ...this.headers(),
          },
        }, false);
      }
    }
    return response;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.options.refreshToken) {
      return false;
    }

    const response = await fetch(this.url('/v1/auth/refresh'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        refreshToken: this.options.refreshToken,
      }),
    }).catch((): null => null);
    if (!response?.ok) {
      return false;
    }

    const auth = await response.json() as AuthResponse;
    this.options.accessToken = auth.accessToken;
    this.options.refreshToken = auth.refreshToken;
    await this.options.onTokensRefreshed?.({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    });
    return true;
  }

  private toEnvelope(object: ServerPullObject): SyncObjectEnvelope {
    const payloadHash = createPayloadHash(object.payload);
    return {
      collection: object.collection,
      objectId: object.objectId,
      ownerDeviceId: object.deviceId,
      schemaVersion: 1,
      baseRev: object.serverRev,
      remoteRev: object.serverRev,
      payloadHash,
      payload: object.payload,
      deleted: object.deleted,
      updatedAt: Date.now(),
    };
  }

  private headers(includeDeviceToken = true): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.options.accessToken) {
      headers.Authorization = `Bearer ${this.options.accessToken}`;
    }
    if (includeDeviceToken && this.options.deviceToken) {
      headers['X-GuYanTools-Device-Token'] = this.options.deviceToken;
    }
    return headers;
  }

  private url(path: string): string {
    return createSyncServerUrl(this.endpoint, path).toString();
  }
}

async function registerSyncServerAccount(endpoint: string, body: string): Promise<AuthResponse> {
  const response = await fetch(createSyncServerUrl(endpoint, '/v1/auth/register'), {
    method: 'POST',
    headers: jsonHeaders(),
    body,
  });
  if (!response.ok) {
    throw new Error(`同步后端登录失败，且自动注册失败：HTTP ${response.status}`);
  }
  return response.json() as Promise<AuthResponse>;
}

export function normalizeSyncServerEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('自建同步后端地址必须使用 http 或 https');
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function createSyncServerUrl(endpoint: string, requestPath: string): URL {
  const base = new URL(normalizeSyncServerEndpoint(endpoint));
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const [requestPathname, requestSearch = ''] = requestPath.split('?', 2);
  const nextPath = requestPathname.replace(/^\/+/, '');
  base.pathname = `${basePath}${nextPath}`.replace(/\/{2,}/g, '/');
  base.search = requestSearch ? `?${requestSearch}` : '';
  return base;
}

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function currentPlatformKey(): SyncServerLoginResult['platform'] {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux') return 'linux';
  return 'unknown';
}

function normalizePlatform(value: string): SyncServerLoginResult['platform'] {
  if (value === 'windows' || value === 'macos' || value === 'linux' || value === 'android' || value === 'ios') {
    return value;
  }
  return 'unknown';
}

function toServerObject(object: SyncObjectEnvelope) {
  return {
    collection: object.collection,
    objectId: object.objectId,
    baseRev: object.baseRev,
    payload: object.payload,
    deleted: object.deleted,
  };
}

function createStableSyncServerOpId(
  deviceId: string,
  objects: ReturnType<typeof toServerObject>[],
  tombstones: Array<ReturnType<typeof toServerObject> & { deleted: boolean }>,
): string {
  const payload = JSON.stringify({
    deviceId,
    objects: [...objects].sort(compareServerObjects),
    tombstones: [...tombstones].sort(compareServerObjects),
  });
  return `desktop-${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`;
}

function createSyncPushRequestBytes(body: string): number {
  return Buffer.byteLength(body, 'utf8');
}

function compareServerObjects(left: ReturnType<typeof toServerObject>, right: ReturnType<typeof toServerObject>): number {
  const leftKey = `${left.collection}:${left.objectId}`;
  const rightKey = `${right.collection}:${right.objectId}`;
  return leftKey.localeCompare(rightKey);
}

function createPayloadHash(payload: unknown): string {
  const body = JSON.stringify(payload);
  return createHash('sha256').update(body).digest('hex');
}

async function readErrorBody(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return body ? ` ${body}` : '';
}

function encodeAssetKey(key: string): string {
  return key
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}
