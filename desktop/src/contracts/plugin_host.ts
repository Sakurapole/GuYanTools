import type {
  AndroidDevice,
  AndroidDeviceEvent,
  AndroidSession,
  AndroidSessionEvent,
} from './android-tools';

export type PluginTrustLevel = 'sandboxed' | 'trusted';
export type PluginRuntimeKind = 'ui' | 'worker' | 'hybrid' | 'host';
export type PluginWorkerRuntimeKind = 'browser' | 'utility';
export type PluginLifecycleState =
  'discovered' | 'installed' | 'resolved' | 'enabled' | 'disabled' | 'errored' | 'incompatible';

export type PluginPermission =
  | 'workspace.read'
  | 'data.user.read'
  | 'data.project.read'
  | 'data.project.write'
  | 'data.settings.read'
  | 'data.settings.write'
  | 'storage.self'
  | 'navigation.open'
  | 'ui.contribute'
  | 'commands.execute'
  | 'system.dialog'
  | 'system.clipboard'
  | 'system.notifications'
  | 'system.shortcuts'
  | 'background.run'
  | 'network.fetch'
  | 'downloads.manage'
  | 'jobs.manage'
  | 'files.read'
  | 'files.write'
  | 'tools.ffmpeg'
  | 'media.preview'
  | 'media.transcode'
  | 'media.tag'
  | 'secrets.self'
  | 'observability.logs'
  | 'models.execute'
  | 'android.devices.read'
  | 'android.sessions.read'
  | 'android.sessions.control'
  | 'android.audio.playback'
  | 'android.otg.control'
  | 'android.fastboot.read'
  | 'android.fastboot.reboot';

export interface PluginCapabilityDeclaration {
  id: string;
  kind: 'media-source' | 'metadata-provider' | 'transformer' | 'importer';
  operations: string[];
  match?: {
    hosts?: string[];
    schemes?: string[];
    mimeTypes?: string[];
  };
}

export interface PluginCapabilityDependency {
  capability: string;
  optional?: boolean;
}

export interface PluginPageContribution {
  id: string;
  title: string;
  routePath?: string;
  icon?: string;
  description?: string;
}

export interface PluginWidgetContribution {
  id: string;
  title: string;
  description?: string;
  target?: 'home' | 'sidebar' | 'settings';
  actionId?: string;
}

export interface PluginCommandContribution {
  id: string;
  title: string;
  description?: string;
}

export interface PluginMenuContribution {
  id: string;
  title: string;
  target: 'app' | 'context';
  commandId: string;
}

export interface PluginShortcutContribution {
  id: string;
  accelerator: string;
  commandId: string;
}

export interface PluginBackgroundTaskContribution {
  id: string;
  title: string;
  schedule?: string;
  event?: string;
}

export interface PluginContributes {
  pages?: PluginPageContribution[];
  widgets?: PluginWidgetContribution[];
  commands?: PluginCommandContribution[];
  menus?: PluginMenuContribution[];
  shortcuts?: PluginShortcutContribution[];
  backgroundTasks?: PluginBackgroundTaskContribution[];
}

export interface PluginSettingSchema {
  type: 'string' | 'number' | 'boolean' | 'select';
  title: string;
  description?: string;
  default?: string | number | boolean;
  options?: Array<{ label: string; value: string | number }>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface PluginModelRuntime {
  pythonVersion: string;
  entry: string;
  dependencies: {
    common: string[];
    cpu: string[];
    cuda: string[];
    indexUrls?: { cpu?: string; cuda?: string };
    profiles?: import('./plugin_model').ModelDependencyProfile[];
  };
}

export interface PluginManifest {
  schemaVersion: '1.0' | '1.1';
  id: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  pluginApiVersion: string;
  uiApiVersion?: string;
  hostVersionRange: string;
  trustLevel: PluginTrustLevel;
  runtime: PluginRuntimeKind;
  /**
   * How the worker entry is hosted.
   * - browser: sandboxed WebContentsView (legacy default)
   * - utility: Electron utilityProcess (preferred for pure JS workers)
   */
  workerRuntime?: PluginWorkerRuntimeKind;
  entry: {
    ui?: string;
    worker?: string;
  };
  ui?: {
    theme: 'guyantools';
    components: string;
    showDevToolsButton?: boolean;
  };
  permissions: PluginPermission[];
  capabilities: PluginCapabilityDeclaration[];
  contributes: PluginContributes;
  settings?: Record<string, PluginSettingSchema>;
  modelRuntime?: PluginModelRuntime;
  /** Capabilities this plugin expects other enabled plugins to provide. */
  dependencies?: PluginCapabilityDependency[];
}

export interface ResolvedPluginEntryPaths {
  ui?: string;
  worker?: string;
}

export interface PluginInstallSource {
  type: 'git' | 'marketplace' | 'local' | 'builtin' | 'npm';
  value?: string;
  url?: string;
  marketplaceId?: string;
  pluginId?: string;
  ref?: string;
  refType?: 'branch' | 'tag' | 'commit';
  resolvedCommit?: string;
}

export type PluginInstallPhase =
  | 'resolving-marketplace'
  | 'cloning'
  | 'validating'
  | 'activating'
  | 'registering'
  | 'completed'
  | 'failed';

/**
 * Installation milestones originate exclusively from the host lifecycle.
 * Plugins cannot write to this channel or provide their own progress values.
 */
export interface PluginInstallProgress {
  phase: PluginInstallPhase;
  progress: number;
  pluginId?: string;
  error?: string;
}

export interface MarketplacePluginSummary {
  id: string;
  name: string;
  version: string;
  description?: string;
  repository: string;
  ref: string;
  refType: 'branch' | 'tag' | 'commit';
  resolvedCommit: string;
  manifestSha256?: string;
  hostVersionRange?: string;
  permissions?: PluginPermission[];
  capabilities?: PluginCapabilityDeclaration[];
  packageSha256?: string;
  signature?: {
    algorithm: 'ed25519';
    publicKey: string;
    signature: string;
    signedAt: string;
  };
}

export interface MarketplaceCatalog {
  schemaVersion: '1.0';
  marketplaceId: string;
  name: string;
  plugins: MarketplacePluginSummary[];
  generatedAt?: string;
  signature?: {
    algorithm: 'ed25519';
    publicKey: string;
    signature: string;
    signedAt: string;
  };
}

export interface MarketplaceCacheRecord {
  marketplaceId: string;
  url: string;
  ref: string;
  catalog: MarketplaceCatalog;
  catalogSha256: string;
  refreshedAt: string;
  fromCache?: boolean;
}

export interface PluginRuntimeContext {
  pluginId: string;
  pageId?: string;
  trustLevel: PluginTrustLevel;
  runtime: PluginRuntimeKind;
  permissions: PluginPermission[];
}

export interface PluginThemeDescriptor {
  mode: 'light' | 'dark';
  tokensVersion: string;
}

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

export interface InstalledPluginRecord {
  manifest: PluginManifest;
  enabled: boolean;
  status: PluginLifecycleState;
  installSource: PluginInstallSource;
  resolvedEntryPaths: ResolvedPluginEntryPaths;
  approvedPermissions: PluginPermission[];
  packageName?: string;
  localPath?: string;
  error?: string;
  consecutiveStartFailures?: number;
  signatureVerified?: boolean;
  signatureWarning?: string;
  installedAt: string;
  updatedAt: string;
  packageSha256?: string;
}

export interface PluginCapabilitySummary {
  workspace: string[];
  data: string[];
  storage: string[];
  navigation: string[];
  commands: string[];
  ui: string[];
  system: string[];
  observability: string[];
  network: string[];
  downloads: string[];
  jobs: string[];
  files: string[];
  media: string[];
  models: string[];
  secrets: string[];
  android: string[];
}

export interface PluginPageDescriptor {
  pluginId: string;
  pageId: string;
  title: string;
  routePath: string;
  icon?: string;
  description?: string;
  trustLevel: PluginTrustLevel;
  showDevToolsButton?: boolean;
}

export function getPluginPageRoutePath(pluginId: string, pageId: string): string {
  return `/plugins/runtime/${encodeURIComponent(pluginId)}/${encodeURIComponent(pageId)}`;
}

export interface PluginHostSummary {
  apiVersion: string;
  pluginDirectory: string;
  registryFile: string;
  capabilities: PluginCapabilitySummary;
}

export interface PluginViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PluginPermissionCopy {
  permission: PluginPermission;
  title: string;
  description: string;
  tier: 'default' | 'elevated' | 'builtin';
}

export interface PluginContributionsSummary {
  pages: PluginPageDescriptor[];
  widgets: Array<{ pluginId: string; contribution: PluginWidgetContribution }>;
  commands: Array<{ pluginId: string; contribution: PluginCommandContribution }>;
  menus: Array<{ pluginId: string; contribution: PluginMenuContribution }>;
  shortcuts: Array<{ pluginId: string; contribution: PluginShortcutContribution }>;
  backgroundTasks: Array<{ pluginId: string; contribution: PluginBackgroundTaskContribution }>;
}

export interface PluginAuditEvent {
  pluginId: string;
  runtime: PluginRuntimeKind;
  operation: string;
  result: 'allowed' | 'denied';
  at?: string;
}

export interface PluginHostApi {
  getHostSummary: () => Promise<PluginHostSummary>;
  listPlugins: () => Promise<InstalledPluginRecord[]>;
  listPages: () => Promise<PluginPageDescriptor[]>;
  listContributions: () => Promise<PluginContributionsSummary>;
  listPluginJobs: (pluginId: string) => Promise<import('./plugin_media').JobRecord[]>;
  executePluginCommand: (
    pluginId: string,
    commandId: string,
    payload?: unknown
  ) => Promise<{ accepted: boolean; result?: unknown }>;
  listAuditEvents: (pluginId?: string) => Promise<PluginAuditEvent[]>;
  getPermissionCopy: () => Promise<PluginPermissionCopy[]>;
  getPluginDebugInfo: (pluginId: string) => Promise<{
    record: InstalledPluginRecord;
    audit: PluginAuditEvent[];
    contributions: PluginContributionsSummary;
    capabilities: Array<{
      pluginId: string;
      id: string;
      qualifiedId: string;
      kind: string;
      operations: string[];
    }>;
    consecutiveStartFailures: number;
  }>;
  getPluginSettings: (pluginId: string) => Promise<Record<string, unknown>>;
  setPluginSetting: (pluginId: string, key: string, value: unknown) => Promise<void>;
  installPluginFromPackage: (
    packageName: string,
    approvedPermissions?: PluginPermission[]
  ) => Promise<InstalledPluginRecord>;
  registerLocalPlugin: (
    inputPath: string,
    approvedPermissions?: PluginPermission[]
  ) => Promise<InstalledPluginRecord>;
  pickLocalPluginPath: () => Promise<string | null>;
  approvePermissions: (
    pluginId: string,
    approvedPermissions: PluginPermission[]
  ) => Promise<InstalledPluginRecord>;
  enablePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  disablePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  mountPage: (pluginId: string, pageId: string, bounds: PluginViewportBounds) => Promise<void>;
  updateMountedPageBounds: (bounds: PluginViewportBounds) => Promise<void>;
  unmountPage: (pluginId?: string, pageId?: string) => Promise<void>;
  openDevTools: (pluginId: string, pageId: string) => Promise<void>;
  listMarketplaces: () => Promise<MarketplaceCacheRecord[]>;
  refreshMarketplace: (input: {
    id: string;
    url: string;
    ref: string;
  }) => Promise<MarketplaceCacheRecord>;
  searchMarketplace: (query: string) => Promise<MarketplacePluginSummary[]>;
  onInstallProgress: (listener: (progress: PluginInstallProgress) => void) => () => void;
  installFromGit: (input: {
    url: string;
    ref: string;
    refType: 'branch' | 'tag' | 'commit';
    expected?: Pick<MarketplacePluginSummary, 'id' | 'version' | 'resolvedCommit'>;
    approvedPermissions?: PluginPermission[];
  }) => Promise<InstalledPluginRecord>;
  installFromMarketplace: (
    marketplaceId: string,
    pluginId: string,
    approvedPermissions: PluginPermission[]
  ) => Promise<InstalledPluginRecord>;
  updatePlugin: (
    pluginId: string,
    approvedPermissions?: PluginPermission[]
  ) => Promise<InstalledPluginRecord>;
  rollbackPlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  uninstallPlugin: (pluginId: string) => Promise<void>;
  listDevSessions: () => Promise<PluginDevSession[]>;
  connectDevSession: (session: PluginDevSession) => Promise<PluginDevSession>;
  connectDevSessionFromFile: (rootPath: string) => Promise<PluginDevSession>;
  disconnectDevSession: (pluginId: string) => Promise<void>;
}

export interface PluginRuntimeStorageApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface PluginRuntimeApi {
  getContext: () => Promise<PluginRuntimeContext>;
  lifecycle: { ready: () => Promise<void> };
  models: import('./plugin_model').ModelRuntimeApi;
  workspace: {
    getCurrent: () => Promise<{ workspaceKey: string; name: string }>;
  };
  data: {
    getCapabilities: () => Promise<PluginCapabilitySummary['data']>;
  };
  storage: PluginRuntimeStorageApi;
  navigation: {
    openRoute: (route: string) => Promise<void>;
  };
  ui: {
    getPages: () => Promise<PluginPageDescriptor[]>;
    getTheme: () => Promise<PluginThemeDescriptor>;
    onThemeChanged: (listener: (theme: PluginThemeDescriptor) => void) => () => void;
  };
  system: {
    getCapabilities: () => Promise<PluginCapabilitySummary['system']>;
    showNotification: (payload: import('./notification').NotificationPayload) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
  logger: {
    info: (message: string, meta?: unknown) => Promise<void>;
    error: (message: string, meta?: unknown) => Promise<void>;
  };
  network: {
    fetch: (
      input: import('./plugin_media').NetworkRequest
    ) => Promise<import('./plugin_media').NetworkResponse>;
  };
  files: {
    createDataGrant: (
      accessMode?: import('./plugin_media').FileGrant['accessMode']
    ) => Promise<import('./plugin_media').FileGrant>;
    pickDirectoryGrant: () => Promise<import('./plugin_media').FileGrant | null>;
    revoke: (grantId: string) => Promise<void>;
    read: (grantId: string, targetPath: string) => Promise<string>;
    write: (grantId: string, targetPath: string, bytesBase64: string) => Promise<void>;
  };
  downloads: {
    direct: (input: { url: string; grantId: string; fileName: string }) => Promise<string>;
  };
  jobs: {
    create: (
      kind: string,
      input: unknown,
      parentJobId?: string
    ) => Promise<import('./plugin_media').JobRecord>;
    list: () => Promise<import('./plugin_media').JobRecord[]>;
    get: (id: string) => Promise<import('./plugin_media').JobRecord>;
    update: (id: string, input: unknown) => Promise<import('./plugin_media').JobRecord>;
    cancel: (id: string) => Promise<import('./plugin_media').JobRecord>;
    retry: (sourceId: string) => Promise<import('./plugin_media').JobRecord>;
    onEvent: (listener: (job: import('./plugin_media').JobRecord) => void) => () => void;
  };
  capabilities: {
    register: (
      capabilityId: string,
      handler: (operation: string, payload?: unknown) => unknown | Promise<unknown>
    ) => Promise<void>;
    list: () => Promise<
      Array<{
        pluginId: string;
        id: string;
        qualifiedId: string;
        kind: string;
        operations: string[];
        match?: { hosts?: string[]; schemes?: string[]; mimeTypes?: string[] };
      }>
    >;
    resolveByUrl: (
      url: string
    ) => Promise<
      Array<{
        pluginId: string;
        id: string;
        qualifiedId: string;
        kind: string;
        operations: string[];
      }>
    >;
    invoke: (input: {
      capabilityId: string;
      operation: string;
      payload?: unknown;
    }) => Promise<unknown>;
  };
  commands: {
    execute: (
      commandId: string,
      payload?: unknown
    ) => Promise<{ accepted: boolean; result?: unknown }>;
    register: (commandId: string) => Promise<void>;
  };
  media: {
    probe: (grantId: string, targetPath: string) => Promise<import('./plugin_media').MediaProbe>;
    transcode: (input: {
      inputGrantId: string;
      inputPath: string;
      outputGrantId: string;
      outputPath: string;
      options?: {
        audioCodec?: string;
        videoCodec?: string;
        format?: string;
        additionalInputPaths?: string[];
      };
    }) => Promise<string>;
    preview: (
      url: string,
      mimeType?: string,
      headers?: Record<string, string>,
      credential?: import('./plugin_media').PluginCredentialReference
    ) => Promise<import('./plugin_media').PreviewGrant>;
    writeTags: (
      grantId: string,
      targetPath: string,
      tags: import('./plugin_media').MediaTags
    ) => Promise<string>;
  };
  android: {
    devices: {
      list: () => Promise<AndroidDevice[]>;
      onChanged: (listener: (event: AndroidDeviceEvent) => void) => () => void;
    };
    sessions: {
      list: () => Promise<AndroidSession[]>;
      startMirror: (input: {
        deviceSerial: string;
        keyboard?: 'uhid' | 'sdk';
        mouse?: 'uhid' | 'sdk';
      }) => Promise<AndroidSession>;
      startAudio: (input: {
        deviceSerial: string;
        duplicateOnDevice?: boolean;
      }) => Promise<AndroidSession>;
      startOtg: (input: {
        deviceSerial: string;
        keyboard?: boolean;
        mouse?: boolean;
      }) => Promise<AndroidSession>;
      stop: (sessionId: string) => Promise<void>;
      onEvent: (listener: (event: AndroidSessionEvent) => void) => () => void;
    };
    fastboot: {
      list: () => Promise<AndroidDevice[]>;
      getVars: (deviceSerial: string, names: string[]) => Promise<Record<string, string>>;
      reboot: (deviceSerial: string, target?: 'system' | 'bootloader') => Promise<void>;
    };
  };
  secrets: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}
