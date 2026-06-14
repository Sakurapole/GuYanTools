import type { AppWebConfig } from './webview';
import type { TerminalFeatureConfig } from './terminal';
import type { BackgroundStyleConfig } from './background';
import type { AiAgentFeatureConfig } from './ai';
import type { QuickLaunchFeatureConfig, QuickLaunchProviderId } from './quick_launch';

export type AppTheme = 'light' | 'dark';
export type AppLanguage = 'zh' | 'en';
export type AppSettingsTabId =
  | 'general'
  | 'file-transfer'
  | 'web-security'
  | 'ai-agent'
  | 'plugins'
  | 'terminal'
  | 'multi-device-clipboard'
  | 'knowledge'
  | 'quick-launch'
  | 'shortcuts';
export type AppBottomBarTabId =
  | 'home'
  | 'terminal'
  | 'settings'
  | 'ftp'
  | 'plugins'
  | 'todo'
  | 'knowledge'
  | 'ai'
  | 'script-editor'
  | 'devtools';

export const APP_CONFIG_VERSION = 1;
export const SYSTEM_FONT_OPTION_VALUE = 'system-default';
export const SYSTEM_FONT_STACK = "'Geist Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const APP_BOTTOM_BAR_REQUIRED_TAB_IDS: AppBottomBarTabId[] = ['home', 'settings'];
export const APP_BOTTOM_BAR_DEFAULT_VISIBLE_TAB_IDS: AppBottomBarTabId[] = ['home', 'terminal', 'settings', 'ftp', 'knowledge', 'devtools'];

export interface AppInternalFunctionDefinition {
  id: AppBottomBarTabId;
  label: string;
  route: string;
  icon: string;
  description: string;
  devOnly?: boolean;
}

export const APP_INTERNAL_FUNCTIONS: AppInternalFunctionDefinition[] = [
  {
    id: 'home',
    label: '首页',
    route: '/home',
    icon: 'home',
    description: '工具组件、快捷入口和工作区。',
  },
  {
    id: 'terminal',
    label: '终端',
    route: '/terminal',
    icon: 'terminal',
    description: '本地终端、SSH 会话和端口转发。',
  },
  {
    id: 'settings',
    label: '设置',
    route: '/settings',
    icon: 'settings',
    description: '应用基础配置、插件、终端与快捷键。',
  },
  {
    id: 'ftp',
    label: '传输',
    route: '/ftp',
    icon: 'ftp',
    description: 'FTP/SFTP 文件浏览、同步与传输队列。',
  },
  {
    id: 'plugins',
    label: '插件',
    route: '/plugins',
    icon: 'plugins',
    description: '插件安装、启停和运行状态。',
  },
  {
    id: 'todo',
    label: '待办',
    route: '/todo',
    icon: 'todo',
    description: '任务列表、详情和日程整理。',
  },
  {
    id: 'knowledge',
    label: '知识库',
    route: '/knowledge',
    icon: 'knowledge',
    description: '本地资料、笔记、附件和检索入口。',
  },
  {
    id: 'ai',
    label: 'AI',
    route: '/ai',
    icon: 'ai',
    description: 'AI 问答、模型配置和后续 Agent 入口。',
  },
  {
    id: 'script-editor',
    label: '脚本编辑器',
    route: '/script-editor',
    icon: 'script',
    description: '管理 WebView 注入脚本。',
  },
  {
    id: 'devtools',
    label: '调试',
    route: '/devtools',
    icon: 'devtools',
    description: '开发环境调试工具。',
    devOnly: true,
  },
];

export interface AppAppearanceConfig {
  theme: AppTheme;
  language: AppLanguage;
  fontFamily: string;
  baseFontSize: number;
}

export interface AppInternalShortcutsConfig {
  terminalCopy: string;
  terminalPaste: string;
  quickNoteSave: string;
  quickNoteNew: string;
  quickNoteCollapse: string;
  quickNoteClose: string;
}

export interface AppSystemShortcutsConfig {
  toggleAppVisibility: string;
  toggleMultiDeviceClipboard: string;
  toggleQuickNote: string;
  captureClipboardToQuickNote: string;
  toggleQuickLaunch: string;
  openDetachedTerminal: string;
  openDetachedFtp: string;
  openDetachedTodo: string;
  openDetachedAi: string;
  openDetachedKnowledge: string;
}

export interface AppShortcutsConfig {
  internal: AppInternalShortcutsConfig;
  system: AppSystemShortcutsConfig;
}

export interface AppFeaturesConfig {
  aiAgent: AiAgentFeatureConfig;
  settings: AppSettingsFeatureConfig;
  terminal: TerminalFeatureConfig;
  multiDeviceClipboard: MultiDeviceClipboardFeatureConfig;
  knowledge: AppKnowledgeFeatureConfig;
  quickLaunch: QuickLaunchFeatureConfig;
}

export interface AppSettingsTabPersonalizationConfig {
  type: 'color' | 'image' | 'video';
  color: string;
  image: string;
  video: string;
  style: BackgroundStyleConfig;
}

export interface AppSettingsFeatureConfig {
  tabs: Record<AppSettingsTabId, AppSettingsTabPersonalizationConfig>;
}

export interface MultiDeviceClipboardFeatureConfig {
  enabled: boolean;
  deviceName: string;
  maxSyncBytes: number;
  historyLimit: number;
  networkInterfacePriority: string[];
}

export type AppKnowledgeAssetStorageMode = 'app-data' | 'custom';

export interface AppKnowledgeFeatureConfig {
  defaultLibraryId: string;
  assetStorageMode: AppKnowledgeAssetStorageMode;
  customAssetDirectory: string;
  libreOfficePath: string;
  indexingEnabled: boolean;
  maxImportFileSizeMb: number;
  previewCacheTtlDays: number;
  quickNote: AppKnowledgeQuickNoteWindowConfig;
}

export interface AppKnowledgeQuickNoteWindowConfig {
  backgroundType: 'color' | 'image' | 'video';
  backgroundColor: string;
  backgroundImage: string;
  backgroundVideo: string;
  backgroundStyle: BackgroundStyleConfig;
}

export interface LocalNetworkInterfaceOption {
  key: string;
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
  mac?: string;
  cidr?: string;
}

export interface AppPluginsConfig {
  unloadAfterMinutes: number;
  items: Record<string, Record<string, unknown>>;
}

export interface AppToolsConfig {
  ffmpegPath: string;
}

export interface AppBottomBarConfig {
  defaultVisibleTabIds: AppBottomBarTabId[];
}

export interface AppConfig {
  version: number;
  appearance: AppAppearanceConfig;
  bottomBar: AppBottomBarConfig;
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
  bottomBar?: Partial<AppBottomBarConfig>;
  features?: {
    aiAgent?: Partial<AiAgentFeatureConfig>;
    settings?: {
      tabs?: Partial<Record<AppSettingsTabId, Partial<AppSettingsTabPersonalizationConfig>>>;
    };
    terminal?: Partial<TerminalFeatureConfig>;
    multiDeviceClipboard?: Partial<MultiDeviceClipboardFeatureConfig>;
    knowledge?: Partial<Omit<AppKnowledgeFeatureConfig, 'quickNote'>> & {
      quickNote?: Partial<AppKnowledgeQuickNoteWindowConfig>;
    };
    quickLaunch?: Partial<Omit<QuickLaunchFeatureConfig, 'enabledProviders'>> & {
      enabledProviders?: QuickLaunchProviderId[];
    };
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
  listNetworkInterfaces: () => Promise<LocalNetworkInterfaceOption[]>;
  onDidChange: (listener: (config: AppConfig) => void) => () => void;
}

export function createDefaultAiAgentFeatureConfig(): AiAgentFeatureConfig {
  const timestamp = Date.now();
  return {
    enabled: false,
    defaultMode: 'chat',
    defaultAssistantId: 'default-assistant',
    assistants: [
      {
        id: 'default-assistant',
        name: '默认助手',
        emoji: '😀',
        systemPrompt: '',
        knowledgeMode: 'force',
        mcpMode: 'disabled',
        commonPhrases: [],
        memoryEnabled: false,
        temperatureEnabled: false,
        temperature: 0.7,
        topPEnabled: false,
        topP: 1,
        contextMessages: 5,
        maxOutputTokensEnabled: false,
        streaming: true,
        toolCallMode: 'function',
        maxToolCallsEnabled: true,
        maxToolCalls: 20,
        customParameters: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    providers: [],
    chat: {
      defaultSystemPrompt: '',
      maxHistoryMessages: 20,
      temperature: 0.7,
      reasoningEnabled: false,
      reasoningEffort: 'medium',
    },
    agent: {
      enabled: false,
      defaultAgentMode: 'general-agent',
      maxSteps: 5,
      requireApprovalForWriteTools: true,
      codex: {
        enabled: false,
        lastWorkingDirectory: '',
        skipGitRepoCheck: false,
        cliConfigJson: '',
      },
      general: {
        enabled: false,
        defaultAgentId: undefined,
        agents: [],
      },
    },
    research: {
      enabled: false,
      maxSearchQueries: 8,
      maxSources: 20,
      allowedDomains: [],
      blockedDomains: [],
    },
    mcp: {
      enabled: false,
      servers: [],
    },
  };
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
    bottomBar: {
      defaultVisibleTabIds: [...APP_BOTTOM_BAR_DEFAULT_VISIBLE_TAB_IDS],
    },
    features: {
      aiAgent: createDefaultAiAgentFeatureConfig(),
      settings: {
        tabs: {
          general: createDefaultSettingsTabPersonalization(),
          'file-transfer': createDefaultSettingsTabPersonalization(),
          'web-security': createDefaultSettingsTabPersonalization(),
          'ai-agent': createDefaultSettingsTabPersonalization(),
          plugins: createDefaultSettingsTabPersonalization(),
          terminal: createDefaultSettingsTabPersonalization(),
          'multi-device-clipboard': createDefaultSettingsTabPersonalization(),
          knowledge: createDefaultSettingsTabPersonalization(),
          'quick-launch': createDefaultSettingsTabPersonalization(),
          shortcuts: createDefaultSettingsTabPersonalization(),
        },
      },
      terminal: {
        defaultProfileId: '',
        defaultCwd: '',
        env: {},
        localProfiles: [],
        sshProfileGroups: [],
        sshProfileGroupMap: {},
        rendererMode: 'auto',
        layoutMode: 'tabbed',
        enableBell: false,
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
      multiDeviceClipboard: {
        enabled: true,
        deviceName: '',
        maxSyncBytes: 100 * 1024 * 1024,
        historyLimit: 200,
        networkInterfacePriority: [],
      },
      knowledge: {
        defaultLibraryId: '',
        assetStorageMode: 'app-data',
        customAssetDirectory: '',
        libreOfficePath: '',
        indexingEnabled: true,
        maxImportFileSizeMb: 200,
        previewCacheTtlDays: 30,
        quickNote: createDefaultKnowledgeQuickNoteWindowConfig(),
      },
      quickLaunch: {
        enabled: true,
        maxResults: 12,
        enabledProviders: ['internal-route', 'terminal', 'ssh', 'ftp', 'todo', 'knowledge', 'plugin', 'app', 'file'],
        hideOnBlur: true,
        everythingEsPath: '',
        backgroundType: 'color',
        backgroundColor: '',
        backgroundImage: '',
        backgroundVideo: '',
        backgroundStyle: {
          opacity: 1,
        },
        windowOpacity: 0.96,
        selectionColor: '#3b82f6',
        selectionOpacity: 0.14,
        resultTitleColor: '#17202b',
        resultSubtitleColor: '#667385',
      },
    },
    shortcuts: {
      internal: {
        terminalCopy: 'CommandOrControl+Shift+C',
        terminalPaste: 'CommandOrControl+Shift+V',
        quickNoteSave: 'CommandOrControl+S',
        quickNoteNew: 'CommandOrControl+N',
        quickNoteCollapse: 'CommandOrControl+M',
        quickNoteClose: 'Escape',
      },
      system: {
        toggleAppVisibility: 'CommandOrControl+Alt+G',
        toggleMultiDeviceClipboard: 'Alt+V',
        toggleQuickNote: 'CommandOrControl+Alt+N',
        captureClipboardToQuickNote: 'CommandOrControl+Alt+Shift+N',
        toggleQuickLaunch: 'Alt+Space',
        openDetachedTerminal: '',
        openDetachedFtp: '',
        openDetachedTodo: '',
        openDetachedAi: '',
        openDetachedKnowledge: '',
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

export function createDefaultKnowledgeQuickNoteWindowConfig(): AppKnowledgeQuickNoteWindowConfig {
  return {
    backgroundType: 'color',
    backgroundColor: '',
    backgroundImage: '',
    backgroundVideo: '',
    backgroundStyle: {
      opacity: 1,
    },
  };
}

export function createDefaultSettingsTabPersonalization(): AppSettingsTabPersonalizationConfig {
  return {
    type: 'color',
    color: '',
    image: '',
    video: '',
    style: {},
  };
}

export function getSystemDefaultFontOption(): LocalFontOption {
  return {
    label: '系统默认',
    value: SYSTEM_FONT_OPTION_VALUE,
  };
}
