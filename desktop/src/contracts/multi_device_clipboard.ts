export type MultiDeviceClipboardContentType = 'text' | 'image' | 'file';

export interface MultiDeviceClipboardItem {
  id: string;
  sourceDeviceId: string;
  sourceDeviceName: string;
  contentType: MultiDeviceClipboardContentType;
  mimeType?: string;
  text?: string;
  fileName?: string;
  assetPath?: string;
  previewPath?: string;
  byteSize: number;
  contentHash: string;
  tagsJson: string;
  localOnly: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MultiDeviceClipboardDevice {
  id: string;
  name: string;
  platform: string;
  publicKey?: string;
  trusted: boolean;
  isSelf: boolean;
  lastAddress?: string;
  lastPort?: number;
  lastSeenAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type MultiDeviceClipboardDeviceState =
  | 'self'
  | 'trustedOnline'
  | 'trustedOffline'
  | 'available'
  | 'unknown';

export interface MultiDeviceClipboardDeviceStatus {
  deviceId: string;
  name: string;
  platform: string;
  trusted: boolean;
  isSelf: boolean;
  state: MultiDeviceClipboardDeviceState;
  online: boolean;
  lastAddress?: string;
  lastPort?: number;
  lastSeenAt?: number;
  secondsSinceSeen?: number;
}

export interface MultiDeviceClipboardDiscoveredDevice {
  id: string;
  name: string;
  platform: string;
  address: string;
  port: number;
  serviceName: string;
  lastSeenAt: number;
}

export interface MultiDeviceClipboardPairingRequest {
  requestId: string;
  deviceId: string;
  deviceName: string;
  address: string;
  port: number;
  code: string;
  createdAt: number;
}

export type MultiDeviceClipboardEvent =
  | { type: 'items-changed'; item?: MultiDeviceClipboardItem }
  | { type: 'devices-changed' }
  | { type: 'discovered-devices-changed' }
  | { type: 'pairing-request'; request: MultiDeviceClipboardPairingRequest }
  | { type: 'status-changed'; enabled: boolean; message?: string };

export interface MultiDeviceClipboardApi {
  listItems: () => Promise<MultiDeviceClipboardItem[]>;
  applyItem: (itemId: string) => Promise<void>;
  showItemPreview: (itemId: string) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  listDevices: () => Promise<MultiDeviceClipboardDevice[]>;
  listDeviceStatuses: (onlineWindowSeconds: number) => Promise<MultiDeviceClipboardDeviceStatus[]>;
  listDiscoveredDevices: () => Promise<MultiDeviceClipboardDiscoveredDevice[]>;
  listPairingRequests: () => Promise<MultiDeviceClipboardPairingRequest[]>;
  startPairing: (deviceId: string) => Promise<MultiDeviceClipboardPairingRequest>;
  startPairingByAddress: (endpoint: string) => Promise<MultiDeviceClipboardPairingRequest>;
  approvePairing: (requestId: string) => Promise<void>;
  rejectPairing: (requestId: string) => Promise<void>;
  forgetDevice: (deviceId: string) => Promise<void>;
  showWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  dockWindow: () => Promise<void>;
  expandWindow: () => Promise<void>;
  openDevTools: () => Promise<void>;
  onEvent: (listener: (event: MultiDeviceClipboardEvent) => void) => () => void;
}

declare global {
  interface Window {
    multiDeviceClipboardApi?: MultiDeviceClipboardApi;
  }
}
