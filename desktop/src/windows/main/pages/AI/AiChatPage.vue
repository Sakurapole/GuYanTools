<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AiAgentReservedPanel from './components/AiAgentReservedPanel.vue';
import AiCanvasPanel from './components/AiCanvasPanel.vue';
import AiComposer from './components/AiComposer.vue';
import AiConversationList from './components/AiConversationList.vue';
import AiMessageList from './components/AiMessageList.vue';
import AiSettingsPanel from './components/AiSettingsPanel.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
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
const rightPanelTab = ref<'canvas' | 'settings'>('canvas');

const readyProvider = computed(() => aiConfigStore.defaultProvider);
const readyModel = computed(() => aiConfigStore.defaultModel);
const providerOptions = computed(() => aiConfigStore.enabledProviders.map((provider) => ({
  label: provider.name,
  value: provider.id,
})));
const selectedProvider = computed(() =>
  aiConfigStore.enabledProviders.find((provider) => provider.id === selectedProviderId.value) ?? readyProvider.value,
);
const modelOptions = computed(() => selectedProvider.value?.models.map((model) => ({
  label: model.displayName,
  value: model.id,
})) ?? []);
const searchModeOptions: { label: string; value: AiSearchMode }[] = [
  { label: '关闭', value: 'off' },
  { label: '自动', value: 'auto' },
  { label: '强制', value: 'force' },
];
const reasoningEffortOptions: { label: string; value: AiReasoningEffort }[] = [
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
</script>

<template>
  <div class="ai-chat-page">
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

    <section class="ai-chat-page__main">
      <header class="ai-chat-page__header">
        <div class="ai-chat-page__title">
          <h2>{{ aiPageMode === 'chat' ? (aiChatStore.activeConversation?.title || 'AI 问答') : 'Agent 预留' }}</h2>
          <p v-if="aiPageMode === 'agent'">Code Agent / 通用 Agent 执行层预留</p>
          <p v-else-if="canChat">{{ selectedProvider?.name }} / {{ selectedModel?.displayName }}</p>
          <p v-else>请先配置 Provider 和模型</p>
        </div>
        <div class="ai-chat-page__runtime">
          <div class="ai-chat-page__mode-switch">
            <button type="button" :class="{ active: aiPageMode === 'chat' }" @click="aiPageMode = 'chat'">
              问答
            </button>
            <button type="button" :class="{ active: aiPageMode === 'agent' }" @click="aiPageMode = 'agent'">
              Agent
            </button>
          </div>
          <UiSelect
            v-if="aiPageMode === 'chat'"
            v-model="selectedProviderId"
            class="ai-chat-page__runtime-provider"
            size="sm"
            :options="providerOptions"
            :disabled="aiConfigStore.loading || aiChatStore.isStreaming"
            placeholder="Provider"
          />
          <UiSelect
            v-if="aiPageMode === 'chat'"
            v-model="selectedModelId"
            class="ai-chat-page__runtime-model"
            size="sm"
            :options="modelOptions"
            :disabled="!selectedProvider || aiChatStore.isStreaming"
            placeholder="模型"
          />
          <UiInput
            v-if="aiPageMode === 'chat'"
            v-model="temperatureInput"
            class="ai-chat-page__runtime-number"
            size="sm"
            type="number"
            :min="0"
            :max="2"
            :step="0.1"
            :disabled="aiChatStore.isStreaming"
            title="Temperature"
          />
          <UiInput
            v-if="aiPageMode === 'chat'"
            v-model="maxOutputTokensInput"
            class="ai-chat-page__runtime-number"
            size="sm"
            type="number"
            :min="1"
            :step="256"
            :disabled="aiChatStore.isStreaming"
            title="最大输出 tokens"
            placeholder="Max"
          />
          <label v-if="aiPageMode === 'chat'" class="ai-chat-page__runtime-toggle">
            <span>网页</span>
            <UiSelect
              v-model="webSearchMode"
              size="sm"
              :options="searchModeOptions"
              :disabled="aiChatStore.isStreaming"
            />
          </label>
          <label v-if="aiPageMode === 'chat'" class="ai-chat-page__runtime-toggle">
            <span>知识库</span>
            <UiSelect
              v-model="knowledgeSearchMode"
              size="sm"
              :options="searchModeOptions"
              :disabled="aiChatStore.isStreaming"
            />
          </label>
          <label v-if="aiPageMode === 'chat'" class="ai-chat-page__runtime-check">
            <input v-model="reasoningEnabled" type="checkbox" :disabled="aiChatStore.isStreaming">
            <span>深度思考</span>
          </label>
          <label v-if="aiPageMode === 'chat'" class="ai-chat-page__runtime-check">
            <input v-model="canvasEnabled" type="checkbox" :disabled="aiChatStore.isStreaming">
            <span>Canvas</span>
          </label>
          <UiSelect
            v-if="aiPageMode === 'chat'"
            v-model="reasoningEffort"
            class="ai-chat-page__runtime-effort"
            size="sm"
            :options="reasoningEffortOptions"
            :disabled="aiChatStore.isStreaming || !reasoningEnabled"
            placeholder="推理强度"
          />
          <UiInput
            v-if="aiPageMode === 'chat'"
            v-model="reasoningBudgetTokensInput"
            class="ai-chat-page__runtime-number"
            size="sm"
            type="number"
            :min="1"
            :step="512"
            :disabled="aiChatStore.isStreaming || !reasoningEnabled"
            title="推理预算 tokens"
            placeholder="Think"
          />
        </div>
        <p v-if="pageError" class="ai-chat-page__error">{{ pageError }}</p>
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
        :disabled="!canChat || aiChatStore.sending"
        :streaming="aiChatStore.isStreaming"
        @send="send"
        @stop="aiChatStore.stopActiveRun"
      />
    </section>

    <aside class="ai-chat-page__side">
      <div class="ai-chat-page__side-tabs">
        <button type="button" :class="{ active: rightPanelTab === 'canvas' }" @click="rightPanelTab = 'canvas'">
          Canvas
        </button>
        <button type="button" :class="{ active: rightPanelTab === 'settings' }" @click="rightPanelTab = 'settings'">
          设置
        </button>
      </div>
      <AiCanvasPanel
        v-if="rightPanelTab === 'canvas'"
        v-model:canvas-enabled="canvasEnabled"
        :conversation-id="aiChatStore.activeConversationId"
      />
      <AiSettingsPanel v-else />
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.ai-chat-page {
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr) minmax(420px, 520px);
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-muted);
  color: var(--ui-text-primary);
}

.ai-chat-page__main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

.ai-chat-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 12px 18px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-chat-page__title {
  flex: 1 1 220px;
  min-width: 0;

  h2 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 1rem;
    font-weight: 750;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  p {
    margin: 4px 0 0;
    color: var(--ui-text-muted);
    font-size: 0.8rem;
  }
}

.ai-chat-page__runtime {
  display: grid;
  grid-template-columns: 112px minmax(130px, 170px) minmax(140px, 190px) 82px 86px 92px 104px 88px 76px 82px 86px;
  align-items: center;
  gap: 8px;
  flex: 0 1 1180px;
  min-width: 0;
}

.ai-chat-page__mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  min-width: 0;
  padding: 3px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);

  button {
    min-height: 26px;
    border: 0;
    border-radius: calc(var(--ui-radius-sm) - 2px);
    color: var(--ui-text-muted);
    background: transparent;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 650;
    cursor: pointer;

    &.active {
      color: var(--ui-text-primary);
      background: var(--ui-surface-base);
      box-shadow: var(--ui-shadow-xs);
    }
  }
}

.ai-chat-page__runtime-provider,
.ai-chat-page__runtime-model,
.ai-chat-page__runtime-number,
.ai-chat-page__runtime-effort {
  min-width: 0;
}

.ai-chat-page__runtime-toggle,
.ai-chat-page__runtime-check {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
}

.ai-chat-page__error {
  max-width: 28%;
  margin: 0;
  color: var(--ui-danger-text);
  font-size: 0.82rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.ai-chat-page__side {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-left: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-chat-page__side-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 8px;
  border-bottom: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-muted);

  button {
    min-height: 30px;
    border: var(--ui-border-width-thin) solid transparent;
    border-radius: var(--ui-radius-sm);
    color: var(--ui-text-muted);
    background: transparent;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 650;
    cursor: pointer;

    &.active {
      color: var(--ui-text-primary);
      background: var(--ui-surface-base);
      border-color: var(--ui-border-subtle);
    }
  }
}

@media (max-width: 1180px) {
  .ai-chat-page {
    grid-template-columns: 236px minmax(0, 1fr);
  }

  .ai-chat-page__side {
    display: none;
  }

  .ai-chat-page__runtime {
    grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr);
    flex-basis: 320px;
  }

  .ai-chat-page__mode-switch {
    grid-column: 1 / -1;
  }

  .ai-chat-page__runtime-number,
  .ai-chat-page__runtime-toggle,
  .ai-chat-page__runtime-check,
  .ai-chat-page__runtime-effort {
    display: none;
  }
}
</style>
