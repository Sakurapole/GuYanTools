<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AiAgentReservedPanel from './components/AiAgentReservedPanel.vue';
import AiCanvasPanel from './components/AiCanvasPanel.vue';
import AiComposer from './components/AiComposer.vue';
import AiConversationList from './components/AiConversationList.vue';
import AiMessageList from './components/AiMessageList.vue';
import AiSettingsPanel from './components/AiSettingsPanel.vue';
import MainPageLayout from '@/windows/main/components/layout/MainPageLayout.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiTabs, { type UiTabItem } from '@/windows/main/components/ui/UiTabs.vue';
import type { UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import type { AiReasoningEffort, AiSearchMode } from '@/contracts/ai';
import { useAiCanvasStore } from '@/windows/main/stores/ai_canvas_store';
import { useAiChatStore } from '@/windows/main/stores/ai_chat_store';
import { useAiConfigStore } from '@/windows/main/stores/ai_config_store';

const aiConfigStore = useAiConfigStore();
const aiChatStore = useAiChatStore();
const aiCanvasStore = useAiCanvasStore();
const selectedProviderId = ref('');
const selectedModelId = ref('');
const temperatureInput = ref('');
const maxOutputTokensInput = ref('');
const reasoningEnabled = ref(false);
const reasoningEffort = ref<AiReasoningEffort>('medium');
const reasoningBudgetTokensInput = ref('');
const webSearchMode = ref<AiSearchMode>('off');
const knowledgeSearchMode = ref<AiSearchMode>('off');
const canvasEnabled = ref(false);
const aiPageMode = ref<'chat' | 'agent'>('chat');
const rightPanelTab = ref<'canvas' | 'settings' | 'agent'>('canvas');
const inspectorCollapsed = ref(false);

const pageModeTabs: UiTabItem[] = [
  { key: 'chat', label: '问答' },
  { key: 'agent', label: 'Agent' },
];
const inspectorTabs: UiTabItem[] = [
  { key: 'canvas', label: 'Canvas' },
  { key: 'settings', label: '设置' },
  { key: 'agent', label: 'Agent' },
];

const readyProvider = computed(() => aiConfigStore.defaultProvider);
const readyModel = computed(() => aiConfigStore.defaultModel);
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
  return `${selectedProvider.value?.name} / ${selectedModel.value?.displayName}`;
});
const inspectorTitle = computed(() => {
  if (rightPanelTab.value === 'canvas') return 'Canvas';
  if (rightPanelTab.value === 'settings') return '设置';
  return 'Agent';
});

onMounted(async () => {
  aiChatStore.ensureStreamSubscription();
  aiCanvasStore.ensureStreamSubscription();
  await aiConfigStore.refresh();
  await aiChatStore.refreshConversations();
  if (aiChatStore.activeConversationId) {
    await aiCanvasStore.loadForConversation(aiChatStore.activeConversationId);
  }
  syncRuntimeOptions();
});

onBeforeUnmount(() => {
  aiChatStore.dispose();
  aiCanvasStore.dispose();
});

watch(
  () => aiChatStore.activeConversation?.id,
  async (conversationId) => {
    syncRuntimeOptions();
    if (conversationId) {
      await aiCanvasStore.loadForConversation(conversationId);
    }
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
  selectedProviderId.value = conversation?.providerId || readyProvider.value?.id || selectedProviderId.value;
  selectedModelId.value = conversation?.modelId || readyModel.value?.id || selectedModelId.value;
  temperatureInput.value = String(aiConfigStore.config.chat.temperature);
  maxOutputTokensInput.value = aiConfigStore.config.chat.maxOutputTokens
    ? String(aiConfigStore.config.chat.maxOutputTokens)
    : '';
  reasoningEnabled.value = aiConfigStore.config.chat.reasoningEnabled;
  reasoningEffort.value = aiConfigStore.config.chat.reasoningEffort;
  reasoningBudgetTokensInput.value = aiConfigStore.config.chat.reasoningBudgetTokens
    ? String(aiConfigStore.config.chat.reasoningBudgetTokens)
    : '';
}

function runtimeTemperature() {
  const value = Number(temperatureInput.value);
  return Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : undefined;
}

function runtimeMaxOutputTokens() {
  const value = Number(maxOutputTokensInput.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function runtimeReasoningBudgetTokens() {
  const value = Number(reasoningBudgetTokensInput.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

async function createConversation() {
  if (!selectedProvider.value || !selectedModel.value) {
    return;
  }

  await aiChatStore.createConversation({
    providerId: selectedProvider.value.id,
    modelId: selectedModel.value.id,
    title: '新的对话',
    systemPrompt: aiConfigStore.config.chat.defaultSystemPrompt || undefined,
  });
}

async function send(content: string) {
  let conversation = aiChatStore.activeConversation;
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
    providerId: selectedProvider.value?.id || conversation.providerId,
    modelId: selectedModel.value?.id || conversation.modelId,
    temperature: runtimeTemperature(),
    maxOutputTokens: runtimeMaxOutputTokens(),
    reasoning: {
      enabled: reasoningEnabled.value,
      effort: reasoningEffort.value,
      budgetTokens: runtimeReasoningBudgetTokens(),
    },
    grounding: {
      webSearchMode: webSearchMode.value,
      knowledgeSearchMode: knowledgeSearchMode.value,
      libraryId: aiConfigStore.config.research.defaultKnowledgeLibraryId,
      spaceId: aiConfigStore.config.research.defaultKnowledgeSpaceId,
    },
    canvas: {
      enabled: canvasEnabled.value,
      workspaceId: aiCanvasStore.activeWorkspaceId || undefined,
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
    temperature: runtimeTemperature(),
    maxOutputTokens: runtimeMaxOutputTokens(),
    reasoning: {
      enabled: reasoningEnabled.value,
      effort: reasoningEffort.value,
      budgetTokens: runtimeReasoningBudgetTokens(),
    },
    grounding: {
      webSearchMode: webSearchMode.value,
      knowledgeSearchMode: knowledgeSearchMode.value,
      libraryId: aiConfigStore.config.research.defaultKnowledgeLibraryId,
      spaceId: aiConfigStore.config.research.defaultKnowledgeSpaceId,
    },
    canvas: {
      enabled: canvasEnabled.value,
      workspaceId: aiCanvasStore.activeWorkspaceId || undefined,
    },
  });
}

async function renameConversation(conversationId: string, title: string) {
  await aiChatStore.updateConversation(conversationId, { title });
}

async function pinConversation(conversationId: string, pinned: boolean) {
  await aiChatStore.updateConversation(conversationId, { pinned });
}

function setPageMode(value: string) {
  aiPageMode.value = value === 'agent' ? 'agent' : 'chat';
  if (aiPageMode.value === 'agent') {
    rightPanelTab.value = 'agent';
  }
}
</script>

<template>
  <MainPageLayout
    page-class="ai-chat-shell"
    layout-class="ai-chat-shell__layout"
    main-class="ai-chat-shell__main"
    stage-class="ai-chat-shell__stage"
    :style="{ '--ui-page-sidebar-width': '292px' }"
  >
    <template #sidebar>
      <AiConversationList
        :conversations="aiChatStore.conversations"
        :active-id="aiChatStore.activeConversationId"
        :loading="aiChatStore.loadingConversations"
        @create="createConversation"
        @select="aiChatStore.setActiveConversation"
        @rename="renameConversation"
        @pin="pinConversation"
        @delete="aiChatStore.deleteConversation"
      />
    </template>

    <template #stage>
      <div class="ai-chat-workspace" :class="{ 'ai-chat-workspace--inspector-collapsed': inspectorCollapsed }">
        <section class="ai-chat-workspace__chat">
          <header class="ai-chat-workspace__header">
            <div class="ai-chat-workspace__title">
              <span class="ai-chat-workspace__eyebrow">GuYan AI</span>
              <h2>{{ aiPageMode === 'chat' ? (aiChatStore.activeConversation?.title || '新的话题') : 'Agent 工作区' }}</h2>
              <p>{{ aiPageMode === 'chat' ? runtimeSummary : 'Code Agent / 通用 Agent 执行层预留' }}</p>
            </div>

            <div class="ai-chat-workspace__header-actions">
              <UiTabs
                :model-value="aiPageMode"
                :items="pageModeTabs"
                variant="segmented"
                size="sm"
                @change="setPageMode"
              />
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
              <UiIconButton
                size="sm"
                variant="ghost"
                :title="inspectorCollapsed ? `展开${inspectorTitle}` : `收起${inspectorTitle}`"
                @click="inspectorCollapsed = !inspectorCollapsed"
              >
                <IconRenderer :icon="inspectorCollapsed ? 'iconify:lucide:panel-right-open' : 'iconify:lucide:panel-right-close'" :size="16" />
              </UiIconButton>
            </div>
            <p v-if="pageError" class="ai-chat-workspace__error">{{ pageError }}</p>
          </header>

          <AiMessageList
            v-if="aiPageMode === 'chat'"
            :messages="aiChatStore.activeMessages"
            :loading="aiChatStore.loadingMessages"
            :streaming="aiChatStore.isStreaming"
            @regenerate="regenerate"
          />
          <AiAgentReservedPanel v-else />

          <AiComposer
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
            :disabled="!canChat || aiChatStore.sending"
            :controls-disabled="aiConfigStore.loading"
            :streaming="aiChatStore.isStreaming"
            @send="send"
            @stop="aiChatStore.stopActiveRun"
          />
        </section>

        <aside v-show="!inspectorCollapsed" class="ai-chat-workspace__inspector">
          <header class="ai-chat-workspace__inspector-tabs">
            <UiTabs
              v-model="rightPanelTab"
              :items="inspectorTabs"
              variant="segmented"
              size="sm"
              stretch
            />
          </header>
          <AiCanvasPanel
            v-if="rightPanelTab === 'canvas'"
            v-model:canvas-enabled="canvasEnabled"
            :conversation-id="aiChatStore.activeConversationId"
          />
          <AiSettingsPanel v-else-if="rightPanelTab === 'settings'" />
          <AiAgentReservedPanel v-else />
        </aside>
      </div>
    </template>
  </MainPageLayout>
</template>

<style lang="scss" scoped>
.ai-chat-shell {
  --ai-inspector-width: clamp(340px, 27vw, 460px);
  background: var(--ui-surface-bg-muted);
}

.ai-chat-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--ai-inspector-width);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--ui-text-primary);
}

.ai-chat-workspace--inspector-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.ai-chat-workspace__chat {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--ui-surface-bg);
}

.ai-chat-workspace__header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  padding: 10px 16px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
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
  text-transform: uppercase;
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
  gap: 8px;
}

.ai-chat-workspace__advanced {
  display: grid;
  grid-template-columns: repeat(3, 70px);
  gap: 6px;
  min-width: 0;
}

.ai-chat-workspace__number {
  min-width: 0;
}

.ai-chat-workspace__error {
  grid-column: 1 / -1;
  margin: -4px 0 0;
  color: var(--ui-danger-color);
  font-size: 0.82rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ai-chat-workspace__inspector {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-left: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-chat-workspace__inspector-tabs {
  padding: 7px 8px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-muted);
}

@media (max-width: 1280px) {
  .ai-chat-workspace {
    --ai-inspector-width: 380px;
  }

  .ai-chat-workspace__advanced {
    display: none;
  }
}

@media (max-width: 980px) {
  .ai-chat-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-chat-workspace__inspector {
    display: none;
  }

  .ai-chat-workspace__header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .ai-chat-workspace__header-actions {
    justify-content: space-between;
  }
}
</style>
