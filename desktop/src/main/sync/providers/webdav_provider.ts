import type { SyncConnectionResult, SyncObjectEnvelope, SyncProfileSummary } from '@/contracts/sync';
import { SyncProviderObjectError, type SyncProvider, type SyncPullResult, type SyncPushInput } from './provider_types';

export interface WebDavSyncProviderOptions {
  endpoint: string;
  username: string;
  password: string;
  remoteRoot?: string;
}

export const JIANGUOYUN_WEBDAV_PRESET = {
  endpoint: 'https://dav.jianguoyun.com/dav/',
  remoteRoot: 'GuYanTools/Sync',
};

export class WebDavSyncProvider implements SyncProvider {
  private readonly endpoint: string;
  private readonly authorization: string;
  private readonly remoteRoot: string;

  constructor(options: WebDavSyncProviderOptions) {
    this.endpoint = normalizeWebDavEndpoint(options.endpoint);
    this.authorization = createWebDavBasicAuthHeader(options.username, options.password);
    this.remoteRoot = trimSlashes(options.remoteRoot || 'GuYanTools/Sync');
  }

  async testConnection(): Promise<SyncConnectionResult> {
    const response = await fetch(this.createRemoteUrl(''), {
      method: 'PROPFIND',
      headers: {
        Authorization: this.authorization,
        Depth: '0',
      },
    });

    return {
      ok: response.ok,
      message: response.ok ? 'WebDAV 连接成功' : `WebDAV 连接失败：HTTP ${response.status}`,
    };
  }

  async pull(): Promise<SyncPullResult> {
    const deviceDirs = await this.listDirectory('devices/');
    const profiles: SyncProfileSummary[] = [];
    const objects: SyncObjectEnvelope[] = [];
    const deletedObjects: SyncObjectEnvelope[] = [];

    for (const deviceDir of deviceDirs) {
      const deviceId = decodeURIComponent(deviceDir.replace(/\/$/, '').split('/').filter(Boolean).at(-1) || '');
      const profilePaths = await this.listDirectory(`${deviceDir}profiles/`);
      for (const profilePath of profilePaths) {
        const envelope = await this.readJson<SyncObjectEnvelope>(profilePath);
        if (!envelope || envelope.collection !== 'app.profile') {
          continue;
        }

        objects.push(envelope);
        profiles.push({
          profileId: envelope.objectId,
          profileName: getProfileNameFromPayload(envelope.payload) || `${deviceId} 配置`,
          ownerDeviceId: envelope.ownerDeviceId,
          ownerDeviceName: deviceId || envelope.ownerDeviceId,
          schemaVersion: envelope.schemaVersion,
          appVersion: '',
          payloadHash: envelope.payloadHash,
          updatedAt: envelope.updatedAt,
          isLocal: false,
          isActive: false,
          isDefault: false,
        });
      }

      const objectRoots = await this.listDirectory(`${deviceDir}objects/`);
      for (const objectRoot of objectRoots) {
        const objectPaths = await this.listDirectory(objectRoot);
        for (const objectPath of objectPaths.filter((item) => item.endsWith('.json'))) {
          const envelope = await this.readJson<SyncObjectEnvelope>(objectPath);
          if (envelope && envelope.collection !== 'app.profile') {
            objects.push(envelope);
          }
        }
      }

      const tombstoneRoots = await this.listDirectory(`${deviceDir}tombstones/`);
      for (const tombstoneRoot of tombstoneRoots) {
        const tombstonePaths = await this.listDirectory(tombstoneRoot);
        for (const tombstonePath of tombstonePaths.filter((item) => item.endsWith('.json'))) {
          const envelope = await this.readJson<SyncObjectEnvelope>(tombstonePath);
          if (envelope) {
            deletedObjects.push({ ...envelope, deleted: true });
          }
        }
      }
    }

    return {
      profiles,
      objects,
      deletedObjects,
    };
  }

  async push(input: SyncPushInput): Promise<{ pushed: number }> {
    await this.ensureDeviceFolders(input.deviceId);
    await this.writeJson(`${createDeviceRoot(input.deviceId)}/device.json`, {
      deviceId: input.deviceId,
      updatedAt: Date.now(),
    });
    for (const profile of input.profiles) {
      await this.writeJson(`${createDeviceRoot(input.deviceId)}/profiles/${profile.objectId}.json`, profile);
    }
    for (const object of input.objects) {
      await this.ensureObjectFolder(input.deviceId, 'objects', object.collection);
      await this.writeJson(createObjectPath(input.deviceId, 'objects', object), object);
    }
    for (const tombstone of input.tombstones) {
      await this.ensureObjectFolder(input.deviceId, 'tombstones', tombstone.collection);
      await this.writeJson(createObjectPath(input.deviceId, 'tombstones', tombstone), {
        ...tombstone,
        deleted: true,
      });
    }
    return {
      pushed: input.profiles.length + input.objects.length + input.tombstones.length,
    };
  }

  async uploadAsset(key: string, bytes: Buffer, mimeType?: string): Promise<void> {
    await this.ensureCollection('assets/');
    const normalizedKey = normalizeAssetKey(key);
    const prefix = normalizedKey.split('/').slice(0, -1).join('/');
    if (prefix) {
      await this.ensureNestedCollections(`assets/${prefix}/`);
    }
    const response = await fetch(this.createRemoteUrl(`assets/${normalizedKey}`), {
      method: 'PUT',
      headers: {
        Authorization: this.authorization,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      throw new Error(`WebDAV 资产上传失败：${normalizedKey} payloadBytes=${bytes.byteLength} HTTP ${response.status}${await readErrorBody(response)}`);
    }
  }

  async downloadAsset(key: string): Promise<Buffer | null> {
    const response = await fetch(this.createRemoteUrl(`assets/${normalizeAssetKey(key)}`), {
      method: 'GET',
      headers: {
        Authorization: this.authorization,
      },
    });
    if (!response.ok) {
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async ensureDeviceFolders(deviceId: string) {
    const deviceRoot = createDeviceRoot(deviceId);
    await this.ensureCollection('');
    await this.ensureCollection('devices/');
    await this.ensureCollection(`${deviceRoot}/`);
    await this.ensureCollection(`${deviceRoot}/profiles/`);
    await this.ensureCollection(`${deviceRoot}/objects/`);
    await this.ensureCollection(`${deviceRoot}/outbox/`);
    await this.ensureCollection(`${deviceRoot}/tombstones/`);
  }

  private async ensureObjectFolder(deviceId: string, root: 'objects' | 'tombstones', collection: string) {
    await this.ensureCollection(`${createDeviceRoot(deviceId)}/${root}/`);
    await this.ensureNestedCollections(`${createDeviceRoot(deviceId)}/${root}/${collection}/`);
  }

  private async ensureNestedCollections(relativePath: string) {
    const parts = relativePath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += `${part}/`;
      await this.ensureCollection(current);
    }
  }

  private async ensureCollection(relativePath: string) {
    await fetch(this.createRemoteUrl(relativePath), {
      method: 'MKCOL',
      headers: {
        Authorization: this.authorization,
      },
    }).catch((): void => undefined);
  }

  private async writeJson(relativePath: string, value: unknown) {
    const body = JSON.stringify(value, null, 2);
    const response = await fetch(this.createRemoteUrl(relativePath), {
      method: 'PUT',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body,
    });
    if (!response.ok) {
      const object = value && typeof value === 'object'
        ? value as Partial<Pick<SyncObjectEnvelope, 'collection' | 'objectId'>>
        : {};
      const requestBytes = Buffer.byteLength(body, 'utf8');
      if (object.collection && object.objectId) {
        throw new SyncProviderObjectError(
          `WebDAV 写入失败：${relativePath} payloadBytes=${requestBytes} HTTP ${response.status}${await readErrorBody(response)}`,
          object.collection,
          object.objectId,
          requestBytes,
        );
      }
      throw new Error(`WebDAV 写入失败：${relativePath} payloadBytes=${requestBytes} HTTP ${response.status}${await readErrorBody(response)}`);
    }
  }

  private async readJson<T>(relativePath: string): Promise<T | null> {
    const response = await fetch(this.createRemoteUrl(relativePath), {
      method: 'GET',
      headers: {
        Authorization: this.authorization,
      },
    });
    if (!response.ok) {
      return null;
    }
    return response.json() as Promise<T>;
  }

  private async listDirectory(relativePath: string): Promise<string[]> {
    const response = await fetch(this.createRemoteUrl(relativePath), {
      method: 'PROPFIND',
      headers: {
        Authorization: this.authorization,
        Depth: '1',
      },
    });
    if (!response.ok) {
      return [];
    }

    const body = await response.text();
    const hrefs = Array.from(body.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi))
      .map((match) => decodeXml(match[1]))
      .map((href) => href.replace(/^https?:\/\/[^/]+/i, ''))
      .filter((href) => !href.endsWith(`/${trimSlashes(relativePath)}/`));
    return hrefs.map((href) => this.toRelativeRemotePath(href)).filter(Boolean);
  }

  private toRelativeRemotePath(href: string) {
    const normalizedHref = href.replace(/^\/+/, '');
    const root = `${this.remoteRoot}/`;
    const rootIndex = normalizedHref.indexOf(root);
    if (rootIndex < 0) {
      return '';
    }
    return normalizedHref.slice(rootIndex + root.length);
  }

  private createRemoteUrl(relativePath: string) {
    const encodedRoot = this.remoteRoot
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
    const encodedPath = relativePath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
    const suffix = encodedPath ? `${encodedRoot}/${encodedPath}` : encodedRoot;
    return new URL(suffix, this.endpoint).toString();
  }
}

export function normalizeWebDavEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('WebDAV 地址必须使用 http 或 https');
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function createWebDavBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

export function createDeviceRoot(deviceId: string): string {
  return `devices/${deviceId}`;
}

export function createKnowledgeAssetRemoteKey(hash: string, extension?: string): string {
  const cleanHash = hash.replace(/[^\da-f]/gi, '').toLowerCase();
  const suffix = extension ? `.${extension.replace(/^\.+/, '')}` : '';
  return `${cleanHash.slice(0, 2)}/${cleanHash}${suffix}`;
}

function createObjectPath(
  deviceId: string,
  root: 'objects' | 'tombstones',
  object: Pick<SyncObjectEnvelope, 'collection' | 'objectId'>,
) {
  return `${createDeviceRoot(deviceId)}/${root}/${object.collection}/${object.objectId}.json`;
}

function normalizeAssetKey(key: string) {
  return key
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]/g, '_'))
    .join('/');
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getProfileNameFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  return '应用配置';
}

async function readErrorBody(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return body ? ` ${body}` : '';
}
