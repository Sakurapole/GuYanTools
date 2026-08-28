export type PluginTrustLevel = 'sandboxed' | 'trusted';
export type PluginRuntimeKind = 'ui' | 'worker' | 'hybrid' | 'host';
export type PluginPermission = string;

export interface PluginThemeDescriptor { mode: 'light' | 'dark'; tokensVersion: string; }
export interface PluginDevSession {
  pluginId: string;
  rootPath: string;
  uiUrl: string;
  workerUrl?: string;
  host: '127.0.0.1';
  port: number;
  sessionToken: string;
  processId?: number;
  startedAt: string;
}
export interface PluginRuntimeContext {
  pluginId: string;
  pageId?: string;
  trustLevel: PluginTrustLevel;
  runtime: PluginRuntimeKind;
  permissions: PluginPermission[];
}
export interface PluginCapabilitySummary { [key: string]: string[]; }
export interface PluginPageDescriptor {
  pluginId: string;
  pageId: string;
  title: string;
  routePath: string;
  icon?: string;
  description?: string;
  trustLevel: PluginTrustLevel;
}
export interface PluginCredentialReference {
  secretKey: string;
  allowedOrigins: string[];
  headerName?: 'Cookie';
}
export interface NetworkRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  responseType?: 'json' | 'text' | 'bytes';
  followRedirects?: boolean;
  credential?: PluginCredentialReference;
  timeoutMs?: number;
  maxBytes?: number;
}
export interface NetworkResponse { status: number; headers: Record<string, string>; body: unknown; finalUrl: string; }
export interface FileGrant { id: string; pluginId: string; purpose: string; rootPath: string; accessMode: 'read' | 'write' | 'read-write'; expiresAt: string; maxBytes: number; revoked: boolean; }
export interface JobRecord { id: string; pluginId: string; parentJobId?: string; kind: string; status: string; progress: number; currentStep?: string; input: unknown; output?: unknown; error?: unknown; createdAt: string; updatedAt: string; }
export interface MediaProbe { durationMs?: number; width?: number; height?: number; bitrate?: number; mimeType?: string; streams: Array<{ kind: 'audio' | 'video' | 'subtitle' | 'data'; codec?: string; language?: string }>; }
export interface MediaTags { [key: string]: string | undefined; }
export interface PreviewGrant { id: string; pluginId: string; url: string; expiresAt: string; mimeType?: string; }
export interface NotificationPayload { type: string; size: string; title?: string; message?: string; [key: string]: unknown; }

export type AndroidDeviceState = 'device' | 'unauthorized' | 'offline' | 'bootloader' | 'no-permissions' | 'unknown';
export type AndroidTransport = 'adb-usb' | 'adb-tcpip' | 'fastboot-usb';
export interface AndroidDevice {
  serial: string;
  state: AndroidDeviceState;
  transport: AndroidTransport;
  model?: string;
  product?: string;
  androidVersion?: string;
  sdkLevel?: number;
  usb?: boolean;
}
export interface AndroidSession {
  sessionId: string;
  deviceSerial: string;
  mode: 'mirror-control' | 'audio-only' | 'otg';
  keyboard: 'sdk' | 'uhid' | 'aoa' | 'disabled';
  mouse: 'sdk' | 'uhid' | 'aoa' | 'disabled';
  pid?: number;
  ownerPluginId?: string;
  status: 'starting' | 'running' | 'stopping' | 'exited' | 'failed';
  startedAt: string;
  errorCode?: string;
  errorMessage?: string;
}
export interface AndroidDeviceEvent { devices: AndroidDevice[]; timestamp: string; }
export interface AndroidSessionEvent {
  type: 'created' | 'started' | 'stopped' | 'exited' | 'failed' | 'device-disconnected';
  session: AndroidSession;
  timestamp: string;
}

export interface PluginRuntimeApi {
  getContext: () => Promise<PluginRuntimeContext>;
  workspace: { getCurrent: () => Promise<{ workspaceKey: string; name: string }> };
  data: { getCapabilities: () => Promise<string[]> };
  storage: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> };
  navigation: { openRoute: (route: string) => Promise<void> };
  commands: { execute: (commandId: string, payload?: unknown) => Promise<{ accepted: boolean }> };
  ui: {
    getPages: () => Promise<PluginPageDescriptor[]>;
    getTheme: () => Promise<PluginThemeDescriptor>;
    onThemeChanged: (listener: (theme: PluginThemeDescriptor) => void) => () => void;
  };
  system: { getCapabilities: () => Promise<string[]>; showNotification: (payload: NotificationPayload) => Promise<void> };
  logger: { info: (message: string, meta?: unknown) => Promise<void>; error: (message: string, meta?: unknown) => Promise<void> };
  network: { fetch: (input: NetworkRequest) => Promise<NetworkResponse> };
  files: {
    createDataGrant: (accessMode?: FileGrant['accessMode']) => Promise<FileGrant>;
    pickDirectoryGrant: () => Promise<FileGrant | null>;
    revoke: (grantId: string) => Promise<void>;
    read: (grantId: string, targetPath: string) => Promise<string>;
    write: (grantId: string, targetPath: string, bytesBase64: string) => Promise<void>;
  };
  downloads: { direct: (input: { url: string; grantId: string; fileName: string }) => Promise<string> };
  jobs: {
    create: (kind: string, input: unknown, parentJobId?: string) => Promise<JobRecord>;
    list: () => Promise<JobRecord[]>;
    get: (id: string) => Promise<JobRecord>;
    update: (id: string, input: unknown) => Promise<JobRecord>;
    cancel: (id: string) => Promise<JobRecord>;
    retry: (sourceId: string) => Promise<JobRecord>;
  };
  media: {
    probe: (grantId: string, targetPath: string) => Promise<MediaProbe>;
    transcode: (input: unknown) => Promise<string>;
    preview: (url: string, mimeType?: string, headers?: Record<string, string>, credential?: PluginCredentialReference) => Promise<PreviewGrant>;
    writeTags: (grantId: string, targetPath: string, tags: MediaTags) => Promise<string>;
  };
  android: {
    devices: {
      list: () => Promise<AndroidDevice[]>;
      onChanged: (listener: (event: AndroidDeviceEvent) => void) => () => void;
    };
    sessions: {
      list: () => Promise<AndroidSession[]>;
      startMirror: (input: { deviceSerial: string; keyboard?: 'uhid' | 'sdk'; mouse?: 'uhid' | 'sdk' }) => Promise<AndroidSession>;
      startAudio: (input: { deviceSerial: string; duplicateOnDevice?: boolean }) => Promise<AndroidSession>;
      startOtg: (input: { deviceSerial: string; keyboard?: boolean; mouse?: boolean }) => Promise<AndroidSession>;
      stop: (sessionId: string) => Promise<void>;
      onEvent: (listener: (event: AndroidSessionEvent) => void) => () => void;
    };
    fastboot: {
      list: () => Promise<AndroidDevice[]>;
      getVars: (deviceSerial: string, names: string[]) => Promise<Record<string, string>>;
      reboot: (deviceSerial: string, target?: 'system' | 'bootloader') => Promise<void>;
    };
  };
  secrets: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; delete: (key: string) => Promise<void> };
}
