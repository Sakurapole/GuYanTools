import type { AppWebConfig } from './webview';
import type { TerminalFeatureConfig } from './terminal';

export type AppTheme = 'light' | 'dark';
export type AppLanguage = 'zh' | 'en';

export const APP_CONFIG_VERSION = 1;
export const SYSTEM_FONT_OPTION_VALUE = 'system-default';
export const SYSTEM_FONT_STACK = "'Geist Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";

export interface AppAppearanceConfig {
  theme: AppTheme;
  language: AppLanguage;
  fontFamily: string;
  baseFontSize: number;
}

export interface AppInternalShortcutsConfig {
  terminalCopy: string;
  terminalPaste: string;
}

export interface AppSystemShortcutsConfig {
  toggleAppVisibility: string;
}

export interface AppShortcutsConfig {
  internal: AppInternalShortcutsConfig;
  system: AppSystemShortcutsConfig;
}

export interface AppFeaturesConfig {
  aiAgent: Record<string, unknown>;
  terminal: TerminalFeatureConfig;
}

export interface AppPluginsConfig {
  unloadAfterMinutes: number;
  items: Record<string, Record<string, unknown>>;
}

export interface AppToolsConfig {
  ffmpegPath: string;
}

export interface AppConfig {
  version: number;
  appearance: AppAppearanceConfig;
  features: AppFeaturesConfig;
  shortcuts: AppShortcutsConfig;
  plugins: AppPluginsConfig;
  tools: AppToolsConfig;
  web: AppWebConfig;
}

export interface LocalFontOption {
  label: string;
  value: string;
}

export interface AppConfigPatch {
  appearance?: Partial<AppAppearanceConfig>;
  features?: {
    aiAgent?: Record<string, unknown>;
    terminal?: Partial<TerminalFeatureConfig>;
  };
  shortcuts?: {
    internal?: Partial<AppInternalShortcutsConfig>;
    system?: Partial<AppSystemShortcutsConfig>;
  };
  plugins?: {
    unloadAfterMinutes?: number;
    items?: Record<string, Record<string, unknown>>;
  };
  tools?: Partial<AppToolsConfig>;
  web?: Partial<AppWebConfig>;
}

export interface AppConfigApi {
  getConfig: () => Promise<AppConfig>;
  updateConfig: (patch: AppConfigPatch) => Promise<AppConfig>;
  listLocalFonts: () => Promise<LocalFontOption[]>;
}

export function createDefaultAppConfig(): AppConfig {
  return {
    version: APP_CONFIG_VERSION,
    appearance: {
      theme: 'light',
      language: 'zh',
      fontFamily: SYSTEM_FONT_OPTION_VALUE,
      baseFontSize: 16,
    },
    features: {
      aiAgent: {},
      terminal: {
        defaultProfileId: '',
        defaultCwd: '',
        env: {},
        localProfiles: [],
        rendererMode: 'auto',
        enableSixel: true,
        detachToWindowByDefault: false,
        sshReconnectMaxAttempts: 3,
        colorSchemeId: 'dark-default',
        viewportBgType: 'color',
        viewportBgColor: '',
        viewportBgImage: '',
        viewportBgVideo: '',
        viewportBgStyle: {},
      },
    },
    shortcuts: {
      internal: {
        terminalCopy: 'CommandOrControl+Shift+C',
        terminalPaste: 'CommandOrControl+Shift+V',
      },
      system: {
        toggleAppVisibility: 'CommandOrControl+Alt+G',
      },
    },
    plugins: {
      unloadAfterMinutes: 0,
      items: {},
    },
    tools: {
      ffmpegPath: '',
    },
    web: {
      security: {
        whitelist: [],
        blacklist: [],
      },
      scripts: [],
      keepAliveDomains: [],
      chromeExtensions: [],
    },
  };
}

export function getSystemDefaultFontOption(): LocalFontOption {
  return {
    label: '系统默认',
    value: SYSTEM_FONT_OPTION_VALUE,
  };
}
