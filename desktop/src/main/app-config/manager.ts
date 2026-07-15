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
  AppKnowledgeFeatureConfig,
  AppKnowledgeQuickNoteWindowConfig,
  AppPluginsConfig,
  AppSettingsFeatureConfig,
  AppSettingsTabId,
  AppSettingsTabPersonalizationConfig,
  AppShortcutsConfig,
  AppTheme,
  AppToolsConfig,
  LocalFontOption,
  MultiDeviceClipboardFeatureConfig,
} from '@/contracts/app_config';
import type { QuickLaunchFeatureConfig, QuickLaunchProviderId } from '@/contracts/quick_launch';
import type {
  AiAgentFeatureConfig,
  AiAgentMode,
  AiAssistantConfig,
  AiAssistantKnowledgeMode,
  AiAssistantMcpMode,
  AiAssistantToolCallMode,
  AiGeneralAgentTemplate,
  AiMcpEnvironmentVariable,
  AiMcpServerConfig,
  AiMcpTransport,
  AiModelConfig,
  AiProviderConfig,
  AiProviderKind,
  AiReasoningEffort,
} from '@/contracts/ai';
import type { LocalTerminalProfileConfig, TerminalBackgroundConfig, TerminalSshProfileGroupConfig } from '@/contracts/terminal';
import type { AppWebConfig, ChromeExtensionRecord, WebScriptRule } from '@/contracts/webview';
import {
  APP_BOTTOM_BAR_REQUIRED_TAB_IDS,
  APP_INTERNAL_FUNCTIONS,
  createDefaultAiAgentFeatureConfig,
  createDefaultAppConfig,
  createDefaultKnowledgeQuickNoteWindowConfig,
  createDefaultSettingsTabPersonalization,
  getSystemDefaultFontOption,
  SYSTEM_FONT_OPTION_VALUE,
} from '@/contracts/app_config';
import { normalizeAccelerator } from '@/shared/shortcuts';

const SHORTCUTS_SETTING_KEY = 'app.shortcuts';
const QUICK_LAUNCH_PROVIDER_IDS: QuickLaunchProviderId[] = [
  'internal-route',
  'terminal',
  'ssh',
  'ftp',
  'todo',
  'knowledge',
  'plugin',
  'app',
  'file',
];
const LEGACY_QUICK_LAUNCH_DEFAULT_PROVIDER_IDS: QuickLaunchProviderId[] = [
  'internal-route',
  'terminal',
  'ssh',
  'ftp',
  'todo',
  'knowledge',
  'plugin',
];
const SETTINGS_TAB_IDS: AppSettingsTabId[] = [
  'general',
  'file-transfer',
  'web-security',
  'ai-agent',
  'plugins',
  'terminal',
  'multi-device-clipboard',
  'sync-center',
  'knowledge',
  'quick-launch',
  'shortcuts',
];

export type AppConfigChangeListener = (config: AppConfig, patch?: AppConfigPatch) => void;

function cloneConfig<T>(value: T): T {
  if (value === undefined) {
    return undefined as T;
  }

  // 使用 structuredClone 替代 JSON.parse(JSON.stringify())，
  // 避免 base64 等大字符串在 JSON round-trip 时产生中间字符串导致 V8 堆内存溢出
  return structuredClone(value);
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

  return {
    defaultVisibleTabIds,
    tabDisplay: normalizeBottomBarTabDisplay(value),
    pinnedWebviews: normalizeBottomBarPinnedWebviews(value),
    collections: normalizeBottomBarCollections(value),
  };
}

function normalizeBottomBarTabDisplay(value: unknown): AppBottomBarConfig['tabDisplay'] {
  if (!isRecord(value) || !isRecord(value.tabDisplay)) {
    return {};
  }

  const allowedIds = new Set<AppBottomBarTabId>(APP_INTERNAL_FUNCTIONS.map(item => item.id));
  const result: AppBottomBarConfig['tabDisplay'] = {};
  for (const [id, config] of Object.entries(value.tabDisplay)) {
    if (!allowedIds.has(id as AppBottomBarTabId) || !isRecord(config)) {
      continue;
    }

    result[id as AppBottomBarTabId] = {
      iconOnly: config.iconOnly === true,
      collectionId: typeof config.collectionId === 'string' ? config.collectionId.trim() : '',
    };
  }

  return result;
}

function normalizeBottomBarPinnedWebviews(value: unknown): AppBottomBarConfig['pinnedWebviews'] {
  if (!isRecord(value) || !Array.isArray(value.pinnedWebviews)) {
    return [];
  }

  const result: AppBottomBarConfig['pinnedWebviews'] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const item of value.pinnedWebviews) {
    if (!isRecord(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!id || !url || seenIds.has(id) || seenUrls.has(url)) {
      continue;
    }

    seenIds.add(id);
    seenUrls.add(url);
    result.push({
      id,
      title: title || url,
      url,
      faviconUrl: typeof item.faviconUrl === 'string' ? item.faviconUrl.trim() : '',
      iconOnly: item.iconOnly === true,
      collectionId: typeof item.collectionId === 'string' ? item.collectionId.trim() : '',
    });
  }

  return result;
}

function normalizeBottomBarCollections(value: unknown): AppBottomBarConfig['collections'] {
  if (!isRecord(value) || !Array.isArray(value.collections)) {
    return [];
  }

  const result: AppBottomBarConfig['collections'] = [];
  const seenIds = new Set<string>();
  for (const item of value.collections) {
    if (!isRecord(item)) {
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!id || seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    result.push({
      id,
      name: name || '集合',
      icon: typeof item.icon === 'string' ? item.icon.trim() : '',
    });
  }

  return result;
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
      quickNoteSave: normalizeShortcutValue(internal.quickNoteSave, defaults.internal.quickNoteSave),
      quickNoteNew: normalizeShortcutValue(internal.quickNoteNew, defaults.internal.quickNoteNew),
      quickNoteCollapse: normalizeShortcutValue(internal.quickNoteCollapse, defaults.internal.quickNoteCollapse),
      quickNoteClose: normalizeShortcutValue(internal.quickNoteClose, defaults.internal.quickNoteClose),
    },
    system: {
      toggleAppVisibility: normalizeShortcutValue(system.toggleAppVisibility, defaults.system.toggleAppVisibility),
      toggleMultiDeviceClipboard: normalizeShortcutValue(
        system.toggleMultiDeviceClipboard,
        defaults.system.toggleMultiDeviceClipboard,
      ),
      toggleQuickNote: normalizeShortcutValue(system.toggleQuickNote, defaults.system.toggleQuickNote),
      captureClipboardToQuickNote: normalizeShortcutValue(
        system.captureClipboardToQuickNote,
        defaults.system.captureClipboardToQuickNote,
      ),
      captureScreenshotRegion: normalizeShortcutValue(
        system.captureScreenshotRegion,
        defaults.system.captureScreenshotRegion,
      ),
      captureScreenshotAnnotate: normalizeShortcutValue(
        system.captureScreenshotAnnotate,
        defaults.system.captureScreenshotAnnotate,
      ),
      toggleQuickLaunch: normalizeShortcutValue(system.toggleQuickLaunch, defaults.system.toggleQuickLaunch),
      openDetachedTerminal: normalizeShortcutValue(system.openDetachedTerminal, defaults.system.openDetachedTerminal),
      openDetachedFtp: normalizeShortcutValue(system.openDetachedFtp, defaults.system.openDetachedFtp),
      openDetachedTodo: normalizeShortcutValue(system.openDetachedTodo, defaults.system.openDetachedTodo),
      openDetachedAi: normalizeShortcutValue(system.openDetachedAi, defaults.system.openDetachedAi),
      openDetachedKnowledge: normalizeShortcutValue(system.openDetachedKnowledge, defaults.system.openDetachedKnowledge),
    },
  };
}

function normalizeFeatures(value: unknown): AppFeaturesConfig {
  const defaultConfig = createDefaultAppConfig().features;
  if (!isRecord(value)) {
    return cloneConfig(defaultConfig);
  }

  return {
    aiAgent: normalizeAiAgentFeature(value.aiAgent),
    settings: normalizeSettingsFeature(value.settings),
    terminal: normalizeTerminalFeature(value.terminal),
    multiDeviceClipboard: normalizeMultiDeviceClipboardFeature(value.multiDeviceClipboard),
    knowledge: normalizeKnowledgeFeature(value.knowledge),
    quickLaunch: normalizeQuickLaunchFeature(value.quickLaunch),
  };
}

function normalizeAiProviderKind(value: unknown): AiProviderKind {
  if (
    value === 'openai'
    || value === 'anthropic'
    || value === 'google'
    || value === 'openai-compatible'
    || value === 'ollama'
    || value === 'vercel-gateway'
  ) {
    return value;
  }

  return 'openai-compatible';
}

function normalizeAiNumber(value: unknown, fallback?: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeAiReasoningEffort(value: unknown): AiReasoningEffort {
  return value === 'minimal' || value === 'low' || value === 'high' || value === 'xhigh'
    ? value
    : 'medium';
}

function normalizeAiModel(value: unknown): AiModelConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  const providerModelId = typeof value.providerModelId === 'string' && value.providerModelId.trim()
    ? value.providerModelId.trim()
    : id;

  if (!id || !providerModelId) {
    return null;
  }

  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};

  return {
    id,
    displayName: typeof value.displayName === 'string' && value.displayName.trim()
      ? value.displayName.trim()
      : providerModelId,
    providerModelId,
    capabilities: {
      streaming: capabilities.streaming !== false,
      vision: capabilities.vision === true,
      toolCalling: capabilities.toolCalling === true,
      structuredOutput: capabilities.structuredOutput === true,
      reasoning: capabilities.reasoning === true,
      embedding: capabilities.embedding === true,
      nativeWebSearch: capabilities.nativeWebSearch === true,
      nativeFileSearch: capabilities.nativeFileSearch === true,
      maxContextTokens: normalizeAiNumber(capabilities.maxContextTokens),
    },
    contextWindow: normalizeAiNumber(value.contextWindow),
    maxOutputTokens: normalizeAiNumber(value.maxOutputTokens),
    defaultTemperature: normalizeAiNumber(value.defaultTemperature),
  };
}

function normalizeAiProvider(value: unknown): AiProviderConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  if (!id) {
    return null;
  }

  const models = Array.isArray(value.models)
    ? value.models.map(normalizeAiModel).filter((model): model is AiModelConfig => Boolean(model))
    : [];

  return {
    id,
    kind: normalizeAiProviderKind(value.kind),
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id,
    baseUrl: typeof value.baseUrl === 'string' && value.baseUrl.trim() ? value.baseUrl.trim() : undefined,
    apiKeyRef: typeof value.apiKeyRef === 'string' && value.apiKeyRef.trim() ? value.apiKeyRef.trim() : undefined,
    apiKey: typeof value.apiKey === 'string' && value.apiKey.trim() ? value.apiKey : undefined,
    enabled: value.enabled !== false,
    models,
    createdAt: normalizeAiNumber(value.createdAt, Date.now()) ?? Date.now(),
    updatedAt: normalizeAiNumber(value.updatedAt, Date.now()) ?? Date.now(),
  };
}

function normalizeAiAssistant(value: unknown, fallback: AiAssistantConfig): AiAssistantConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  if (!id) {
    return null;
  }

  return {
    id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : fallback.name,
    emoji: typeof value.emoji === 'string' && value.emoji.trim() ? value.emoji.trim() : fallback.emoji,
    providerId: typeof value.providerId === 'string' && value.providerId.trim() ? value.providerId.trim() : undefined,
    modelId: typeof value.modelId === 'string' && value.modelId.trim() ? value.modelId.trim() : undefined,
    systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt : fallback.systemPrompt,
    knowledgeLibraryId: typeof value.knowledgeLibraryId === 'string' && value.knowledgeLibraryId.trim()
      ? value.knowledgeLibraryId.trim()
      : undefined,
    knowledgeSpaceId: typeof value.knowledgeSpaceId === 'string' && value.knowledgeSpaceId.trim()
      ? value.knowledgeSpaceId.trim()
      : undefined,
    knowledgeMode: normalizeAiAssistantKnowledgeMode(value.knowledgeMode, fallback.knowledgeMode),
    mcpMode: normalizeAiAssistantMcpMode(value.mcpMode, fallback.mcpMode),
    commonPhrases: normalizeStringList(value.commonPhrases),
    memoryEnabled: value.memoryEnabled === true,
    temperatureEnabled: value.temperatureEnabled === true,
    temperature: Math.max(0, Math.min(2, normalizeAiNumber(value.temperature, fallback.temperature) ?? fallback.temperature)),
    topPEnabled: value.topPEnabled === true,
    topP: Math.max(0, Math.min(1, normalizeAiNumber(value.topP, fallback.topP) ?? fallback.topP)),
    contextMessages: Math.max(0, Math.min(200, Math.round(normalizeAiNumber(value.contextMessages, fallback.contextMessages) ?? fallback.contextMessages))),
    maxOutputTokensEnabled: value.maxOutputTokensEnabled === true,
    maxOutputTokens: normalizeAiNumber(value.maxOutputTokens),
    streaming: value.streaming !== false,
    toolCallMode: normalizeAiAssistantToolCallMode(value.toolCallMode, fallback.toolCallMode),
    maxToolCallsEnabled: value.maxToolCallsEnabled === true,
    maxToolCalls: Math.max(1, Math.min(64, Math.round(normalizeAiNumber(value.maxToolCalls, fallback.maxToolCalls) ?? fallback.maxToolCalls))),
    customParameters: Array.isArray(value.customParameters)
      ? value.customParameters.map(normalizeAiAssistantCustomParameter).filter((item): item is AiAssistantConfig['customParameters'][number] => Boolean(item))
      : [],
    createdAt: normalizeAiNumber(value.createdAt, fallback.createdAt) ?? fallback.createdAt,
    updatedAt: normalizeAiNumber(value.updatedAt, Date.now()) ?? Date.now(),
  };
}

function normalizeAiAssistantCustomParameter(value: unknown): AiAssistantConfig['customParameters'][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = typeof value.key === 'string' && value.key.trim() ? value.key.trim() : '';
  if (!key) {
    return null;
  }

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : key,
    key,
    value: typeof value.value === 'string' ? value.value : '',
  };
}

function normalizeAiAssistantKnowledgeMode(value: unknown, fallback: AiAssistantKnowledgeMode): AiAssistantKnowledgeMode {
  return value === 'intent' || value === 'force' ? value : fallback;
}

function normalizeAiAssistantMcpMode(value: unknown, fallback: AiAssistantMcpMode): AiAssistantMcpMode {
  return value === 'auto' || value === 'manual' || value === 'disabled' ? value : fallback;
}

function normalizeAiAssistantToolCallMode(value: unknown, fallback: AiAssistantToolCallMode): AiAssistantToolCallMode {
  return value === 'auto' || value === 'none' || value === 'function' ? value : fallback;
}

function normalizeAiMcpTransport(value: unknown, fallback: AiMcpTransport = 'stdio'): AiMcpTransport {
  return value === 'sse' || value === 'http' || value === 'stdio' ? value : fallback;
}

function normalizeAiMcpEnvironmentVariable(value: unknown): AiMcpEnvironmentVariable | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = typeof value.key === 'string' && value.key.trim() ? value.key.trim() : '';
  if (!key) {
    return null;
  }

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : key,
    key,
    value: typeof value.value === 'string' ? value.value : '',
    secret: value.secret === true,
  };
}

function normalizeAiMcpServer(value: unknown): AiMcpServerConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  if (!id) {
    return null;
  }

  const transport = normalizeAiMcpTransport(value.transport);
  const command = typeof value.command === 'string' && value.command.trim() ? value.command.trim() : undefined;
  const url = typeof value.url === 'string' && value.url.trim() ? value.url.trim() : undefined;
  if (transport === 'stdio' && !command) {
    return null;
  }
  if (transport !== 'stdio' && !url) {
    return null;
  }

  const timestamp = Date.now();
  return {
    id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id,
    enabled: value.enabled !== false,
    source: value.source === 'modelscope' ? 'modelscope' : 'manual',
    sourceId: typeof value.sourceId === 'string' && value.sourceId.trim() ? value.sourceId.trim() : undefined,
    transport,
    command,
    args: normalizeStringList(value.args),
    cwd: typeof value.cwd === 'string' && value.cwd.trim() ? value.cwd.trim() : undefined,
    url,
    env: Array.isArray(value.env)
      ? value.env.map(normalizeAiMcpEnvironmentVariable).filter((item): item is AiMcpEnvironmentVariable => Boolean(item))
      : [],
    autoStart: value.autoStart === true,
    createdAt: normalizeAiNumber(value.createdAt, timestamp) ?? timestamp,
    updatedAt: normalizeAiNumber(value.updatedAt, timestamp) ?? timestamp,
  };
}

function normalizeAiAgentFeature(value: unknown): AiAgentFeatureConfig {
  const defaults = createDefaultAiAgentFeatureConfig();
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const chat = isRecord(value.chat) ? value.chat : {};
  const agent = isRecord(value.agent) ? value.agent : {};
  const codex = isRecord(agent.codex) ? agent.codex : {};
  const general = isRecord(agent.general) ? agent.general : {};
  const research = isRecord(value.research) ? value.research : {};
  const mcp = isRecord(value.mcp) ? value.mcp : {};
  const defaultAssistant = defaults.assistants[0];
  const assistants = Array.isArray(value.assistants)
    ? value.assistants
      .map((assistant) => normalizeAiAssistant(assistant, defaultAssistant))
      .filter((assistant): assistant is AiAssistantConfig => Boolean(assistant))
    : [];
  const normalizedAssistants = assistants.length ? assistants : [...defaults.assistants];

  return {
    enabled: value.enabled === true,
    defaultMode: value.defaultMode === 'chat' || value.defaultMode === 'general-agent' || value.defaultMode === 'code-agent'
      ? value.defaultMode
      : 'chat',
    defaultProviderId: typeof value.defaultProviderId === 'string' ? value.defaultProviderId : undefined,
    defaultChatModelId: typeof value.defaultChatModelId === 'string' ? value.defaultChatModelId : undefined,
    defaultAssistantId: typeof value.defaultAssistantId === 'string'
      && normalizedAssistants.some((assistant) => assistant.id === value.defaultAssistantId)
      ? value.defaultAssistantId
      : normalizedAssistants[0]?.id,
    assistants: normalizedAssistants,
    providers: Array.isArray(value.providers)
      ? value.providers.map(normalizeAiProvider).filter((provider): provider is AiProviderConfig => Boolean(provider))
      : [],
    chat: {
      defaultSystemPrompt: typeof chat.defaultSystemPrompt === 'string'
        ? chat.defaultSystemPrompt
        : defaults.chat.defaultSystemPrompt,
      maxHistoryMessages: Math.max(1, Math.min(200, Math.round(normalizeAiNumber(chat.maxHistoryMessages, defaults.chat.maxHistoryMessages) ?? defaults.chat.maxHistoryMessages))),
      temperature: Math.max(0, Math.min(2, normalizeAiNumber(chat.temperature, defaults.chat.temperature) ?? defaults.chat.temperature)),
      maxOutputTokens: normalizeAiNumber(chat.maxOutputTokens),
      reasoningEnabled: chat.reasoningEnabled === true,
      reasoningEffort: normalizeAiReasoningEffort(chat.reasoningEffort),
      reasoningBudgetTokens: normalizeAiNumber(chat.reasoningBudgetTokens),
    },
    agent: {
      enabled: agent.enabled === true,
      defaultAgentMode: normalizeAiAgentMode(agent.defaultAgentMode, defaults.agent.defaultAgentMode),
      maxSteps: Math.max(1, Math.min(32, Math.round(normalizeAiNumber(agent.maxSteps, defaults.agent.maxSteps) ?? defaults.agent.maxSteps))),
      requireApprovalForWriteTools: agent.requireApprovalForWriteTools !== false,
      codex: {
        enabled: codex.enabled === true,
        lastWorkingDirectory: typeof codex.lastWorkingDirectory === 'string'
          ? codex.lastWorkingDirectory
          : defaults.agent.codex.lastWorkingDirectory,
        skipGitRepoCheck: codex.skipGitRepoCheck === true,
        cliConfigJson: typeof codex.cliConfigJson === 'string'
          ? codex.cliConfigJson
          : defaults.agent.codex.cliConfigJson,
      },
      general: {
        enabled: general.enabled === true,
        defaultAgentId: typeof general.defaultAgentId === 'string' && general.defaultAgentId.trim()
          ? general.defaultAgentId.trim()
          : undefined,
        agents: Array.isArray(general.agents)
          ? general.agents.map(normalizeAiGeneralAgentTemplate).filter((item): item is AiGeneralAgentTemplate => Boolean(item))
          : [],
      },
    },
    research: {
      enabled: research.enabled === true,
      maxSearchQueries: Math.max(1, Math.min(50, Math.round(normalizeAiNumber(research.maxSearchQueries, defaults.research.maxSearchQueries) ?? defaults.research.maxSearchQueries))),
      maxSources: Math.max(1, Math.min(200, Math.round(normalizeAiNumber(research.maxSources, defaults.research.maxSources) ?? defaults.research.maxSources))),
      webSearchEndpoint: typeof research.webSearchEndpoint === 'string' && research.webSearchEndpoint.trim()
        ? research.webSearchEndpoint.trim()
        : undefined,
      webSearchApiKey: typeof research.webSearchApiKey === 'string' && research.webSearchApiKey.trim()
        ? research.webSearchApiKey
        : undefined,
      allowedDomains: normalizeStringList(research.allowedDomains),
      blockedDomains: normalizeStringList(research.blockedDomains),
      defaultKnowledgeLibraryId: typeof research.defaultKnowledgeLibraryId === 'string' && research.defaultKnowledgeLibraryId.trim()
        ? research.defaultKnowledgeLibraryId.trim()
        : undefined,
      defaultKnowledgeSpaceId: typeof research.defaultKnowledgeSpaceId === 'string' && research.defaultKnowledgeSpaceId.trim()
        ? research.defaultKnowledgeSpaceId.trim()
        : undefined,
      embeddingProviderId: typeof research.embeddingProviderId === 'string' && research.embeddingProviderId.trim()
        ? research.embeddingProviderId.trim()
        : undefined,
      embeddingModelId: typeof research.embeddingModelId === 'string' && research.embeddingModelId.trim()
        ? research.embeddingModelId.trim()
        : undefined,
    },
    mcp: {
      enabled: mcp.enabled === true,
      modelscopeApiToken: typeof mcp.modelscopeApiToken === 'string' && mcp.modelscopeApiToken.trim()
        ? mcp.modelscopeApiToken.trim()
        : undefined,
      servers: Array.isArray(mcp.servers)
        ? mcp.servers.map(normalizeAiMcpServer).filter((server): server is AiMcpServerConfig => Boolean(server))
        : [],
    },
  };
}

function normalizeAiAgentMode(value: unknown, fallback: AiAgentMode): AiAgentMode {
  return value === 'code-agent' || value === 'general-agent' ? value : fallback;
}

function normalizeAiGeneralAgentTemplate(value: unknown): AiGeneralAgentTemplate | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : '';
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id;
  if (!id || !name) {
    return null;
  }

  const timestamp = Date.now();
  return {
    id,
    name,
    description: typeof value.description === 'string' && value.description.trim()
      ? value.description.trim()
      : undefined,
    systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt : '',
    providerId: typeof value.providerId === 'string' && value.providerId.trim()
      ? value.providerId.trim()
      : undefined,
    modelId: typeof value.modelId === 'string' && value.modelId.trim()
      ? value.modelId.trim()
      : undefined,
    enabledTools: normalizeStringList(value.enabledTools),
    temperature: normalizeAiNumber(value.temperature),
    maxOutputTokens: normalizeAiNumber(value.maxOutputTokens),
    createdAt: normalizeAiNumber(value.createdAt, timestamp) ?? timestamp,
    updatedAt: normalizeAiNumber(value.updatedAt, timestamp) ?? timestamp,
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean))]
    .slice(0, 50);
}

function normalizeSettingsFeature(value: unknown): AppSettingsFeatureConfig {
  const defaults = createDefaultAppConfig().features.settings;
  const rawTabs = isRecord(value) && isRecord(value.tabs) ? value.tabs : {};
  const tabs = {} as Record<AppSettingsTabId, AppSettingsTabPersonalizationConfig>;

  for (const tabId of SETTINGS_TAB_IDS) {
    tabs[tabId] = normalizeSettingsTabPersonalization(rawTabs[tabId], defaults.tabs[tabId]);
  }

  return { tabs };
}

function normalizeSettingsTabPersonalization(
  value: unknown,
  fallback: AppSettingsTabPersonalizationConfig = createDefaultSettingsTabPersonalization(),
): AppSettingsTabPersonalizationConfig {
  if (!isRecord(value)) {
    return cloneConfig(fallback);
  }

  const type = value.type === 'image' || value.type === 'video' ? value.type : 'color';
  return {
    type,
    color: typeof value.color === 'string' ? value.color : fallback.color,
    image: typeof value.image === 'string' ? value.image : fallback.image,
    video: typeof value.video === 'string' ? value.video : fallback.video,
    style: isRecord(value.style) ? cloneConfig(value.style) : cloneConfig(fallback.style),
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

function normalizeQuickLaunchOpacity(value: unknown, fallback: number, min = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(min, Math.min(1, numeric))
    : fallback;
}

function normalizeQuickLaunchColor(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function normalizeQuickLaunchFeature(value: unknown): QuickLaunchFeatureConfig {
  const defaults = createDefaultAppConfig().features.quickLaunch;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const rawLimit = Number(value.maxResults);
  const maxResults = Number.isFinite(rawLimit)
    ? Math.max(4, Math.min(50, Math.round(rawLimit)))
    : defaults.maxResults;
  const allowedProviders = new Set<QuickLaunchProviderId>(QUICK_LAUNCH_PROVIDER_IDS);
  const enabledProviders = normalizeStringList(value.enabledProviders)
    .filter((providerId): providerId is QuickLaunchProviderId => allowedProviders.has(providerId as QuickLaunchProviderId));
  const shouldAppendNewDefaults = LEGACY_QUICK_LAUNCH_DEFAULT_PROVIDER_IDS.every(providerId =>
    enabledProviders.includes(providerId),
  );
  const migratedProviders = shouldAppendNewDefaults
    ? [...new Set<QuickLaunchProviderId>([...enabledProviders, 'app', 'file'])]
    : enabledProviders;
  const everythingEsPath = typeof value.everythingEsPath === 'string'
    ? value.everythingEsPath.trim()
    : defaults.everythingEsPath;
  const background = normalizeQuickLaunchBackground(value, defaults);

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
    maxResults,
    enabledProviders: migratedProviders.length > 0 ? migratedProviders : [...defaults.enabledProviders],
    hideOnBlur: typeof value.hideOnBlur === 'boolean' ? value.hideOnBlur : defaults.hideOnBlur,
    everythingEsPath,
    windowOpacity: normalizeQuickLaunchOpacity(value.windowOpacity, defaults.windowOpacity, 0.2),
    selectionColor: normalizeQuickLaunchColor(value.selectionColor, defaults.selectionColor),
    selectionOpacity: normalizeQuickLaunchOpacity(value.selectionOpacity, defaults.selectionOpacity),
    resultTitleColor: normalizeQuickLaunchColor(value.resultTitleColor, defaults.resultTitleColor),
    resultSubtitleColor: normalizeQuickLaunchColor(value.resultSubtitleColor, defaults.resultSubtitleColor),
    ...background,
  };
}

function normalizeQuickLaunchBackground(
  value: Record<string, unknown>,
  defaults: QuickLaunchFeatureConfig,
): Pick<QuickLaunchFeatureConfig, 'backgroundType' | 'backgroundColor' | 'backgroundImage' | 'backgroundVideo' | 'backgroundStyle'> {
  const rawStyle = isRecord(value.backgroundStyle)
    ? cloneConfig(value.backgroundStyle) as QuickLaunchFeatureConfig['backgroundStyle']
    : cloneConfig(defaults.backgroundStyle);
  rawStyle.opacity = normalizeQuickLaunchOpacity(rawStyle.opacity, defaults.backgroundStyle.opacity ?? 1);
  if (rawStyle.blur !== undefined) {
    const blur = Number(rawStyle.blur);
    rawStyle.blur = Number.isFinite(blur)
      ? Math.max(0, Math.min(40, blur))
      : undefined;
  }

  return {
    backgroundType: value.backgroundType === 'image' || value.backgroundType === 'video' ? value.backgroundType : 'color',
    backgroundColor: typeof value.backgroundColor === 'string' ? value.backgroundColor : defaults.backgroundColor,
    backgroundImage: typeof value.backgroundImage === 'string' ? value.backgroundImage : defaults.backgroundImage,
    backgroundVideo: typeof value.backgroundVideo === 'string' ? value.backgroundVideo : defaults.backgroundVideo,
    backgroundStyle: rawStyle,
  };
}

function normalizeKnowledgeFeature(value: unknown): AppKnowledgeFeatureConfig {
  const defaults = createDefaultAppConfig().features.knowledge;
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const rawMaxImportFileSizeMb = Number(value.maxImportFileSizeMb);
  const maxImportFileSizeMb = Number.isFinite(rawMaxImportFileSizeMb)
    ? Math.max(1, Math.min(10240, Math.round(rawMaxImportFileSizeMb)))
    : defaults.maxImportFileSizeMb;
  const rawPreviewCacheTtlDays = Number(value.previewCacheTtlDays);
  const previewCacheTtlDays = Number.isFinite(rawPreviewCacheTtlDays)
    ? Math.max(0, Math.min(3650, Math.round(rawPreviewCacheTtlDays)))
    : defaults.previewCacheTtlDays;

  return {
    defaultLibraryId: typeof value.defaultLibraryId === 'string' ? value.defaultLibraryId.trim() : defaults.defaultLibraryId,
    assetStorageMode: value.assetStorageMode === 'custom' ? 'custom' : 'app-data',
    customAssetDirectory: typeof value.customAssetDirectory === 'string' ? value.customAssetDirectory.trim() : defaults.customAssetDirectory,
    libreOfficePath: typeof value.libreOfficePath === 'string' ? value.libreOfficePath.trim() : defaults.libreOfficePath,
    indexingEnabled: typeof value.indexingEnabled === 'boolean' ? value.indexingEnabled : defaults.indexingEnabled,
    maxImportFileSizeMb,
    previewCacheTtlDays,
    quickNote: normalizeKnowledgeQuickNoteWindow(value.quickNote),
  };
}

function normalizeKnowledgeQuickNoteWindow(value: unknown): AppKnowledgeQuickNoteWindowConfig {
  const defaults = createDefaultKnowledgeQuickNoteWindowConfig();
  if (!isRecord(value)) {
    return cloneConfig(defaults);
  }

  const rawStyle = isRecord(value.backgroundStyle)
    ? cloneConfig(value.backgroundStyle) as Record<string, unknown>
    : cloneConfig(defaults.backgroundStyle) as Record<string, unknown>;
  const opacity = Number(rawStyle.opacity);
  rawStyle.opacity = Number.isFinite(opacity)
    ? Math.max(0, Math.min(1, opacity))
    : defaults.backgroundStyle.opacity;

  return {
    backgroundType: value.backgroundType === 'image' || value.backgroundType === 'video' ? value.backgroundType : 'color',
    backgroundColor: typeof value.backgroundColor === 'string' ? value.backgroundColor : defaults.backgroundColor,
    backgroundImage: typeof value.backgroundImage === 'string' ? value.backgroundImage : defaults.backgroundImage,
    backgroundVideo: typeof value.backgroundVideo === 'string' ? value.backgroundVideo : defaults.backgroundVideo,
    backgroundStyle: rawStyle,
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
  // 浅拷贝即可：仅读取属性，不修改 themeVariants 等嵌套对象，
  // 避免对含大 base64 图片的 themeVariants 做不必要的深拷贝
  const viewportBgStyle = isRecord(value.viewportBgStyle) ? { ...value.viewportBgStyle } as Record<string, unknown> : { ...defaults.viewportBgStyle };

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
      aiAgent: normalizeAiAgentFeature({
        ...current.features.aiAgent,
        ...(patch.features?.aiAgent ?? {}),
        chat: {
          ...current.features.aiAgent.chat,
          ...(patch.features?.aiAgent?.chat ?? {}),
        },
        agent: {
          ...current.features.aiAgent.agent,
          ...(patch.features?.aiAgent?.agent ?? {}),
          codex: {
            ...current.features.aiAgent.agent.codex,
            ...(patch.features?.aiAgent?.agent?.codex ?? {}),
          },
          general: {
            ...current.features.aiAgent.agent.general,
            ...(patch.features?.aiAgent?.agent?.general ?? {}),
          },
        },
        research: {
          ...current.features.aiAgent.research,
          ...(patch.features?.aiAgent?.research ?? {}),
        },
      }),
      settings: normalizeSettingsFeature({
        ...current.features.settings,
        tabs: {
          ...current.features.settings.tabs,
          ...(patch.features?.settings?.tabs ?? {}),
        },
      }),
      terminal: normalizeTerminalFeature({
        ...current.features.terminal,
        ...(patch.features?.terminal ?? {}),
      }),
      multiDeviceClipboard: normalizeMultiDeviceClipboardFeature({
        ...current.features.multiDeviceClipboard,
        ...(patch.features?.multiDeviceClipboard ?? {}),
      }),
      knowledge: normalizeKnowledgeFeature({
        ...current.features.knowledge,
        ...(patch.features?.knowledge ?? {}),
        quickNote: {
          ...current.features.knowledge.quickNote,
          ...(patch.features?.knowledge?.quickNote ?? {}),
        },
      }),
      quickLaunch: normalizeQuickLaunchFeature({
        ...current.features.quickLaunch,
        ...(patch.features?.quickLaunch ?? {}),
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

    let payload: unknown;
    try {
      payload = await fs.readJSON(APP_CONFIG_FILE);
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

    let normalized: AppConfig;
    try {
      normalized = normalizeAppConfig(payload);
    } catch (error) {
      console.error('Failed to normalize app config. Keeping parsed settings file untouched.', error);
      throw error;
    }

    try {
      await fs.writeJSON(APP_CONFIG_FILE, this.serializeConfigForDisk(normalized), { spaces: 2 });
    } catch (error) {
      console.error('Failed to write normalized app config. Keeping parsed settings in memory.', error);
    }

    return normalized;
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
    // 浅拷贝并移除 shortcuts（shortcuts 持久化到数据库），
    // 避免对整个配置做深拷贝（可能包含大 base64 背景图数据）
    const payload = { ...config } as AppConfig & { shortcuts?: AppShortcutsConfig };
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
