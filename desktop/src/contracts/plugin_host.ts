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
  | 'background.run';

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
  id: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  pluginApiVersion: string;
  hostVersionRange: string;
  trustLevel: PluginTrustLevel;
  runtime: PluginRuntimeKind;
  entry: string;
  permissions: PluginPermission[];
  contributes: PluginContributes;
}

export interface PluginInstallSource {
  type: 'npm' | 'local' | 'builtin';
  value: string;
}

export interface PluginRuntimeContext {
  pluginId: string;
  pageId?: string;
  trustLevel: PluginTrustLevel;
  runtime: PluginRuntimeKind;
  permissions: PluginPermission[];
}

export interface InstalledPluginRecord {
  manifest: PluginManifest;
  enabled: boolean;
  status: PluginLifecycleState;
  installSource: PluginInstallSource;
  resolvedEntryPath: string;
  packageName?: string;
  localPath?: string;
  error?: string;
  installedAt: string;
  updatedAt: string;
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
  installPluginFromPackage: (packageName: string) => Promise<InstalledPluginRecord>;
  registerLocalPlugin: (inputPath: string) => Promise<InstalledPluginRecord>;
  enablePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  disablePlugin: (pluginId: string) => Promise<InstalledPluginRecord>;
  mountPage: (pluginId: string, pageId: string, bounds: PluginViewportBounds) => Promise<void>;
  updateMountedPageBounds: (bounds: PluginViewportBounds) => Promise<void>;
  unmountPage: (pluginId?: string, pageId?: string) => Promise<void>;
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
  };
  system: {
    getCapabilities: () => Promise<PluginCapabilitySummary['system']>;
    showNotification: (payload: import('./notification').NotificationPayload) => Promise<void>;
  };
  logger: {
    info: (message: string, meta?: unknown) => Promise<void>;
    error: (message: string, meta?: unknown) => Promise<void>;
  };
}
