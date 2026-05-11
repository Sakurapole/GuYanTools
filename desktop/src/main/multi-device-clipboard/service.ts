import { app, BrowserWindow, Notification, clipboard, nativeImage } from 'electron';
import { JsMultiDeviceClipboardHost } from '@guyantools/core';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync, statSync, type Stats } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dbManager } from '@/core/database';
import { appConfigManager } from '@/main/app-config/manager';
import { clipboardPlatformAdapter } from './clipboard_platform_adapter';
import { showMultiDeviceClipboardWindow } from './window';
import type { AppConfig } from '@/contracts/app_config';
import type {
  MultiDeviceClipboardDevice,
  MultiDeviceClipboardDeviceStatus,
  MultiDeviceClipboardDiscoveredDevice,
  MultiDeviceClipboardEvent,
  MultiDeviceClipboardItem,
  MultiDeviceClipboardPairingRequest,
} from '@/contracts/multi_device_clipboard';

type NativeMultiDeviceClipboardHost = {
  registerEventSink(callback: (payload: string) => void): void;
  getOrCreateLocalDevice(name: string): Promise<MultiDeviceClipboardDevice>;
  startDiscovery(config: {
    deviceId: string;
    deviceName: string;
    port: number;
    platform?: string;
    preferredAddress?: string;
    probeLocalAddresses?: string[];
    httpProbeEnabled?: boolean;
  }): void;
  stopDiscovery(): void;
  listDiscoveredDevices(): MultiDeviceClipboardDiscoveredDevice[];
  listDevices(): Promise<MultiDeviceClipboardDevice[]>;
  listDeviceStatuses(onlineWindowSeconds: number): Promise<MultiDeviceClipboardDeviceStatus[]>;
  upsertDevice(input: Partial<MultiDeviceClipboardDevice> & { id: string; name: string }): Promise<MultiDeviceClipboardDevice>;
  setDeviceTrusted(id: string, trusted: boolean): Promise<MultiDeviceClipboardDevice>;
  forgetDevice(id: string): Promise<void>;
  listItems(limit: number): Promise<MultiDeviceClipboardItem[]>;
  getItem(id: string): Promise<MultiDeviceClipboardItem>;
  upsertItem(input: Partial<MultiDeviceClipboardItem> & {
    id: string;
    sourceDeviceId: string;
    sourceDeviceName: string;
    contentType: string;
    contentHash: string;
  }): Promise<MultiDeviceClipboardItem>;
  deleteItem(id: string): Promise<void>;
  clearHistory(): Promise<void>;
  pruneHistory(limit: number): Promise<void>;
  computeContentHash(parts: string[]): string;
};

type SyncPayload = {
  item: MultiDeviceClipboardItem;
  assetBase64?: string;
};

type CaptureResult = {
  itemInput: Parameters<NativeMultiDeviceClipboardHost['upsertItem']>[0];
  assetBase64?: string;
};

const NativeMultiDeviceClipboardHostConstructor = JsMultiDeviceClipboardHost as unknown as new (db: unknown) => NativeMultiDeviceClipboardHost;

const POLL_INTERVAL_MS = 1000;
const DEFAULT_HISTORY_LIMIT = 200;
const DEFAULT_SYNC_PORT = 49649;
const MAX_SYNC_BYTES = 1024 * 1024 * 1024;

class MultiDeviceClipboardService {
  private host: NativeMultiDeviceClipboardHost | null = null;
  private localDevice: MultiDeviceClipboardDevice | null = null;
  private server: http.Server | null = null;
  private serverPort = 0;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeConfig?: () => void;
  private config: AppConfig | null = null;
  private lastContentHash = '';
  private suppressNextHash = '';
  private lastWindowsImageFileDropHash = '';
  private lastWindowsImageFileDropPaths: string[] = [];
  private captureInFlight = false;
  private initialized = false;
  private readonly pairingRequests = new Map<string, MultiDeviceClipboardPairingRequest>();
  private readonly notifiedDiscoveredDeviceIds = new Set<string>();

  async initialize() {
    if (this.initialized) return;
    this.host = new NativeMultiDeviceClipboardHostConstructor(dbManager.getDatabase());
    this.host.registerEventSink((payload) => this.handleNativeEvent(payload));
    this.config = await appConfigManager.getConfig();
    this.unsubscribeConfig = appConfigManager.subscribe((config) => {
      void this.applyConfig(config);
    });
    await this.applyConfig(this.config);
    this.initialized = true;
  }

  async dispose() {
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = undefined;
    this.stopPolling();
    this.host?.stopDiscovery();
    await this.stopServer();
    this.host = null;
    this.initialized = false;
  }

  async listItems() {
    const limit = this.config?.features.multiDeviceClipboard.historyLimit ?? DEFAULT_HISTORY_LIMIT;
    return this.requireHost().listItems(limit);
  }

  async getItem(itemId: string) {
    return this.requireHost().getItem(itemId);
  }

  async applyItem(itemId: string) {
    const item = await this.requireHost().getItem(itemId);
    await this.writeItemToClipboard(item);
  }

  async deleteItem(itemId: string) {
    await this.requireHost().deleteItem(itemId);
    this.emit({ type: 'items-changed' });
  }

  async clearHistory() {
    await this.requireHost().clearHistory();
    this.emit({ type: 'items-changed' });
  }

  listDiscoveredDevices() {
    return this.requireHost().listDiscoveredDevices();
  }

  listPairingRequests() {
    return [...this.pairingRequests.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async listDevices() {
    return this.requireHost().listDevices();
  }

  async listDeviceStatuses(onlineWindowSeconds = 60) {
    return this.requireHost().listDeviceStatuses(onlineWindowSeconds);
  }

  async startPairing(deviceId: string) {
    const device = this.listDiscoveredDevices().find((item) => item.id === deviceId);
    if (!device) {
      throw new Error('未发现该设备，无法发起配对');
    }
    const localDevice = await this.ensureLocalDevice();
    const result = await this.postJson<MultiDeviceClipboardPairingRequest>(
      device.address,
      device.port,
      '/pair/request',
      {
        deviceId: localDevice.id,
        deviceName: localDevice.name,
      },
    );
    return result;
  }

  async startPairingByAddress(endpoint: string) {
    const { address, port } = parseManualPairingEndpoint(endpoint);
    const localDevice = await this.ensureLocalDevice();
    const status = await this.getJson<{ device?: MultiDeviceClipboardDevice }>(address, port, '/status');
    if (!status.device?.id) {
      throw new Error('该地址不是有效的 GuYanTools 剪贴板服务');
    }
    await this.requireHost().upsertDevice({
      id: status.device.id,
      name: status.device.name,
      platform: status.device.platform || 'desktop',
      trusted: false,
      isSelf: false,
      lastAddress: address,
      lastPort: port,
      lastSeenAt: Math.floor(Date.now() / 1000),
    });
    const result = await this.postJson<MultiDeviceClipboardPairingRequest>(
      address,
      port,
      '/pair/request',
      {
        deviceId: localDevice.id,
        deviceName: localDevice.name,
      },
    );
    this.emit({ type: 'devices-changed' });
    return result;
  }

  async approvePairing(requestId: string) {
    const request = this.pairingRequests.get(requestId);
    if (!request) {
      throw new Error('配对请求已失效');
    }
    await this.requireHost().upsertDevice({
      id: request.deviceId,
      name: request.deviceName,
      platform: 'desktop',
      trusted: true,
      isSelf: false,
      lastAddress: request.address,
      lastPort: request.port,
      lastSeenAt: Math.floor(Date.now() / 1000),
    });
    const localDevice = await this.ensureLocalDevice();
    await this.postJson(request.address, request.port, '/pair/approve', {
      requestId,
      deviceId: localDevice.id,
      deviceName: localDevice.name,
    }).catch((error) => {
      console.warn('[multi-device-clipboard] Failed to notify pair approval:', error);
    });
    this.pairingRequests.delete(requestId);
    this.emit({ type: 'devices-changed' });
  }

  async rejectPairing(requestId: string) {
    this.pairingRequests.delete(requestId);
    this.emit({ type: 'devices-changed' });
  }

  async forgetDevice(deviceId: string) {
    await this.requireHost().forgetDevice(deviceId);
    this.emit({ type: 'devices-changed' });
  }

  private async applyConfig(config: AppConfig) {
    this.config = config;
    const feature = config.features.multiDeviceClipboard;
    if (!feature.enabled) {
      this.stopPolling();
      this.host?.stopDiscovery();
      await this.stopServer();
      this.emit({ type: 'status-changed', enabled: false });
      return;
    }

    await this.ensureServer();
    const configuredName = feature.deviceName?.trim() || os.hostname() || 'GuYanTools';
    if (this.localDevice && this.localDevice.name !== configuredName) {
      this.localDevice = null;
    }
    const localDevice = await this.ensureLocalDevice();
    this.requireHost().startDiscovery({
      deviceId: localDevice.id,
      deviceName: localDevice.name,
      port: this.serverPort,
      platform: 'desktop',
      preferredAddress: selectPreferredNetworkAddress(feature.networkInterfacePriority),
      probeLocalAddresses: listLocalIpv4Interfaces().map((item) => item.address),
      httpProbeEnabled: true,
    });
    this.startPolling();
    this.emit({ type: 'status-changed', enabled: true });
  }

  private async ensureLocalDevice() {
    if (this.localDevice) {
      return this.localDevice;
    }
    const configuredName = this.config?.features.multiDeviceClipboard.deviceName?.trim();
    const name = configuredName || os.hostname() || 'GuYanTools';
    this.localDevice = await this.requireHost().getOrCreateLocalDevice(name);
    return this.localDevice;
  }

  private async ensureServer() {
    if (this.server) return;

    for (const port of [DEFAULT_SYNC_PORT, 0]) {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });
      try {
        await listenServer(server, port);
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('多设备剪贴板服务端口初始化失败');
        }
        this.server = server;
        this.serverPort = address.port;
        return;
      } catch (error) {
        await closeServer(server);
        if (port === 0) {
          throw error;
        }
      }
    }
  }

  private async stopServer() {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    this.serverPort = 0;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private startPolling() {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(() => {
      if (this.captureInFlight) {
        return;
      }
      this.captureInFlight = true;
      void this.captureClipboard().catch((error) => {
        console.warn('[multi-device-clipboard] Clipboard capture failed:', error);
      }).finally(() => {
        this.captureInFlight = false;
      });
    }, POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (!this.pollingTimer) return;
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  private async captureClipboard() {
    const capture = await this.readCurrentClipboard();
    if (!capture) return;

    if (capture.itemInput.contentHash === this.suppressNextHash) {
      this.lastContentHash = capture.itemInput.contentHash;
      this.suppressNextHash = '';
      return;
    }
    if (capture.itemInput.contentHash === this.lastContentHash) {
      return;
    }

    const item = await this.requireHost().upsertItem(capture.itemInput);
    await this.requireHost().pruneHistory(this.config?.features.multiDeviceClipboard.historyLimit ?? DEFAULT_HISTORY_LIMIT);
    this.lastContentHash = item.contentHash;
    this.emit({ type: 'items-changed', item });
    if (!item.localOnly) {
      await this.broadcastItem(item, capture.assetBase64);
    }
  }

  private async readCurrentClipboard(): Promise<CaptureResult | null> {
    const localDevice = await this.ensureLocalDevice();
    const formats = clipboard.availableFormats();
    const maxSyncBytes = this.config?.features.multiDeviceClipboard.maxSyncBytes ?? 100 * 1024 * 1024;
    const boundedMaxSyncBytes = Math.min(MAX_SYNC_BYTES, Math.max(1, maxSyncBytes));

    const paths = await clipboardPlatformAdapter.readFilePaths(formats);
    if (paths.length) {
      const fileCapture = await this.captureFile(localDevice, paths, boundedMaxSyncBytes).catch((error: unknown): null => {
        console.warn('[multi-device-clipboard] File clipboard capture failed:', error);
        return null;
      });
      if (fileCapture) {
        return fileCapture;
      }
    }

    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const png = image.toPNG();
      if (png.length > 0) {
        const hash = hashBufferParts(['image'], png);
        const imageFileDropPaths = await this.readWindowsFileDropListForImageHash(hash);
        if (imageFileDropPaths.length) {
          const fileCapture = await this.captureFile(localDevice, imageFileDropPaths, boundedMaxSyncBytes).catch((error: unknown): null => {
            console.warn('[multi-device-clipboard] Image file clipboard capture failed:', error);
            return null;
          });
          if (fileCapture) {
            return fileCapture;
          }
        }

        const fileName = inferClipboardImageFileName(formats, hash);
        const assetPath = await this.writeAsset(`${hash}.png`, png);
        return {
          itemInput: {
            id: randomUUID(),
            sourceDeviceId: localDevice.id,
            sourceDeviceName: localDevice.name,
            contentType: 'image',
            mimeType: 'image/png',
            fileName,
            assetPath,
            byteSize: png.length,
            contentHash: hash,
            tagsJson: '["image"]',
            localOnly: png.length > boundedMaxSyncBytes,
          },
          assetBase64: png.length <= boundedMaxSyncBytes ? png.toString('base64') : undefined,
        };
      }
    }

    const text = clipboard.readText();
    if (!text) return null;
    const hash = this.requireHost().computeContentHash(['text', text]);
    return {
      itemInput: {
        id: randomUUID(),
        sourceDeviceId: localDevice.id,
        sourceDeviceName: localDevice.name,
        contentType: 'text',
        mimeType: 'text/plain',
        text,
        byteSize: Buffer.byteLength(text, 'utf8'),
        contentHash: hash,
        tagsJson: JSON.stringify(classifyText(text)),
        localOnly: false,
      },
    };
  }

  private async captureFile(
    localDevice: MultiDeviceClipboardDevice,
    paths: string[],
    maxSyncBytes: number,
  ): Promise<CaptureResult | null> {
    const firstPath = paths.find((item) => existsSync(item));
    if (!firstPath) return null;
    const stats = safeStat(firstPath);
    if (!stats) return null;

    const fileName = path.basename(firstPath);
    const isFile = stats.isFile();
    const isDirectory = stats.isDirectory();
    const size = isFile ? stats.size : 0;
    const isImage = isFile && isImageFile(fileName);
    const hasMultiplePaths = paths.length > 1;
    const localOnly = hasMultiplePaths || !isFile || size > maxSyncBytes;
    let assetPath: string | undefined;
    let assetBase64: string | undefined;
    let previewPath: string | undefined;
    let fileHash = '';

    if (!localOnly && isFile) {
      const bytes = await readFile(firstPath);
      fileHash = hashBufferParts(['file', fileName], bytes);
      assetPath = await this.writeAsset(`${fileHash}-${fileName}`, bytes);
      assetBase64 = bytes.toString('base64');
    } else {
      fileHash = this.requireHost().computeContentHash([
        hasMultiplePaths ? 'file-list-ref' : 'file-ref',
        ...paths,
        String(size),
        String(stats.mtimeMs),
      ]);
    }
    if (isImage && !hasMultiplePaths) {
      previewPath = await this.createImagePreview(firstPath, fileHash).catch((error: unknown): undefined => {
        console.warn('[multi-device-clipboard] Image file preview generation failed:', error);
        return undefined;
      });
    }
    const tags = ['file'];
    if (isDirectory) tags.push('folder');
    if (isImage) tags.push('image');
    if (isVideoFile(fileName)) tags.push('video');

    return {
      itemInput: {
        id: randomUUID(),
        sourceDeviceId: localDevice.id,
        sourceDeviceName: localDevice.name,
        contentType: 'file',
        mimeType: guessMimeType(fileName),
        text: JSON.stringify({ paths }),
        fileName: hasMultiplePaths ? `${fileName} 等 ${paths.length} 项` : fileName,
        assetPath,
        previewPath,
        byteSize: size,
        contentHash: fileHash,
        tagsJson: JSON.stringify(tags),
        localOnly,
      },
      assetBase64,
    };
  }

  private async broadcastItem(item: MultiDeviceClipboardItem, assetBase64?: string) {
    const devices = await this.requireHost().listDevices();
    const trustedDevices = devices.filter((device) =>
      device.trusted && !device.isSelf && device.lastAddress && device.lastPort);
    await Promise.allSettled(trustedDevices.map((device) =>
      this.postJson(device.lastAddress!, device.lastPort!, '/sync/item', { item, assetBase64 } satisfies SyncPayload)));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
      if (req.method === 'GET' && req.url === '/status') {
        const localDevice = await this.ensureLocalDevice();
        this.sendJson(res, 200, { device: localDevice });
        return;
      }

      if (req.method === 'POST' && req.url === '/pair/request') {
        const body = await this.readRequestJson<{ deviceId: string; deviceName: string }>(req);
        const remote = normalizeRemoteAddress(req.socket.remoteAddress);
        const request: MultiDeviceClipboardPairingRequest = {
          requestId: randomUUID(),
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          address: remote,
          port: Number(req.headers['x-guyantools-port'] ?? 0) || 0,
          code: String(randomInt(100000, 999999)),
          createdAt: Date.now(),
        };
        if (!request.port) {
          const discovered = this.requireHost().listDiscoveredDevices().find((item) => item.id === request.deviceId);
          request.port = discovered?.port ?? 0;
          request.address = discovered?.address ?? request.address;
        }
        this.pairingRequests.set(request.requestId, request);
        this.emit({ type: 'pairing-request', request });
        void showMultiDeviceClipboardWindow().catch((error) => {
          console.warn('[multi-device-clipboard] Failed to show pairing window:', error);
        });
        this.notifyPairingRequest(request);
        this.sendJson(res, 200, request);
        return;
      }

      if (req.method === 'POST' && req.url === '/pair/approve') {
        const body = await this.readRequestJson<{ deviceId: string; deviceName: string }>(req);
        const discovered = this.requireHost().listDiscoveredDevices().find((item) => item.id === body.deviceId);
        const requestPort = Number(req.headers['x-guyantools-port'] ?? 0) || undefined;
        await this.requireHost().upsertDevice({
          id: body.deviceId,
          name: body.deviceName,
          platform: discovered?.platform ?? 'desktop',
          trusted: true,
          isSelf: false,
          lastAddress: discovered?.address ?? normalizeRemoteAddress(req.socket.remoteAddress),
          lastPort: discovered?.port ?? requestPort,
          lastSeenAt: Math.floor(Date.now() / 1000),
        });
        this.emit({ type: 'devices-changed' });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && req.url === '/sync/item') {
        const payload = await this.readRequestJson<SyncPayload>(req);
        await this.receiveRemoteItem(payload);
        this.sendJson(res, 200, { ok: true });
        return;
      }

      this.sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      this.sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async receiveRemoteItem(payload: SyncPayload) {
    const devices = await this.requireHost().listDevices();
    const trusted = devices.some((device) => device.id === payload.item.sourceDeviceId && device.trusted);
    if (!trusted) {
      throw new Error('设备尚未配对，拒绝同步内容');
    }

    const itemInput = { ...payload.item };
    itemInput.previewPath = undefined;
    if (payload.assetBase64 && payload.item.fileName) {
      const bytes = Buffer.from(payload.assetBase64, 'base64');
      itemInput.assetPath = await this.writeAsset(`${payload.item.contentHash}-${payload.item.fileName}`, bytes);
      itemInput.byteSize = bytes.length;
      if (payload.item.contentType === 'file' && isImageFile(payload.item.fileName)) {
        itemInput.previewPath = await this.createImagePreview(itemInput.assetPath, payload.item.contentHash)
          .catch((): undefined => undefined);
      }
    }

    const item = await this.requireHost().upsertItem(itemInput);
    await this.writeItemToClipboard(item);
    this.emit({ type: 'items-changed', item });
  }

  private async writeItemToClipboard(item: MultiDeviceClipboardItem) {
    this.suppressNextHash = item.contentHash;
    if (item.contentType === 'text') {
      clipboard.writeText(item.text ?? '');
      return;
    }

    if (item.contentType === 'image' && item.assetPath) {
      await this.writeFilePathsToClipboard([item.assetPath], item.assetPath);
      return;
    }

    if (item.contentType === 'file') {
      const paths = parseItemPaths(item);
      await this.writeFilePathsToClipboard(paths, isImageFile(item.fileName ?? '') ? paths[0] : undefined);
    }
  }

  private async writeFilePathsToClipboard(paths: string[], imagePath?: string) {
    const existingPaths = uniqueExistingPaths(paths);
    if (!existingPaths.length) {
      clipboard.writeText(paths.join('\n'));
      return;
    }

    this.suppressNextHash = await this.computeFileCaptureHash(existingPaths)
      .catch(() => this.suppressNextHash);

    await clipboardPlatformAdapter.writeFilePaths(existingPaths, { imagePath });
  }

  private async computeFileCaptureHash(paths: string[]) {
    const firstPath = paths.find((item) => existsSync(item));
    if (!firstPath) {
      return this.requireHost().computeContentHash(['file-ref', ...paths]);
    }

    const stats = safeStat(firstPath);
    if (!stats) {
      return this.requireHost().computeContentHash(['file-ref', ...paths]);
    }

    const maxSyncBytes = this.config?.features.multiDeviceClipboard.maxSyncBytes ?? 100 * 1024 * 1024;
    const boundedMaxSyncBytes = Math.min(MAX_SYNC_BYTES, Math.max(1, maxSyncBytes));
    const fileName = path.basename(firstPath);
    const isFile = stats.isFile();
    const size = isFile ? stats.size : 0;
    const hasMultiplePaths = paths.length > 1;
    const localOnly = hasMultiplePaths || !isFile || size > boundedMaxSyncBytes;

    if (!localOnly && isFile) {
      const bytes = await readFile(firstPath);
      return hashBufferParts(['file', fileName], bytes);
    }

    return this.requireHost().computeContentHash([
      hasMultiplePaths ? 'file-list-ref' : 'file-ref',
      ...paths,
      String(size),
      String(stats.mtimeMs),
    ]);
  }

  private handleNativeEvent(payload: string) {
    try {
      const event = JSON.parse(payload) as { type: string; device?: MultiDeviceClipboardDiscoveredDevice };
      if (event.type === 'deviceFound' && event.device) {
        const device = event.device;
        void this.requireHost().upsertDevice({
          id: device.id,
          name: device.name,
          platform: device.platform,
          trusted: false,
          isSelf: false,
          lastAddress: device.address,
          lastPort: device.port,
          lastSeenAt: device.lastSeenAt,
        }).catch(() => {});
        void this.notifyDiscoveredDevice(device);
        this.emit({ type: 'discovered-devices-changed' });
      } else if (event.type === 'deviceLost') {
        this.emit({ type: 'discovered-devices-changed' });
      }
    } catch (error) {
      console.warn('[multi-device-clipboard] Failed to parse native event:', error);
    }
  }

  private emit(event: MultiDeviceClipboardEvent) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('multi-device-clipboard:event', event);
      }
    }
  }

  private notifyPairingRequest(request: MultiDeviceClipboardPairingRequest) {
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: '多设备剪贴板配对请求',
      body: `${request.deviceName} 请求配对，验证码 ${request.code}`,
      silent: false,
    });
    notification.on('click', () => {
      void showMultiDeviceClipboardWindow();
    });
    notification.show();
  }

  private async notifyDiscoveredDevice(device: MultiDeviceClipboardDiscoveredDevice) {
    if (!Notification.isSupported() || this.notifiedDiscoveredDeviceIds.has(device.id)) return;
    const devices = await this.requireHost().listDevices().catch((): MultiDeviceClipboardDevice[] => []);
    if (devices.some((item) => item.id === device.id && item.trusted)) return;
    this.notifiedDiscoveredDeviceIds.add(device.id);
    const notification = new Notification({
      title: '发现可配对设备',
      body: `${device.name} (${device.address}:${device.port}) 可用于多设备剪贴板`,
      silent: true,
    });
    notification.on('click', () => {
      void showMultiDeviceClipboardWindow();
    });
    notification.show();
  }

  private async postJson<T>(address: string, port: number, route: string, body: unknown): Promise<T> {
    const response = await fetch(`http://${formatAddressForUrl(address)}:${port}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guyantools-port': String(this.serverPort),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`请求失败：${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private async getJson<T>(address: string, port: number, route: string): Promise<T> {
    const response = await fetch(`http://${formatAddressForUrl(address)}:${port}${route}`);
    if (!response.ok) {
      throw new Error(`请求失败：${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private async readRequestJson<T>(req: http.IncomingMessage): Promise<T> {
    const limit = Math.min(MAX_SYNC_BYTES * 2, Math.max(1024 * 1024, (this.config?.features.multiDeviceClipboard.maxSyncBytes ?? 0) * 2 + 1024));
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > limit) {
        throw new Error('请求内容超过最大同步大小');
      }
      chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  }

  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  }

  private async readWindowsFileDropListForImageHash(imageHash: string) {
    if (process.platform !== 'win32') {
      return [];
    }

    if (this.lastWindowsImageFileDropHash === imageHash) {
      return this.lastWindowsImageFileDropPaths;
    }

    this.lastWindowsImageFileDropHash = imageHash;
    this.lastWindowsImageFileDropPaths = await clipboardPlatformAdapter.readFilePaths([], { forceFallback: true });
    return this.lastWindowsImageFileDropPaths;
  }

  private async writeAsset(fileName: string, buffer: Buffer) {
    const dir = path.join(app.getPath('userData'), 'multi-device-clipboard-assets');
    await mkdir(dir, { recursive: true });
    const safeName = Array.from(fileName)
      .map((char) => {
        const code = char.charCodeAt(0);
        return code < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char;
      })
      .join('')
      .slice(0, 180);
    const assetPath = path.join(dir, safeName || `${randomUUID()}.bin`);
    await writeFile(assetPath, buffer);
    return assetPath;
  }

  private async createImagePreview(sourcePath: string, contentHash: string) {
    const image = nativeImage.createFromPath(sourcePath);
    if (image.isEmpty()) {
      return undefined;
    }

    const size = image.getSize();
    const maxSide = 160;
    const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
    const preview = image.resize({
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
      quality: 'best',
    });
    const png = preview.toPNG();
    if (!png.length) {
      return undefined;
    }
    return this.writeAsset(`${contentHash}-preview.png`, png);
  }

  private requireHost() {
    if (!this.host) {
      throw new Error('多设备剪贴板尚未初始化');
    }
    return this.host;
  }
}

function classifyText(text: string) {
  const tags = ['text'];
  if (/^https?:\/\//i.test(text.trim())) tags.push('url');
  if (/^\s{0,3}#{1,6}\s|\*\*|```|\[[^\]]+\]\([^)]+\)/m.test(text)) tags.push('markdown');
  if (/\p{Extended_Pictographic}/u.test(text)) tags.push('emoji');
  return tags;
}

function inferClipboardImageFileName(formats: string[], contentHash: string) {
  const htmlName = formats.includes('text/html')
    ? inferImageFileNameFromText(clipboard.readHTML())
    : '';
  if (htmlName) return htmlName;

  const textName = inferImageFileNameFromText(clipboard.readText());
  if (textName) return textName;

  return `clipboard-${contentHash.slice(0, 8)}.png`;
}

function inferImageFileNameFromText(value: string) {
  if (!value) return '';

  const candidates = [
    ...Array.from(value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(value.matchAll(/(?:https?|file):\/\/[^\s"'<>]+/gi)).map((match) => match[0]),
    value.trim(),
  ];

  for (const candidate of candidates) {
    const fileName = inferImageFileNameFromCandidate(candidate);
    if (fileName) return fileName;
  }
  return '';
}

function inferImageFileNameFromCandidate(value: string) {
  const normalized = normalizeClipboardPath(value);
  if (!normalized) return '';

  let pathname = normalized;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      pathname = new URL(normalized).pathname;
    } catch {
      pathname = normalized;
    }
  }

  const decoded = decodeURIComponent(pathname);
  const baseName = sanitizeClipboardDisplayFileName(path.basename(decoded));
  if (!baseName || !isImageFile(baseName)) {
    return '';
  }
  return baseName;
}

function sanitizeClipboardDisplayFileName(fileName: string) {
  return Array.from(fileName)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || /[<>:"/\\|?*]/.test(char) ? '_' : char;
    })
    .join('')
    .trim()
    .slice(0, 120);
}

function parseItemPaths(item: MultiDeviceClipboardItem) {
  try {
    const parsed = JSON.parse(item.text ?? '{}') as { paths?: string[] };
    const paths = Array.isArray(parsed.paths)
      ? uniqueExistingPaths(parsed.paths.filter((value): value is string => typeof value === 'string'))
      : [];
    if (paths.length) return paths;
  } catch {
    // Fall through to local cached asset when original paths are not available on this device.
  }
  if (item.assetPath && existsSync(item.assetPath)) return [item.assetPath];
  return [];
}

function safeStat(targetPath: string): Stats | null {
  try {
    return statSync(targetPath);
  } catch {
    return null;
  }
}

function uniqueExistingPaths(paths: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawPath of paths) {
    const normalized = normalizeClipboardPath(rawPath);
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) {
      continue;
    }
    if (!existsSync(normalized)) {
      continue;
    }
    seen.add(normalized.toLocaleLowerCase());
    result.push(normalized);
  }
  return result;
}

function normalizeClipboardPath(value: string) {
  const trimmed = value.trim().replace(/^"|"$/g, '');
  if (!trimmed) return '';
  if (/^file:/i.test(trimmed)) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return '';
    }
  }
  return trimmed;
}

function hashBufferParts(parts: string[], buffer: Buffer) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(Buffer.from(String(Buffer.byteLength(part))));
    hash.update(part);
  }
  hash.update(buffer);
  return hash.digest('hex');
}

function guessMimeType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (['.png'].includes(ext)) return 'image/png';
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (['.gif'].includes(ext)) return 'image/gif';
  if (['.mp4'].includes(ext)) return 'video/mp4';
  if (['.webm'].includes(ext)) return 'video/webm';
  if (['.mov'].includes(ext)) return 'video/quicktime';
  if (['.txt', '.md', '.json', '.csv', '.log'].includes(ext)) return 'text/plain';
  return 'application/octet-stream';
}

function isImageFile(fileName: string) {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'].includes(path.extname(fileName).toLowerCase());
}

function isVideoFile(fileName: string) {
  return ['.mp4', '.webm', '.mov', '.mkv'].includes(path.extname(fileName).toLowerCase());
}

function normalizeRemoteAddress(value?: string) {
  if (!value) return '127.0.0.1';
  if (value.startsWith('::ffff:')) return value.slice('::ffff:'.length);
  return value === '::1' ? '127.0.0.1' : value;
}

function formatAddressForUrl(address: string) {
  return address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
}

function parseManualPairingEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new Error('请输入设备 IP 地址');
  }
  const withoutScheme = trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const ipv6Match = withoutScheme.match(/^\[([^\]]+)](?::(\d+))?$/);
  if (ipv6Match) {
    return {
      address: ipv6Match[1],
      port: parsePort(ipv6Match[2]),
    };
  }
  const lastColon = withoutScheme.lastIndexOf(':');
  if (lastColon > -1 && withoutScheme.indexOf(':') === lastColon) {
    return {
      address: withoutScheme.slice(0, lastColon),
      port: parsePort(withoutScheme.slice(lastColon + 1)),
    };
  }
  return {
    address: withoutScheme,
    port: DEFAULT_SYNC_PORT,
  };
}

function parsePort(value?: string) {
  if (!value) return DEFAULT_SYNC_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口必须是 1-65535 之间的数字');
  }
  return port;
}

function selectPreferredNetworkAddress(priority: string[] = []) {
  const interfaces = listLocalIpv4Interfaces();
  for (const key of priority) {
    const matched = interfaces.find((item) => item.key === key || item.address === key);
    if (matched) return matched.address;
  }
  return interfaces.sort((a, b) => networkAddressRank(b.address) - networkAddressRank(a.address))[0]?.address;
}

function listLocalIpv4Interfaces() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((item) => item.family === 'IPv4' && !item.internal)
      .map((item) => ({
        key: `${name}|${item.address}`,
        name,
        address: item.address,
      })));
}

function parseIpv4Address(address: string) {
  const parts = address.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts as [number, number, number, number];
}

function networkAddressRank(address: string) {
  const parts = parseIpv4Address(address);
  if (!parts) return 0;
  const [a, b] = parts;
  if (a === 192 && b === 168) return 60;
  if (a === 10) return 50;
  if (a === 172 && b >= 16 && b <= 31) return 40;
  if (a === 169 && b === 254) return 1;
  return 20;
}

function listenServer(server: http.Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

export const multiDeviceClipboardService = new MultiDeviceClipboardService();
