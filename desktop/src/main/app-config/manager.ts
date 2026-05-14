import { WebContents } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import { dbManager } from '@/core/database';
import { APP_CONFIG_FILE } from '../constants/paths';
import type {
  AppAppearanceConfig,
  AppBottomBarConfig,
  AppBottomBarTabId,
  AppConfig,
  AppConfigPatch,
  AppFeaturesConfig,
  AppPluginsConfig,
  AppShortcutsConfig,
  AppTheme,
  AppToolsConfig,
  LocalFontOption,
  MultiDeviceClipboardFeatureConfig,
} from '@/contracts/app_config';
import type { LocalTerminalProfileConfig, TerminalBackgroundConfig, TerminalSshProfileGroupConfig } from '@/contracts/terminal';
import type { AppWebConfig, ChromeExtensionRecord, WebScriptRule } from '@/contracts/webview';
import {
  APP_BOTTOM_BAR_REQUIRED_TAB_IDS,
  APP_INTERNAL_FUNCTIONS,
  createDefaultAppConfig,
  getSystemDefaultFontOption,
  SYSTEM_FONT_OPTION_VALUE,
} from '@/contracts/app_config';
import { normalizeAccelerator } from '@/shared/shortcuts';

const SHORTCUTS_SETTING_KEY = 'app.shortcuts';

export type AppConfigChangeListener = (config: AppConfig, patch?: AppConfigPatch) => void;

function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTheme(value: unknown): AppTheme {
  return value === 'dark' ? 'dark' : 'light';
}

function normalizeLanguage(value: unknown): AppAppearanceConfig['language'] {
  return value === 'en' ? 'en' : 'zh';
}

function normalizeFontFamily(value: unknown): string {
  if (typeof value !== 'string') {
    return SYSTEM_FONT_OPTION_VALUE;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : SYSTEM_FONT_OPTION_VALUE;
}

function normalizeBaseFontSize(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 16;
  }

  return Math.min(24, Math.max(12, Math.round(numeric)));
}

function normalizeBottomBar(value: unknown): AppBottomBarConfig {
  const defaults = createDefaultAppConfig().bottomBar;
  const rawIds = isRecord(value) && Array.isArray(value.defaultVisibleTabIds)
    ? value.defaultVisibleTabIds
    : defaults.defaultVisibleTabIds;
  const allowedIds = new Set<AppBottomBarTabId>(APP_INTERNAL_FUNCTIONS.map(item => item.id));
  const seen = new Set<AppBottomBarTabId>();
  const defaultVisibleTabIds: AppBottomBarTabId[] = [];

  for (const id of rawIds) {
    if (typeof id !== 'string' || !allowedIds.has(id as AppBottomBarTabId)) {
      continue;
    }

    const tabId = id as AppBottomBarTabId;
    if (!seen.has(tabId)) {
      seen.add(tabId);
      defaultVisibleTabIds.push(tabId);
    }
  }

  for (const tabId of APP_BOTTOM_BAR_REQUIRED_TAB_IDS) {
    if (!seen.has(tabId)) {
      defaultVisibleTabIds.push(tabId);
    }
  }

  return { defaultVisibleTabIds };
}

function normalizePluginItems(value: unknown): AppPluginsConfig['items'] {
  if (!isRecord(value)) {
    return {};
  }

  const nextItems: AppPluginsConfig['items'] = {};
  for (const [pluginId, pluginConfig] of Object.entries(value)) {
    nextItems[pluginId] = isRecord(pluginConfig) ? cloneConfig(pluginConfig) : {};
  }

  return nextItems;
}

function normalizeShortcutValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  if (!value.trim()) {
    return '';
  }

  const normalized = normalizeAccelerator(value);
  return normalized || fallback;
}

function normalizeShortcuts(value: unknown): AppShortcutsConfig {
  const defaults = createDefaultAppConfig().shortcuts;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const internal = isRecord(value.internal) ? value.internal : {};
  const system = isRecord(value.system) ? value.system : {};

  return {
    internal: {
      terminalCopy: normalizeShortcutValue(internal.terminalCopy, defaults.internal.terminalCopy),
      terminalPaste: normalizeShortcutValue(internal.terminalPaste, defaults.internal.terminalPaste),
    },
    system: {
      toggleAppVisibility: normalizeShortcutValue(system.toggleAppVisibility, defaults.system.toggleAppVisibility),
      toggleMultiDeviceClipboard: normalizeShortcutValue(
        system.toggleMultiDeviceClipboard,
        defaults.system.toggleMultiDeviceClipboard,
      ),
    },
  };
}

function normalizeFeatures(value: unknown): AppFeaturesConfig {
  const defaultConfig = createDefaultAppConfig().features;
  if (!isRecord(value)) {
    return cloneConfig(defaultConfig);
  }

  return {
    aiAgent: isRecord(value.aiAgent) ? cloneConfig(value.aiAgent) : cloneConfig(defaultConfig.aiAgent),
    terminal: normalizeTerminalFeature(value.terminal),
    multiDeviceClipboard: normalizeMultiDeviceClipboardFeature(value.multiDeviceClipboard),
  };
}

function normalizeMultiDeviceClipboardFeature(value: unknown): MultiDeviceClipboardFeatureConfig {
  const defaults = createDefaultAppConfig().features.multiDeviceClipboard;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const rawMaxSyncBytes = Number(value.maxSyncBytes);
  const maxSyncBytes = Number.isFinite(rawMaxSyncBytes)
    ? Math.max(1, Math.min(1024 * 1024 * 1024, Math.round(rawMaxSyncBytes)))
    : defaults.maxSyncBytes;
  const rawHistoryLimit = Number(value.historyLimit);
  const historyLimit = Number.isFinite(rawHistoryLimit)
    ? Math.max(1, Math.min(5000, Math.round(rawHistoryLimit)))
    : defaults.historyLimit;
  const deviceName = typeof value.deviceName === 'string' ? value.deviceName.trim() : defaults.deviceName;

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
    deviceName,
    maxSyncBytes,
    historyLimit,
    networkInterfacePriority: Array.isArray(value.networkInterfacePriority)
      ? value.networkInterfacePriority
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim())
      : [...defaults.networkInterfacePriority],
  };
}

function normalizeTerminalFeature(value: unknown): AppFeaturesConfig['terminal'] {
  const defaults = createDefaultAppConfig().features.terminal;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const rendererMode = value.rendererMode === 'standard' || value.rendererMode === 'webgl'
    ? value.rendererMode
    : defaults.rendererMode;
  const layoutMode = (
    value.layoutMode === 'split-horizontal'
    || value.layoutMode === 'split-vertical'
    || value.layoutMode === 'master-stack'
    || value.layoutMode === 'dwindle'
    || value.layoutMode === 'grid'
    || value.layoutMode === 'tabbed'
  )
    ? value.layoutMode
    : defaults.layoutMode;

  const defaultProfileId = typeof value.defaultProfileId === 'string' ? value.defaultProfileId : defaults.defaultProfileId;
  const defaultCwd = typeof value.defaultCwd === 'string' ? value.defaultCwd : defaults.defaultCwd;
  const enableBell = typeof value.enableBell === 'boolean' ? value.enableBell : defaults.enableBell;
  const enableSixel = typeof value.enableSixel === 'boolean' ? value.enableSixel : defaults.enableSixel;
  const detachToWindowByDefault = typeof value.detachToWindowByDefault === 'boolean'
    ? value.detachToWindowByDefault
    : defaults.detachToWindowByDefault;
  const sshReconnectMaxAttempts = Number.isFinite(Number(value.sshReconnectMaxAttempts))
    ? Math.max(1, Math.min(20, Math.round(Number(value.sshReconnectMaxAttempts))))
    : defaults.sshReconnectMaxAttempts;
  const colorSchemeId = typeof value.colorSchemeId === 'string' && value.colorSchemeId
    ? value.colorSchemeId
    : defaults.colorSchemeId;

  // Viewport background fields
  const viewportBgType = (value.viewportBgType === 'color' || value.viewportBgType === 'image' || value.viewportBgType === 'video')
    ? value.viewportBgType
    : defaults.viewportBgType;
  const viewportBgColor = typeof value.viewportBgColor === 'string' ? value.viewportBgColor : defaults.viewportBgColor;
  const viewportBgImage = typeof value.viewportBgImage === 'string' ? value.viewportBgImage : defaults.viewportBgImage;
  const viewportBgVideo = typeof value.viewportBgVideo === 'string' ? value.viewportBgVideo : defaults.viewportBgVideo;
  const viewportBgStyle = isRecord(value.viewportBgStyle) ? cloneConfig(value.viewportBgStyle) as Record<string, unknown> : cloneConfig(defaults.viewportBgStyle);

  const env = isRecord(value.env)
    ? Object.fromEntries(
      Object.entries(value.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
    : cloneConfig(defaults.env);
  const localProfiles = normalizeLocalTerminalProfiles(value.localProfiles);
  const sshProfileGroups = normalizeSshProfileGroups(value.sshProfileGroups);
  const sshProfileGroupMap = normalizeStringRecord(value.sshProfileGroupMap);

  return {
    defaultProfileId,
    defaultCwd,
    env,
    localProfiles,
    sshProfileGroups,
    sshProfileGroupMap,
    rendererMode,
    layoutMode,
    enableBell,
    enableSixel,
    detachToWindowByDefault,
    sshReconnectMaxAttempts,
    colorSchemeId,
    viewportBgType,
    viewportBgColor,
    viewportBgImage,
    viewportBgVideo,
    viewportBgStyle,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[0].trim().length > 0),
  );
}

function normalizeSshProfileGroups(value: unknown): TerminalSshProfileGroupConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const groups: TerminalSshProfileGroupConfig[] = [];
  const seenIds = new Set<string>();
  const now = Date.now();

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!id || !label || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    const parentId = typeof item.parentId === 'string' ? item.parentId.trim() : '';
    const sortOrder = Number.isFinite(Number(item.sortOrder))
      ? Math.max(0, Math.round(Number(item.sortOrder)))
      : groups.length;
    const createdAt = Number.isFinite(Number(item.createdAt))
      ? Math.max(0, Math.round(Number(item.createdAt)))
      : now + groups.length;
    groups.push({
      id,
      label,
      parentId: parentId || undefined,
      sortOrder,
      createdAt,
    });
  }

  const validIds = new Set(groups.map((group) => group.id));
  return groups
    .map((group) => (group.parentId && !validIds.has(group.parentId) ? { ...group, parentId: undefined } : group))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt || a.label.localeCompare(b.label));
}

function normalizeLocalTerminalProfiles(value: unknown): LocalTerminalProfileConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const profiles: LocalTerminalProfileConfig[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const rawId = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const command = typeof item.command === 'string' ? item.command.trim() : '';
    const id = rawId.startsWith('local:') ? rawId : `local:${rawId}`;
    if (!rawId || !label || !command || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    profiles.push({
      id,
      label,
      command,
      args: normalizeStringArray(item.args),
      cwd: typeof item.cwd === 'string' ? item.cwd.trim() : '',
      env: normalizeStringRecord(item.env),
      configFilePath: typeof item.configFilePath === 'string' ? item.configFilePath.trim() : '',
      background: normalizeTerminalBackground(item.background),
    });
  }

  return profiles;
}

function normalizeTerminalBackground(value: unknown): TerminalBackgroundConfig {
  if (!isRecord(value)) {
    return {
      type: 'color',
      color: '',
      image: '',
      video: '',
      style: {},
    };
  }

  const type = value.type === 'image' || value.type === 'video' ? value.type : 'color';
  const style = isRecord(value.style) ? cloneConfig(value.style) as Record<string, unknown> : {};
  return {
    type,
    color: typeof value.color === 'string' ? value.color : '',
    image: typeof value.image === 'string' ? value.image : '',
    video: typeof value.video === 'string' ? value.video : '',
    style,
  };
}

function normalizeAppearance(value: unknown): AppAppearanceConfig {
  const defaults = createDefaultAppConfig().appearance;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  return {
    theme: normalizeTheme(value.theme),
    language: normalizeLanguage(value.language),
    fontFamily: normalizeFontFamily(value.fontFamily),
    baseFontSize: normalizeBaseFontSize(value.baseFontSize),
  };
}

function normalizePlugins(value: unknown): AppPluginsConfig {
  const defaults = createDefaultAppConfig().plugins;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const unloadAfterMinutes = Number.isFinite(Number(value.unloadAfterMinutes))
    ? Math.max(0, Math.round(Number(value.unloadAfterMinutes)))
    : defaults.unloadAfterMinutes;

  return {
    unloadAfterMinutes,
    items: normalizePluginItems(value.items),
  };
}

function normalizeTools(value: unknown): AppToolsConfig {
  const defaults = createDefaultAppConfig().tools;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  return {
    ffmpegPath: typeof value.ffmpegPath === 'string' ? value.ffmpegPath : defaults.ffmpegPath,
  };
}

function normalizeWebScriptRule(value: unknown): WebScriptRule | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const name = typeof value.name === 'string' ? value.name : '';
  const domainPattern = typeof value.domainPattern === 'string' ? value.domainPattern : '';
  const type = (value.type === 'js' || value.type === 'css' || value.type === 'html') ? value.type : 'js';
  const content = typeof value.content === 'string' ? value.content : '';
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : true;
  const builtin = typeof value.builtin === 'boolean' ? value.builtin : false;
  if (!id || !name || !domainPattern) return null;
  return { id, name, domainPattern, type, content, enabled, builtin };
}

function normalizeChromeExtension(value: unknown): ChromeExtensionRecord | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  const name = typeof value.name === 'string' ? value.name : '';
  const version = typeof value.version === 'string' ? value.version : '0.0.0';
  const description = typeof value.description === 'string' ? value.description : '';
  const extPath = typeof value.path === 'string' ? value.path : '';
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : true;
  const installedAt = typeof value.installedAt === 'number' ? value.installedAt : Date.now();
  if (!id || !extPath) return null;
  return { id, name, version, description, path: extPath, enabled, installedAt };
}

function normalizeWeb(value: unknown): AppWebConfig {
  const defaults = createDefaultAppConfig().web;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const security = isRecord(value.security) ? {
    whitelist: Array.isArray((value.security as any).whitelist)
      ? (value.security as any).whitelist.filter((s: unknown) => typeof s === 'string')
      : [],
    blacklist: Array.isArray((value.security as any).blacklist)
      ? (value.security as any).blacklist.filter((s: unknown) => typeof s === 'string')
      : [],
  } : cloneConfig(defaults.security);

  const scripts: WebScriptRule[] = [];
  if (Array.isArray(value.scripts)) {
    for (const item of value.scripts) {
      const rule = normalizeWebScriptRule(item);
      if (rule) scripts.push(rule);
    }
  }

  const keepAliveDomains: string[] = Array.isArray(value.keepAliveDomains)
    ? (value.keepAliveDomains as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const chromeExtensions: ChromeExtensionRecord[] = [];
  if (Array.isArray(value.chromeExtensions)) {
    for (const item of value.chromeExtensions) {
      const ext = normalizeChromeExtension(item);
      if (ext) chromeExtensions.push(ext);
    }
  }

  return { security, scripts, keepAliveDomains, chromeExtensions };
}

function normalizeAppConfig(value: unknown): AppConfig {
  const defaults = createDefaultAppConfig();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    version: defaults.version,
    appearance: normalizeAppearance(value.appearance),
    bottomBar: normalizeBottomBar(value.bottomBar),
    features: normalizeFeatures(value.features),
    shortcuts: normalizeShortcuts(value.shortcuts),
    plugins: normalizePlugins(value.plugins),
    tools: normalizeTools(value.tools),
    web: normalizeWeb(value.web),
  };
}

function mergeConfig(current: AppConfig, patch: AppConfigPatch): AppConfig {
  const next: AppConfig = {
    version: current.version,
    appearance: {
      ...current.appearance,
      ...(patch.appearance ?? {}),
    },
    bottomBar: normalizeBottomBar({
      ...current.bottomBar,
      ...(patch.bottomBar ?? {}),
    }),
    features: {
      aiAgent: patch.features?.aiAgent ? cloneConfig(patch.features.aiAgent) : cloneConfig(current.features.aiAgent),
      terminal: normalizeTerminalFeature({
        ...current.features.terminal,
        ...(patch.features?.terminal ?? {}),
      }),
      multiDeviceClipboard: normalizeMultiDeviceClipboardFeature({
        ...current.features.multiDeviceClipboard,
        ...(patch.features?.multiDeviceClipboard ?? {}),
      }),
    },
    shortcuts: normalizeShortcuts({
      ...current.shortcuts,
      internal: {
        ...current.shortcuts.internal,
        ...(patch.shortcuts?.internal ?? {}),
      },
      system: {
        ...current.shortcuts.system,
        ...(patch.shortcuts?.system ?? {}),
      },
    }),
    plugins: {
      unloadAfterMinutes: patch.plugins?.unloadAfterMinutes ?? current.plugins.unloadAfterMinutes,
      items: cloneConfig(current.plugins.items),
    },
    tools: {
      ...current.tools,
      ...(patch.tools ?? {}),
    },
    web: patch.web ? {
      security: patch.web.security ?? cloneConfig(current.web.security),
      scripts: patch.web.scripts ?? cloneConfig(current.web.scripts),
      keepAliveDomains: patch.web.keepAliveDomains ?? cloneConfig(current.web.keepAliveDomains),
      chromeExtensions: patch.web.chromeExtensions ?? cloneConfig(current.web.chromeExtensions),
    } : cloneConfig(current.web),
  };

  if (patch.plugins?.items) {
    for (const [pluginId, pluginConfig] of Object.entries(patch.plugins.items)) {
      next.plugins.items[pluginId] = isRecord(pluginConfig) ? cloneConfig(pluginConfig) : {};
    }
  }

  return normalizeAppConfig(next);
}

export class AppConfigManager {
  private config: AppConfig = createDefaultAppConfig();
  private initialized = false;
  private readonly listeners = new Set<AppConfigChangeListener>();

  async initialize() {
    if (this.initialized) {
      return;
    }

    await fs.ensureDir(path.dirname(APP_CONFIG_FILE));
    const diskConfig = await this.readConfigFromDisk();
    const { shortcuts, shouldPersist } = await this.readShortcutConfigFromDb();
    this.config = normalizeAppConfig({
      ...diskConfig,
      shortcuts,
    });
    if (shouldPersist) {
      await this.writeShortcutConfigToDb(this.config.shortcuts);
    }
    this.initialized = true;
  }

  getCachedConfig(): AppConfig {
    return cloneConfig(this.config);
  }

  async getConfig(): Promise<AppConfig> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.getCachedConfig();
  }

  async updateConfig(patch: AppConfigPatch): Promise<AppConfig> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.config = mergeConfig(this.config, patch);
    await this.persist(patch);
    this.emitChange(patch);
    return this.getCachedConfig();
  }

  subscribe(listener: AppConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listLocalFonts(webContents?: WebContents): Promise<LocalFontOption[]> {
    const fallback = [getSystemDefaultFontOption()];
    if (!webContents || webContents.isDestroyed()) {
      return fallback;
    }

    try {
      const payload = await webContents.executeJavaScript(`
        (async () => {
          if (typeof window.queryLocalFonts !== 'function') {
            return [];
          }

          try {
            const fonts = await window.queryLocalFonts();
            const familyNames = Array.from(new Set(
              fonts
                .map((font) => typeof font.family === 'string' ? font.family.trim() : '')
                .filter(Boolean)
            )).sort((a, b) => a.localeCompare(b));

            return familyNames.map((family) => ({
              label: family,
              value: family,
            }));
          } catch {
            return [];
          }
        })();
      `, true);

      if (!Array.isArray(payload) || payload.length === 0) {
        return fallback;
      }

      return [getSystemDefaultFontOption(), ...payload];
    } catch {
      return fallback;
    }
  }

  private async readConfigFromDisk(): Promise<AppConfig> {
    if (!await fs.pathExists(APP_CONFIG_FILE)) {
      const defaults = createDefaultAppConfig();
      await fs.writeJSON(APP_CONFIG_FILE, this.serializeConfigForDisk(defaults), { spaces: 2 });
      return defaults;
    }

    try {
      const payload = await fs.readJSON(APP_CONFIG_FILE);
      const normalized = normalizeAppConfig(payload);
      await fs.writeJSON(APP_CONFIG_FILE, this.serializeConfigForDisk(normalized), { spaces: 2 });
      return normalized;
    } catch (error) {
      const backupPath = `${APP_CONFIG_FILE}.broken-${Date.now()}.json`;
      try {
        await fs.copy(APP_CONFIG_FILE, backupPath, { overwrite: true });
      } catch {
        // ignore backup errors and continue restoring defaults
      }

      const defaults = createDefaultAppConfig();
      await fs.writeJSON(APP_CONFIG_FILE, this.serializeConfigForDisk(defaults), { spaces: 2 });
      console.error('Failed to parse app config. Restored defaults.', error);
      return defaults;
    }
  }

  private async persist(patch?: AppConfigPatch) {
    const tasks: Array<Promise<unknown>> = [
      fs.writeJSON(APP_CONFIG_FILE, this.serializeConfigForDisk(this.config), { spaces: 2 }),
    ];

    if (patch?.shortcuts) {
      tasks.push(this.writeShortcutConfigToDb(this.config.shortcuts));
    }

    await Promise.all(tasks);
  }

  private serializeConfigForDisk(config: AppConfig) {
    const payload = cloneConfig(config) as AppConfig & { shortcuts?: AppShortcutsConfig };
    delete payload.shortcuts;
    return payload;
  }

  private async readShortcutConfigFromDb(): Promise<{ shortcuts: AppShortcutsConfig; shouldPersist: boolean }> {
    const defaults = createDefaultAppConfig().shortcuts;
    if (!dbManager.isInitialized()) {
      return { shortcuts: cloneConfig(defaults), shouldPersist: false };
    }

    try {
      const payload = await dbManager.getDatabase().getSettingValue(SHORTCUTS_SETTING_KEY);
      return {
        shortcuts: normalizeShortcuts(JSON.parse(payload)),
        shouldPersist: false,
      };
    } catch {
      return {
        shortcuts: cloneConfig(defaults),
        shouldPersist: true,
      };
    }
  }

  private async writeShortcutConfigToDb(shortcuts: AppShortcutsConfig) {
    if (!dbManager.isInitialized()) {
      return;
    }

    await dbManager.getDatabase().upsertSetting(
      SHORTCUTS_SETTING_KEY,
      JSON.stringify(shortcuts),
      'Application shortcut settings',
    );
  }

  private emitChange(patch?: AppConfigPatch) {
    const snapshot = this.getCachedConfig();
    for (const listener of this.listeners) {
      try {
        listener(snapshot, patch);
      } catch (error) {
        console.error('AppConfig listener failed:', error);
      }
    }
  }
}

export const appConfigManager = new AppConfigManager();
