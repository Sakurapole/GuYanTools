<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import AiAgentReservedPanel from './components/AiAgentReservedPanel.vue';
import AiAssistantSettingsDialog from './components/AiAssistantSettingsDialog.vue';
import AiCanvasPanel from './components/AiCanvasPanel.vue';
import AiComposer from './components/AiComposer.vue';
import AiContextPanel from './components/AiContextPanel.vue';
import AiMessageList from './components/AiMessageList.vue';
import AiResearchPanel from './components/AiResearchPanel.vue';
import AiWorkspaceSidebar from './components/AiWorkspaceSidebar.vue';
import MainPageLayout from '@/windows/main/components/layout/MainPageLayout.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPopupSurface from '@/windows/main/components/ui/UiPopupSurface.vue';
import UiPersonalizationConfig from '@/windows/main/components/ui/UiPersonalizationConfig.vue';
import UiTabs, { type UiTabItem } from '@/windows/main/components/ui/UiTabs.vue';
import type { UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import EditIcon from '@/windows/main/components/svgs/icons/EditIcon.vue';
import { useContextMenu, type ContextMenuItem } from '@/windows/main/composables/useContextMenu';
import { buildBackgroundTextVars } from '@/windows/main/utils/backgroundTextColor';
import {
  resolveThemeBackground,
  withThemeBackground,
  type BackgroundConfirmPayload,
  type BackgroundValueConfig,
} from '@/contracts/background';
import type {
  AiAssistantConfig,
  AiChatAttachment,
  AiChatBackgroundConfig,
  AiChatBackgroundSettings,
  AiChatReference,
  AiReasoningEffort,
  AiSearchMode,
} from '@/contracts/ai';
import { useAiCanvasStore } from '@/windows/main/stores/ai_canvas_store';
import { useAiChatStore } from '@/windows/main/stores/ai_chat_store';
import { createAiAssistantConfig, useAiConfigStore } from '@/windows/main/stores/ai_config_store';
import { useAiContextStore } from '@/windows/main/stores/ai_context_store';
import { useAiResearchStore } from '@/windows/main/stores/ai_research_store';
import { useAppConfigStore } from '@/windows/main/stores/app_config_store';

const aiConfigStore = useAiConfigStore();
const appConfigStore = useAppConfigStore();
const aiChatStore = useAiChatStore();
const aiCanvasStore = useAiCanvasStore();
const aiContextStore = useAiContextStore();
const aiResearchStore = useAiResearchStore();
const selectedProviderId = ref('');
const selectedModelId = ref('');
const activeAssistantId = ref('');
const assistantSettingsVisible = ref(false);
const editingAssistantId = ref('');
const draftAssistant = ref<AiAssistantConfig | null>(null);
const temperatureInput = ref('');
const maxOutputTokensInput = ref('');
const reasoningEnabled = ref(false);
const reasoningEffort = ref<AiReasoningEffort>('medium');
const reasoningBudgetTokensInput = ref('');
const webSearchMode = ref<AiSearchMode>('off');
const knowledgeSearchMode = ref<AiSearchMode>('off');
const canvasEnabled = ref(false);
const canvasPanelVisible = ref(false);
const contextPanelVisible = ref(false);
const aiPageMode = ref<'chat' | 'research' | 'agent'>('chat');
const sidebarCollapsed = ref(false);
const activeBackgroundRegion = ref<keyof AiChatBackgroundSettings>('conversation');
const backgroundConfigVisible = ref(false);
const contextMenu = useContextMenu();
const composerRef = ref<{
  appendText: (value: string) => void;
  addReference: (value: string) => void;
} | null>(null);

const pageModeTabs: UiTabItem[] = [
  { key: 'chat', label: '问答' },
  { key: 'research', label: 'Research' },
  { key: 'agent', label: 'Agent' },
];

const backgroundTheme = computed(() => appConfigStore.config.appearance.theme === 'dark' ? 'dark' : 'light');
const sidebarBackground = computed(() => resolveAiBackground('sidebar'));
const conversationBackground = computed(() => resolveAiBackground('conversation'));
const headerBackground = computed(() => resolveAiBackground('header'));
const composerBackground = computed(() => resolveAiBackground('composer'));
const activeBackground = computed(() => resolveAiBackground(activeBackgroundRegion.value));
const aiPageStyle = computed(() => ({
  '--ui-page-sidebar-width': '292px',
  '--ui-page-sidebar-collapsed-width': '72px',
  '--ai-sidebar-background': sidebarBackground.value.color || 'var(--ui-surface-base)',
  '--ai-conversation-background': conversationBackground.value.color || 'var(--ui-surface-muted)',
  '--ai-header-background': headerBackground.value.color || 'var(--ui-surface-base)',
  '--ai-composer-background': composerBackground.value.color || 'var(--ui-surface-base)',
}));
const activeBackgroundPreviewSize = computed(() => {
  switch (activeBackgroundRegion.value) {
    case 'sidebar': return { width: 292, height: 640 };
    case 'header': return { width: 900, height: 80 };
    case 'composer': return { width: 900, height: 240 };
    default: return { width: 900, height: 560 };
  }
});

const readyProvider = computed(() => aiConfigStore.defaultProvider);
const readyModel = computed(() => aiConfigStore.defaultModel);
const activeAssistant = computed(() =>
  aiConfigStore.assistants.find((assistant) => assistant.id === activeAssistantId.value)
  ?? aiConfigStore.defaultAssistant,
);
const editingAssistant = computed(() =>
  aiConfigStore.assistants.find((assistant) => assistant.id === editingAssistantId.value) ?? draftAssistant.value,
);
const providerOptions = computed<UiSelectOption[]>(() => aiConfigStore.enabledProviders.map((provider) => ({
  label: provider.name,
  value: provider.id,
})));
const selectedProvider = computed(() =>
  aiConfigStore.enabledProviders.find((provider) => provider.id === selectedProviderId.value) ?? readyProvider.value,
);
const modelOptions = computed<UiSelectOption[]>(() => selectedProvider.value?.models.map((model) => ({
  label: model.displayName,
  value: model.id,
})) ?? []);
const searchModeOptions: UiSelectOption[] = [
  { label: '关闭', value: 'off' },
  { label: '自动', value: 'auto' },
  { label: '强制', value: 'force' },
];
const reasoningEffortOptions: UiSelectOption[] = [
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
  { label: '高', value: 'high' },
  { label: '最小', value: 'minimal' },
  { label: '极高', value: 'xhigh' },
];
const selectedModel = computed(() =>
  selectedProvider.value?.models.find((model) => model.id === selectedModelId.value) ?? selectedProvider.value?.models[0],
);
const canChat = computed(() => Boolean(selectedProvider.value && selectedModel.value));
const pageError = computed(() => aiConfigStore.error || aiChatStore.error);
const runtimeSummary = computed(() => {
  if (!canChat.value) {
    return '请先配置 Provider 和模型';
  }
  return `${activeAssistant.value?.name || '默认助手'} · ${selectedProvider.value?.name} / ${selectedModel.value?.displayName}`;
});

onMounted(async () => {
  aiChatStore.ensureStreamSubscription();
  aiCanvasStore.ensureStreamSubscription();
  aiResearchStore.ensureSubscription();
  await aiConfigStore.refresh();
  activeAssistantId.value = aiConfigStore.config.defaultAssistantId || aiConfigStore.defaultAssistant?.id || '';
  await aiContextStore.refresh();
  await aiChatStore.refreshConversations();
  await selectConversationForAssistant(activeAssistantId.value);
  if (aiChatStore.activeConversationId) {
    await aiCanvasStore.loadForConversation(aiChatStore.activeConversationId);
  }
  syncRuntimeOptions();
});

onBeforeUnmount(() => {
  aiChatStore.dispose();
  aiCanvasStore.dispose();
  aiResearchStore.dispose();
});

watch(
  () => aiChatStore.activeConversation?.id,
  async (conversationId) => {
    syncRuntimeOptions();
    if (conversationId) {
      await aiCanvasStore.loadForConversation(conversationId);
      aiContextStore.activeProjectId = aiChatStore.activeConversation?.projectId ?? '';
    }
  },
);

watch(
  () => activeAssistantId.value,
  () => {
    syncRuntimeOptions();
  },
);

watch(
  () => selectedProviderId.value,
  () => {
    if (!selectedProvider.value?.models.some((model) => model.id === selectedModelId.value)) {
      selectedModelId.value = selectedProvider.value?.models[0]?.id ?? '';
    }
  },
);

function syncRuntimeOptions() {
  const conversation = aiChatStore.activeConversation;
  const assistant = activeAssistant.value;
  selectedProviderId.value = assistant?.providerId || conversation?.providerId || readyProvider.value?.id || selectedProviderId.value;
  selectedModelId.value = assistant?.modelId || conversation?.modelId || readyModel.value?.id || selectedModelId.value;
  temperatureInput.value = String(assistant?.temperatureEnabled ? assistant.temperature : aiConfigStore.config.chat.temperature);
  maxOutputTokensInput.value = assistant?.maxOutputTokensEnabled && assistant.maxOutputTokens
    ? String(assistant.maxOutputTokens)
    : aiConfigStore.config.chat.maxOutputTokens
      ? String(aiConfigStore.config.chat.maxOutputTokens)
      : '';
  reasoningEnabled.value = aiConfigStore.config.chat.reasoningEnabled;
  reasoningEffort.value = aiConfigStore.config.chat.reasoningEffort;
  reasoningBudgetTokensInput.value = aiConfigStore.config.chat.reasoningBudgetTokens
    ? String(aiConfigStore.config.chat.reasoningBudgetTokens)
    : '';
  knowledgeSearchMode.value = assistant?.knowledgeMode === 'force'
    ? 'force'
    : assistant?.knowledgeMode === 'intent'
      ? 'auto'
      : 'off';
}

function resolveAiBackground(region: keyof AiChatBackgroundSettings): BackgroundValueConfig {
  return resolveThemeBackground(aiConfigStore.config.chat.backgrounds[region], backgroundTheme.value);
}

function createBackgroundStyle(background: BackgroundValueConfig): CSSProperties {
  const style = background.backgroundStyle;
  const result: Record<string, string> = {};
  if (background.type === 'image' && background.image) {
    result.backgroundImage = `url(${background.image})`;
    result.backgroundSize = style.backgroundSize || 'cover';
    result.backgroundPosition = style.backgroundPosition || 'center';
    result.backgroundRepeat = style.backgroundRepeat || 'no-repeat';
  } else if (background.color) {
    result.background = background.color;
  }
  Object.assign(result, buildBackgroundTextVars(style.textColor, {
    aliases: {
      primary: ['--ui-text-primary'],
      secondary: ['--ui-text-secondary'],
      muted: ['--ui-text-muted'],
    },
  }));
  return result as CSSProperties;
}

function createBackgroundVideoStyle(background: BackgroundValueConfig): CSSProperties {
  const style = background.backgroundStyle;
  return {
    objectFit: style.backgroundSize === 'contain' ? 'contain' : style.backgroundSize === '100% 100%' ? 'fill' : style.backgroundSize === 'auto' ? 'none' : 'cover',
    objectPosition: style.backgroundPosition || 'center',
    opacity: style.opacity ?? 1,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
  };
}

function openBackgroundContextMenu(event: MouseEvent, region: keyof AiChatBackgroundSettings) {
  const labels: Record<keyof AiChatBackgroundSettings, string> = {
    sidebar: '侧栏',
    conversation: '对话区域',
    header: '顶栏',
    composer: '输入区域',
  };
  const items: ContextMenuItem[] = [{
    id: `ai-background-${region}`,
    label: `设置${labels[region]}背景`,
    icon: EditIcon,
    action: () => {
      activeBackgroundRegion.value = region;
      backgroundConfigVisible.value = true;
    },
  }];
  contextMenu.open(event.clientX, event.clientY, items);
}

async function handleBackgroundConfirm(payload: BackgroundConfirmPayload) {
  const region = activeBackgroundRegion.value;
  const background = withThemeBackground(
    aiConfigStore.config.chat.backgrounds[region],
    backgroundTheme.value,
    {
      type: payload.type,
      color: payload.color ?? '',
      image: payload.image ?? '',
      video: payload.video ?? '',
      backgroundStyle: payload.backgroundStyle ?? {},
    },
  ) as AiChatBackgroundConfig;
  await aiConfigStore.updateConfig({
    chat: {
      ...aiConfigStore.config.chat,
      backgrounds: {
        ...aiConfigStore.config.chat.backgrounds,
        [region]: background,
      },
    },
  });
}

async function resetBackground() {
  const region = activeBackgroundRegion.value;
  await aiConfigStore.updateConfig({
    chat: {
      ...aiConfigStore.config.chat,
      backgrounds: {
        ...aiConfigStore.config.chat.backgrounds,
        [region]: { type: 'color', color: '', image: '', video: '', backgroundStyle: {} },
      },
    },
  });
}

function runtimeTemperature() {
  const value = Number(temperatureInput.value);
  return Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : undefined;
}

function runtimeMaxOutputTokens() {
  const value = Number(maxOutputTokensInput.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function runtimeTopP() {
  const assistant = activeAssistant.value;
  if (!assistant?.topPEnabled) {
    return undefined;
  }
  const value = Number(assistant.topP);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

function runtimeMaxHistoryMessages() {
  const assistant = activeAssistant.value;
  if (assistant && Number.isFinite(assistant.contextMessages)) {
    return Math.max(0, Math.floor(assistant.contextMessages));
  }
  return aiConfigStore.config.chat.maxHistoryMessages;
}

function runtimeReasoningBudgetTokens() {
  const value = Number(reasoningBudgetTokensInput.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function runtimeSystemPrompt() {
  return activeAssistant.value?.systemPrompt || aiConfigStore.config.chat.defaultSystemPrompt || undefined;
}

function runtimeMaxToolCalls() {
  const assistant = activeAssistant.value;
  if (!assistant?.maxToolCallsEnabled) {
    return undefined;
  }
  const value = Number(assistant.maxToolCalls);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

async function createConversation() {
  if (!activeAssistant.value || !selectedProvider.value || !selectedModel.value) {
    return;
  }

  await aiChatStore.createConversation({
    assistantId: activeAssistant.value.id,
    providerId: selectedProvider.value.id,
    modelId: selectedModel.value.id,
    title: '新的对话',
    systemPrompt: runtimeSystemPrompt(),
    projectId: aiContextStore.activeProjectId || undefined,
  });
}

async function send(content: string, attachments: AiChatAttachment[] = [], references: AiChatReference[] = []) {
  let conversation = aiChatStore.activeConversation;
  if (conversation?.assistantId !== activeAssistant.value?.id) {
    conversation = null;
  }
  if (!conversation) {
    await createConversation();
    conversation = aiChatStore.activeConversation;
  }

  if (!conversation) {
    return;
  }

  await aiChatStore.sendMessage({
    conversationId: conversation.id,
    content,
    attachments,
    references,
    providerId: selectedProvider.value?.id || conversation.providerId,
    modelId: selectedModel.value?.id || conversation.modelId,
    systemPrompt: runtimeSystemPrompt(),
    temperature: runtimeTemperature(),
    topP: runtimeTopP(),
    maxOutputTokens: runtimeMaxOutputTokens(),
    maxHistoryMessages: runtimeMaxHistoryMessages(),
    streaming: activeAssistant.value?.streaming ?? true,
    toolCallMode: activeAssistant.value?.toolCallMode,
    mcpMode: activeAssistant.value?.mcpMode,
    maxToolCalls: runtimeMaxToolCalls(),
    customParameters: activeAssistant.value?.customParameters,
    reasoning: {
      enabled: reasoningEnabled.value,
      effort: reasoningEffort.value,
      budgetTokens: runtimeReasoningBudgetTokens(),
    },
    grounding: {
      webSearchMode: webSearchMode.value,
      knowledgeSearchMode: knowledgeSearchMode.value,
      libraryId: activeAssistant.value?.knowledgeLibraryId || aiConfigStore.config.research.defaultKnowledgeLibraryId,
      spaceId: activeAssistant.value?.knowledgeSpaceId || aiConfigStore.config.research.defaultKnowledgeSpaceId,
    },
    canvas: {
      enabled: canvasEnabled.value,
      workspaceId: aiCanvasStore.activeWorkspaceId || undefined,
    },
    memory: {
      enabled: Boolean(activeAssistant.value?.memoryEnabled),
      assistantId: activeAssistant.value?.id,
      projectId: conversation.projectId || aiContextStore.activeProjectId || undefined,
      includeGlobal: aiContextStore.activeProject?.includeGlobalMemory ?? true,
      limit: 8,
    },
  });
}

async function regenerate(messageId: string) {
  const conversation = aiChatStore.activeConversation;
  if (!conversation || !selectedProvider.value || !selectedModel.value) {
    return;
  }

  await aiChatStore.regenerateMessage({
    conversationId: conversation.id,
    assistantMessageId: messageId,
    providerId: selectedProvider.value.id,
    modelId: selectedModel.value.id,
    systemPrompt: runtimeSystemPrompt(),
    temperature: runtimeTemperature(),
    topP: runtimeTopP(),
    maxOutputTokens: runtimeMaxOutputTokens(),
    maxHistoryMessages: runtimeMaxHistoryMessages(),
    streaming: activeAssistant.value?.streaming ?? true,
    toolCallMode: activeAssistant.value?.toolCallMode,
    mcpMode: activeAssistant.value?.mcpMode,
    maxToolCalls: runtimeMaxToolCalls(),
    customParameters: activeAssistant.value?.customParameters,
    reasoning: {
      enabled: reasoningEnabled.value,
      effort: reasoningEffort.value,
      budgetTokens: runtimeReasoningBudgetTokens(),
    },
    grounding: {
      webSearchMode: webSearchMode.value,
      knowledgeSearchMode: knowledgeSearchMode.value,
      libraryId: activeAssistant.value?.knowledgeLibraryId || aiConfigStore.config.research.defaultKnowledgeLibraryId,
      spaceId: activeAssistant.value?.knowledgeSpaceId || aiConfigStore.config.research.defaultKnowledgeSpaceId,
    },
    canvas: {
      enabled: canvasEnabled.value,
      workspaceId: aiCanvasStore.activeWorkspaceId || undefined,
    },
    memory: {
      enabled: Boolean(activeAssistant.value?.memoryEnabled),
      assistantId: activeAssistant.value?.id,
      projectId: conversation.projectId || aiContextStore.activeProjectId || undefined,
      includeGlobal: aiContextStore.activeProject?.includeGlobalMemory ?? true,
      limit: 8,
    },
  });
}

async function renameConversation(conversationId: string, title: string) {
  await aiChatStore.updateConversation(conversationId, { title });
}

async function pinConversation(conversationId: string, pinned: boolean) {
  await aiChatStore.updateConversation(conversationId, { pinned });
}

async function deleteConversation(conversationId: string) {
  await aiChatStore.deleteConversation(conversationId);
  await selectConversationForAssistant(activeAssistantId.value);
}

async function changeActiveProject(projectId: string) {
  aiContextStore.activeProjectId = projectId;
  const conversation = aiChatStore.activeConversation;
  if (conversation) {
    await aiChatStore.updateConversation(conversation.id, { projectId: projectId || undefined });
  }
}

async function rememberMessage(messageId: string) {
  const message = aiChatStore.activeMessages.find((item) => item.id === messageId);
  if (!message?.content.trim()) {
    return;
  }
  const scope = aiContextStore.activeProjectId ? 'project' : activeAssistant.value?.id ? 'assistant' : 'global';
  await aiContextStore.createMemory({
    scope,
    scopeId: scope === 'project' ? aiContextStore.activeProjectId : scope === 'assistant' ? activeAssistant.value?.id : undefined,
    content: message.content,
    sourceMessageId: message.id,
  });
  contextPanelVisible.value = true;
}

function appendToComposer(content: string, quoted: boolean) {
  const selection = content.trim();
  if (!selection) {
    return;
  }

  if (quoted) {
    composerRef.value?.addReference(selection);
    return;
  }
  composerRef.value?.appendText(selection);
}

function setPageMode(value: string) {
  aiPageMode.value = value === 'agent' || value === 'research' ? value : 'chat';
}

async function selectAssistant(assistantId: string) {
  activeAssistantId.value = assistantId;
  await selectConversationForAssistant(assistantId);
  await aiConfigStore.updateConfig({ defaultAssistantId: assistantId });
}

async function selectConversationForAssistant(assistantId: string) {
  const conversation = aiChatStore.conversations
    .filter((item) => item.assistantId === assistantId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  await aiChatStore.setActiveConversation(conversation?.id ?? '');
}

function createAssistant() {
  const assistant = createAiAssistantConfig({
    name: '新助手',
    emoji: '助',
    providerId: selectedProvider.value?.id,
    modelId: selectedModel.value?.id,
  });
  draftAssistant.value = assistant;
  editingAssistantId.value = assistant.id;
  assistantSettingsVisible.value = true;
}

function configureAssistant(assistantId: string) {
  draftAssistant.value = null;
  editingAssistantId.value = assistantId;
  assistantSettingsVisible.value = true;
}

async function saveAssistant(assistant: AiAssistantConfig) {
  const exists = aiConfigStore.assistants.some((item) => item.id === assistant.id);
  const assistants = exists
    ? aiConfigStore.assistants.map((item) => item.id === assistant.id ? assistant : item)
    : [...aiConfigStore.assistants, assistant];
  activeAssistantId.value = assistant.id;
  await aiConfigStore.saveAssistants(assistants, assistant.id);
  await selectConversationForAssistant(assistant.id);
  syncRuntimeOptions();
  draftAssistant.value = null;
}

async function deleteAssistant(assistantId: string) {
  const wasActive = activeAssistantId.value === assistantId;
  const assistants = aiConfigStore.assistants.filter((assistant) => assistant.id !== assistantId);
  const nextAssistants = assistants.length ? assistants : [createAiAssistantConfig()];
  const nextActiveId = activeAssistantId.value !== assistantId
    && nextAssistants.some((assistant) => assistant.id === activeAssistantId.value)
    ? activeAssistantId.value
    : nextAssistants[0]?.id ?? '';
  const ownedConversations = aiChatStore.conversations.filter(
    (conversation) => conversation.assistantId === assistantId,
  );
  await Promise.all(ownedConversations.map((conversation) =>
    aiChatStore.updateConversation(conversation.id, { assistantId: nextActiveId }),
  ));
  activeAssistantId.value = nextActiveId;
  await aiConfigStore.saveAssistants(nextAssistants, nextActiveId);
  if (wasActive) {
    await selectConversationForAssistant(nextActiveId);
  }
  assistantSettingsVisible.value = false;
}
</script>

<template>
  <MainPageLayout
    page-class="ai-chat-shell"
    layout-class="ai-chat-shell__layout"
    main-class="ai-chat-shell__main"
    stage-class="ai-chat-shell__stage"
    :sidebar-collapsed="sidebarCollapsed"
    :style="aiPageStyle"
  >
    <template #sidebar>
      <AiWorkspaceSidebar
        v-model:collapsed="sidebarCollapsed"
        :assistants="aiConfigStore.assistants"
        :active-assistant-id="activeAssistantId"
        :conversations="aiChatStore.conversations"
        :active-conversation-id="aiChatStore.activeConversationId"
        :providers="aiConfigStore.config.providers"
        :loading="aiChatStore.loadingConversations"
        :style="createBackgroundStyle(sidebarBackground)"
        :background-video="sidebarBackground.type === 'video' ? sidebarBackground.video : ''"
        :background-video-style="createBackgroundVideoStyle(sidebarBackground)"
        @contextmenu.prevent="openBackgroundContextMenu($event, 'sidebar')"
        @create-assistant="createAssistant"
        @select-assistant="selectAssistant"
        @configure-assistant="configureAssistant"
        @create-conversation="createConversation"
        @select-conversation="aiChatStore.setActiveConversation"
        @rename-conversation="renameConversation"
        @pin-conversation="pinConversation"
        @delete-conversation="deleteConversation"
      />
    </template>

    <template #stage>
      <div class="ai-chat-workspace">
        <section class="ai-chat-workspace__chat">
          <header
            class="ai-chat-workspace__header"
            :style="createBackgroundStyle(headerBackground)"
            @contextmenu.prevent="openBackgroundContextMenu($event, 'header')"
          >
            <video
              v-if="headerBackground.type === 'video' && headerBackground.video"
              class="ai-chat-workspace__background-video"
              :src="headerBackground.video"
              :style="createBackgroundVideoStyle(headerBackground)"
              autoplay
              loop
              muted
              playsinline
            />
            <div class="ai-chat-workspace__title">
              <span class="ai-chat-workspace__eyebrow">工作记录</span>
              <h2>{{ aiPageMode === 'chat' ? (aiChatStore.activeConversation?.title || '新的对话') : aiPageMode === 'research' ? 'Deep Research' : 'Agent 工作区' }}</h2>
              <p>{{ aiPageMode === 'chat' ? runtimeSummary : aiPageMode === 'research' ? '可取消、可审计的来源研究流水线' : 'Code Agent / 通用 Agent 执行层预留' }}</p>
            </div>

            <div class="ai-chat-workspace__header-actions">
              <UiTabs
                :model-value="aiPageMode"
                :items="pageModeTabs"
                variant="segmented"
                size="sm"
                @change="setPageMode"
              />
              <UiIconButton
                v-if="aiPageMode === 'chat'"
                size="sm"
                variant="secondary"
                label="记忆"
                title="打开项目与记忆"
                :active="contextPanelVisible"
                @click="contextPanelVisible = true"
              >
                <IconRenderer icon="iconify:lucide:brain" :size="15" />
              </UiIconButton>
              <UiIconButton
                v-if="aiPageMode === 'chat'"
                size="sm"
                variant="secondary"
                label="Canvas"
                title="打开 Canvas"
                :active="canvasPanelVisible"
                :disabled="!aiChatStore.activeConversationId"
                @click="canvasPanelVisible = true"
              >
                <IconRenderer icon="iconify:lucide:panel-top-open" :size="15" />
              </UiIconButton>
              <div v-if="aiPageMode === 'chat'" class="ai-chat-workspace__advanced">
                <UiInput
                  v-model="temperatureInput"
                  class="ai-chat-workspace__number"
                  size="sm"
                  type="number"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  :disabled="aiChatStore.isStreaming"
                  title="Temperature"
                  placeholder="Temp"
                />
                <UiInput
                  v-model="maxOutputTokensInput"
                  class="ai-chat-workspace__number"
                  size="sm"
                  type="number"
                  :min="1"
                  :step="256"
                  :disabled="aiChatStore.isStreaming"
                  title="最大输出 tokens"
                  placeholder="Max"
                />
                <UiInput
                  v-model="reasoningBudgetTokensInput"
                  class="ai-chat-workspace__number"
                  size="sm"
                  type="number"
                  :min="1"
                  :step="512"
                  :disabled="aiChatStore.isStreaming || !reasoningEnabled"
                  title="推理预算 tokens"
                  placeholder="Think"
                />
              </div>
            </div>
            <p v-if="pageError" class="ai-chat-workspace__error">{{ pageError }}</p>
          </header>

          <div
            v-if="aiPageMode === 'chat'"
            class="ai-chat-workspace__conversation"
            :style="createBackgroundStyle(conversationBackground)"
            @contextmenu.prevent="openBackgroundContextMenu($event, 'conversation')"
          >
            <video
              v-if="conversationBackground.type === 'video' && conversationBackground.video"
              class="ai-chat-workspace__background-video"
              :src="conversationBackground.video"
              :style="createBackgroundVideoStyle(conversationBackground)"
              autoplay
              loop
              muted
              playsinline
            />
            <AiMessageList
              :messages="aiChatStore.activeMessages"
              :loading="aiChatStore.loadingMessages"
              :streaming="aiChatStore.isStreaming"
              :user-avatar="aiConfigStore.config.chat.userAvatar"
              :assistant-avatar="activeAssistant?.emoji"
              :assistant-name="activeAssistant?.name"
              @regenerate="regenerate"
              @remember="rememberMessage"
              @insert-selection="appendToComposer"
            />
          </div>
          <AiResearchPanel v-else-if="aiPageMode === 'research'" />
          <AiAgentReservedPanel v-else />

          <AiComposer
            ref="composerRef"
            v-if="aiPageMode === 'chat'"
            v-model:provider-id="selectedProviderId"
            v-model:model-id="selectedModelId"
            v-model:web-search-mode="webSearchMode"
            v-model:knowledge-search-mode="knowledgeSearchMode"
            v-model:reasoning-enabled="reasoningEnabled"
            v-model:reasoning-effort="reasoningEffort"
            v-model:canvas-enabled="canvasEnabled"
            :provider-options="providerOptions"
            :model-options="modelOptions"
            :search-mode-options="searchModeOptions"
            :reasoning-effort-options="reasoningEffortOptions"
            :common-phrases="activeAssistant?.commonPhrases ?? []"
            :disabled="!canChat || aiChatStore.sending"
            :controls-disabled="aiConfigStore.loading"
            :streaming="aiChatStore.isStreaming"
            :style="createBackgroundStyle(composerBackground)"
            :background-video="composerBackground.type === 'video' ? composerBackground.video : ''"
            :background-video-style="createBackgroundVideoStyle(composerBackground)"
            @contextmenu.prevent="openBackgroundContextMenu($event, 'composer')"
            @send="send"
            @stop="aiChatStore.stopActiveRun"
          />
        </section>

        <UiPopupSurface
          v-model="canvasPanelVisible"
          variant="floating"
          :overlay="false"
          :close-on-outside="false"
          width="min(980px, calc(100vw - 40px))"
          height="min(720px, calc(100vh - 40px))"
          z-index="var(--ui-z-modal)"
          :panel-class="'ai-chat-workspace__canvas-popup'"
          :panel-style="{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
        >
          <AiCanvasPanel
            v-model:canvas-enabled="canvasEnabled"
            :conversation-id="aiChatStore.activeConversationId"
            @close="canvasPanelVisible = false"
          />
        </UiPopupSurface>

        <UiPopupSurface
          v-model="contextPanelVisible"
          variant="floating"
          :overlay="false"
          :close-on-outside="false"
          width="min(720px, calc(100vw - 40px))"
          height="min(680px, calc(100vh - 40px))"
          z-index="var(--ui-z-modal)"
          :panel-class="'ai-chat-workspace__context-popup'"
          :panel-style="{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
        >
          <AiContextPanel
            :active-assistant-id="activeAssistant?.id ?? ''"
            :active-conversation-project-id="aiChatStore.activeConversation?.projectId"
            @project-change="changeActiveProject"
            @close="contextPanelVisible = false"
          />
        </UiPopupSurface>
      </div>

      <AiAssistantSettingsDialog
        v-model="assistantSettingsVisible"
        :assistant="editingAssistant"
        :providers="aiConfigStore.enabledProviders"
        @save="saveAssistant"
        @delete="deleteAssistant"
      />

      <UiPersonalizationConfig
        :visible="backgroundConfigVisible"
        :title="`${({ sidebar: '侧栏', conversation: '对话区域', header: '顶栏', composer: '输入区域' } as const)[activeBackgroundRegion]}背景`"
        :current-background="activeBackground.type === 'color' ? activeBackground.color : ''"
        :current-background-image="activeBackground.type === 'image' ? activeBackground.image : ''"
        :current-background-video="activeBackground.type === 'video' ? activeBackground.video : ''"
        :current-background-style="activeBackground.backgroundStyle"
        show-reset
        reset-text="跟随主题"
        :preview-width="activeBackgroundPreviewSize.width"
        :preview-height="activeBackgroundPreviewSize.height"
        @close="backgroundConfigVisible = false"
        @confirm="handleBackgroundConfirm"
        @reset="resetBackground"
      />
    </template>
  </MainPageLayout>
</template>

<style lang="scss" scoped>
.ai-chat-shell {
  background: var(--ui-surface-bg-muted);
}

.ai-chat-workspace {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--ui-text-primary);
}

.ai-chat-workspace__chat {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: calc(100% - 8px);
  height: calc(100% - 6px);
  margin: 6px 0 0 8px;
  min-width: 0;
  min-height: 0;
  background: var(--ai-conversation-background, var(--ui-surface-bg));
  border-top: var(--ui-border-width-thin) solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-left: var(--ui-border-width-thin) solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-top-right-radius: var(--ui-radius-lg);
  box-shadow: -5px -5px 14px color-mix(in srgb, var(--ui-shadow-color, #0f172a) 7%, transparent);
  overflow: hidden;
}

.ai-chat-workspace__conversation {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ai-chat-workspace__conversation > :not(.ai-chat-workspace__background-video),
.ai-chat-workspace__header > :not(.ai-chat-workspace__background-video) {
  position: relative;
  z-index: 1;
}

.ai-chat-workspace__conversation :deep(.ai-message-list) {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
}

.ai-chat-workspace__background-video {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.ai-chat-workspace__header {
  position: relative;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  padding: 10px 16px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ai-header-background, var(--ui-surface-base));
}

.ai-chat-workspace__title {
  min-width: 0;
}

.ai-chat-workspace__eyebrow {
  display: inline-flex;
  margin-bottom: 3px;
  color: var(--ui-text-muted);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0;
}

.ai-chat-workspace__title h2 {
  margin: 0;
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: 1.02rem;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-chat-workspace__title p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-chat-workspace__header-actions {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.ai-chat-workspace__advanced {
  display: grid;
  grid-template-columns: repeat(3, 64px);
  gap: 5px;
  min-width: 0;
}

.ai-chat-workspace__number {
  min-width: 0;
}

.ai-chat-workspace__header-actions :deep(.ui-tabs--segmented) {
  min-height: 34px;
  padding: 3px;
  border-color: color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-surface-muted) 76%, transparent);
}

.ai-chat-workspace__header-actions :deep(.ui-tabs--segmented .ui-tabs__item) {
  min-height: 28px;
  padding: 4px 10px;
  border-radius: calc(var(--ui-radius-sm) - 3px);
  color: var(--ui-text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
}

.ai-chat-workspace__header-actions :deep(.ui-tabs--segmented .ui-tabs__active-indicator) {
  top: 3px;
  bottom: 3px;
  border-radius: calc(var(--ui-radius-sm) - 3px);
  background: color-mix(in srgb, var(--ui-primary-color) 13%, var(--ui-surface-base));
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ui-primary-color) 12%, transparent);
}

.ai-chat-workspace__header-actions :deep(.ui-icon-button:not(.ui-icon-button--labeled)) {
  width: 34px;
  min-width: 34px;
  height: 34px;
  min-height: 34px;
  border-color: color-mix(in srgb, var(--ui-border-subtle) 68%, transparent);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-surface-overlay) 72%, transparent);
}

.ai-chat-workspace__header-actions :deep(.ui-icon-button--labeled) {
  min-height: 34px;
  padding: 5px 10px;
  border-color: color-mix(in srgb, var(--ui-border-subtle) 68%, transparent);
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-surface-overlay) 72%, transparent);
  font-size: 0.78rem;
}

.ai-chat-workspace__header-actions :deep(.ui-icon-button:hover:not(:disabled)),
.ai-chat-workspace__header-actions :deep(.ui-icon-button--active) {
  border-color: color-mix(in srgb, var(--ui-primary-color) 28%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-primary-color) 10%, var(--ui-surface-overlay));
}

.ai-chat-workspace__advanced :deep(.ui-input) {
  min-height: 34px;
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-surface-overlay) 72%, transparent);
  font-size: 0.78rem;
}

.ai-chat-workspace__error {
  grid-column: 1 / -1;
  margin: -4px 0 0;
  color: var(--ui-danger-color);
  font-size: 0.82rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

:deep(.ai-chat-workspace__canvas-popup) {
  overflow: hidden;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface-base);
  box-shadow: var(--ui-shadow-xl, 0 24px 64px rgba(15, 23, 42, 0.22));
}

@media (max-width: 1280px) {
  .ai-chat-workspace__advanced {
    display: none;
  }
}

@media (max-width: 980px) {
  .ai-chat-workspace__header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .ai-chat-workspace__header-actions {
    justify-content: space-between;
  }
}
</style>
