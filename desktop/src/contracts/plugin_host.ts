export type PluginTrustLevel = 'sandboxed' | 'trusted';
export type PluginRuntimeKind = 'ui' | 'worker' | 'hybrid' | 'host';
export type PluginLifecycleState =
  | 'discovered'
  | 'installed'
  | 'resolved'
  | 'enabled'
  | 'disabled'
  | 'errored'
  | 'incompatible';

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
  | 'observability.logs';

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
  entry: {
    ui?: string;
    worker?: string;
  };
  ui?: {
    theme: 'guyantools';
    components: string;
  };
  permissions: PluginPermission[];
  capabilities: PluginCapabilityDeclaration[];
  contributes: PluginContributes;
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
}

export interface MarketplaceCatalog {
  schemaVersion: '1.0';
  marketplaceId: string;
  name: string;
  plugins: MarketplacePluginSummary[];
  generatedAt?: string;
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
  secrets: string[];
}

export interface PluginPageDescriptor {
  pluginId: string;
  pageId: string;
  title: string;
  routePath: string;
  icon?: string;
  description?: string;
  trustLevel: PluginTrustLevel;
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

export interface PluginHostApi {
  getHostSummary: () => Promise<PluginHostSummary>;
  listPlugins: () => Promise<InstalledPluginRecord[]>;
  listPages: () => Promise<PluginPageDescriptor[]>;
  listPluginJobs: (pluginId: string) => Promise<import('./plugin_media').JobRecord[]>;
  installPluginFromPackage: (packageName: string) => Promise<InstalledPluginRecord>;
  registerLocalPlugin: (inputPath: string) => Promise<InstalledPluginRecord>;
  enablePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  disablePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  mountPage: (pluginId: string, pageId: string, bounds: PluginViewportBounds) => Promise<void>;
  updateMountedPageBounds: (bounds: PluginViewportBounds) => Promise<void>;
  unmountPage: (pluginId?: string, pageId?: string) => Promise<void>;
  listMarketplaces: () => Promise<MarketplaceCacheRecord[]>;
  refreshMarketplace: (input: { id: string; url: string; ref: string }) => Promise<MarketplaceCacheRecord>;
  searchMarketplace: (query: string) => Promise<MarketplacePluginSummary[]>;
  onInstallProgress: (listener: (progress: PluginInstallProgress) => void) => () => void;
  installFromGit: (input: { url: string; ref: string; refType: 'branch' | 'tag' | 'commit'; expected?: Pick<MarketplacePluginSummary, 'id' | 'version' | 'resolvedCommit'> }) => Promise<InstalledPluginRecord>;
  installFromMarketplace: (marketplaceId: string, pluginId: string, approvedPermissions: PluginPermission[]) => Promise<InstalledPluginRecord>;
  updatePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  rollbackPlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  uninstallPlugin: (pluginId: string) => Promise<void>;
}

export interface PluginRuntimeStorageApi {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface PluginRuntimeApi {
  getContext: () => Promise<PluginRuntimeContext>;
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
  commands: {
    execute: (commandId: string, payload?: unknown) => Promise<{ accepted: boolean }>;
  };
  ui: {
    getPages: () => Promise<PluginPageDescriptor[]>;
    getTheme: () => Promise<PluginThemeDescriptor>;
    onThemeChanged: (listener: (theme: PluginThemeDescriptor) => void) => () => void;
  };
  system: {
    getCapabilities: () => Promise<PluginCapabilitySummary['system']>;
    showNotification: (payload: import('./notification').NotificationPayload) => Promise<void>;
  };
  logger: {
    info: (message: string, meta?: unknown) => Promise<void>;
    error: (message: string, meta?: unknown) => Promise<void>;
  };
  network: {
    fetch: (input: import('./plugin_media').NetworkRequest) => Promise<import('./plugin_media').NetworkResponse>;
  };
  files: {
    createDataGrant: (accessMode?: import('./plugin_media').FileGrant['accessMode']) => Promise<import('./plugin_media').FileGrant>;
    pickDirectoryGrant: () => Promise<import('./plugin_media').FileGrant | null>;
    revoke: (grantId: string) => Promise<void>;
    read: (grantId: string, targetPath: string) => Promise<string>;
    write: (grantId: string, targetPath: string, bytesBase64: string) => Promise<void>;
  };
  downloads: {
    direct: (input: { url: string; grantId: string; fileName: string }) => Promise<string>;
  };
  jobs: {
    create: (kind: string, input: unknown, parentJobId?: string) => Promise<import('./plugin_media').JobRecord>;
    list: () => Promise<import('./plugin_media').JobRecord[]>;
    get: (id: string) => Promise<import('./plugin_media').JobRecord>;
    update: (id: string, input: unknown) => Promise<import('./plugin_media').JobRecord>;
    cancel: (id: string) => Promise<import('./plugin_media').JobRecord>;
    retry: (sourceId: string) => Promise<import('./plugin_media').JobRecord>;
  };
  media: {
    probe: (grantId: string, targetPath: string) => Promise<import('./plugin_media').MediaProbe>;
    transcode: (input: { inputGrantId: string; inputPath: string; outputGrantId: string; outputPath: string; options?: { audioCodec?: string; videoCodec?: string; format?: string; additionalInputPaths?: string[] } }) => Promise<string>;
    preview: (url: string, mimeType?: string) => Promise<import('./plugin_media').PreviewGrant>;
    writeTags: (grantId: string, targetPath: string, tags: import('./plugin_media').MediaTags) => Promise<string>;
  };
  secrets: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}
