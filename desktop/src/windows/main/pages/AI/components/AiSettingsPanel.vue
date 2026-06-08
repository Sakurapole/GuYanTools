<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import type { AiReasoningEffort } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCard from '@/windows/main/components/ui/UiCard.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiEmptyState from '@/windows/main/components/ui/UiEmptyState.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { useAiConfigStore } from '@/windows/main/stores/ai_config_store';
import AiProviderDrawer from './AiProviderDrawer.vue';

const aiConfigStore = useAiConfigStore();
const embeddingMessage = ref('');
const embeddingLoading = ref(false);
const providerDrawerVisible = ref(false);
const editingProviderId = ref('');

const reasoningEffortOptions: { label: string; value: AiReasoningEffort }[] = [
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
  { label: '高', value: 'high' },
  { label: '最小', value: 'minimal' },
  { label: '极高', value: 'xhigh' },
];

const form = reactive({
  systemPrompt: '',
  temperature: '0.7',
  maxHistoryMessages: '20',
  reasoningEnabled: false,
  reasoningEffort: 'medium' as AiReasoningEffort,
  reasoningBudgetTokens: '',
  researchEnabled: false,
  maxSources: '20',
  webSearchEndpoint: '',
  webSearchApiKey: '',
  defaultKnowledgeLibraryId: '',
  defaultKnowledgeSpaceId: '',
  embeddingProviderId: '',
  embeddingModelId: '',
  embeddingBatchSize: '32',
});

const embeddingProviderOptions = computed(() => [
  { label: '自动选择 Provider', value: '' },
  ...aiConfigStore.config.providers
    .filter((provider) => provider.enabled)
    .map((provider) => ({
      label: provider.name,
      value: provider.id,
    })),
]);

const selectedEmbeddingProvider = computed(() =>
  aiConfigStore.config.providers.find((provider) => provider.id === form.embeddingProviderId),
);

const embeddingModelOptions = computed(() => [
  { label: '自动选择模型', value: '' },
  ...(selectedEmbeddingProvider.value?.models ?? []).map((model) => ({
    label: model.displayName || model.id,
    value: model.id,
  })),
]);

watch(
  () => aiConfigStore.config,
  (config) => {
    form.systemPrompt = config.chat.defaultSystemPrompt;
    form.temperature = String(config.chat.temperature);
    form.maxHistoryMessages = String(config.chat.maxHistoryMessages);
    form.reasoningEnabled = config.chat.reasoningEnabled;
    form.reasoningEffort = config.chat.reasoningEffort;
    form.reasoningBudgetTokens = config.chat.reasoningBudgetTokens ? String(config.chat.reasoningBudgetTokens) : '';
    form.researchEnabled = config.research.enabled;
    form.maxSources = String(config.research.maxSources);
    form.webSearchEndpoint = config.research.webSearchEndpoint ?? '';
    form.webSearchApiKey = '';
    form.defaultKnowledgeLibraryId = config.research.defaultKnowledgeLibraryId ?? '';
    form.defaultKnowledgeSpaceId = config.research.defaultKnowledgeSpaceId ?? '';
    form.embeddingProviderId = config.research.embeddingProviderId ?? '';
    form.embeddingModelId = config.research.embeddingModelId ?? '';
  },
  { immediate: true },
);

watch(
  () => form.embeddingProviderId,
  () => {
    if (!form.embeddingModelId) {
      return;
    }
    const hasModel = selectedEmbeddingProvider.value?.models.some((model) => model.id === form.embeddingModelId);
    if (!hasModel) {
      form.embeddingModelId = '';
    }
  },
);

async function saveChatSettings() {
  await aiConfigStore.updateConfig({
    chat: {
      defaultSystemPrompt: form.systemPrompt,
      temperature: Number(form.temperature) || 0.7,
      maxHistoryMessages: Math.max(1, Math.round(Number(form.maxHistoryMessages) || 20)),
      reasoningEnabled: form.reasoningEnabled,
      reasoningEffort: form.reasoningEffort,
      reasoningBudgetTokens: positiveIntegerOrUndefined(form.reasoningBudgetTokens),
    },
  });
}

async function saveResearchSettings() {
  await aiConfigStore.updateConfig({
    research: {
      enabled: form.researchEnabled,
      maxSources: Math.max(1, Math.round(Number(form.maxSources) || 20)),
      webSearchEndpoint: form.webSearchEndpoint.trim() || undefined,
      webSearchApiKey: form.webSearchApiKey.trim() || undefined,
      defaultKnowledgeLibraryId: form.defaultKnowledgeLibraryId.trim() || undefined,
      defaultKnowledgeSpaceId: form.defaultKnowledgeSpaceId.trim() || undefined,
      embeddingProviderId: form.embeddingProviderId || undefined,
      embeddingModelId: form.embeddingModelId || undefined,
    },
  });
}

async function loadEmbeddingStats() {
  embeddingLoading.value = true;
  embeddingMessage.value = '';
  try {
    const stats = await aiConfigStore.getKnowledgeEmbeddingStats(buildEmbeddingPayload(false));
    embeddingMessage.value = `Embedding 覆盖：${stats.embeddedCount}/${stats.chunkCount}，目标 ${stats.provider}/${stats.model}`;
  } catch (cause) {
    embeddingMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    embeddingLoading.value = false;
  }
}

async function rebuildEmbeddings() {
  embeddingLoading.value = true;
  embeddingMessage.value = '';
  try {
    const result = await aiConfigStore.rebuildKnowledgeEmbeddings(buildEmbeddingPayload(true));
    embeddingMessage.value = `重建完成：新增 ${result.embeddedChunks}，失败 ${result.failedChunks}，已清理 ${result.deletedEmbeddings}，覆盖 ${result.embeddedCount}/${result.chunkCount}`;
  } catch (cause) {
    embeddingMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    embeddingLoading.value = false;
  }
}

function buildEmbeddingPayload(reset: boolean) {
  return {
    providerId: form.embeddingProviderId || undefined,
    modelId: form.embeddingModelId || undefined,
    batchSize: Math.max(1, Math.round(Number(form.embeddingBatchSize) || 32)),
    reset,
  };
}

function positiveIntegerOrUndefined(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
}

function openProviderDrawer(providerId = '') {
  editingProviderId.value = providerId;
  providerDrawerVisible.value = true;
}
</script>

<template>
  <aside class="ai-settings-panel">
    <section class="ai-settings-panel__section">
      <UiPanelHeader title="模型接入" subtitle="Provider、模型与连接测试">
        <template #actions>
          <UiButton size="sm" variant="primary" @click="openProviderDrawer()">新建 Provider</UiButton>
        </template>
      </UiPanelHeader>

      <UiEmptyState
        v-if="aiConfigStore.config.providers.length === 0"
        compact
        icon="lucide:plug-zap"
        title="暂无 Provider"
        description="添加 Provider 后即可在问答区选择模型。"
      >
        <UiButton size="sm" variant="primary" @click="openProviderDrawer()">添加 Provider</UiButton>
      </UiEmptyState>

      <div v-else class="ai-settings-panel__provider-list">
        <UiCard
          v-for="provider in aiConfigStore.config.providers"
          :key="provider.id"
          class="ai-settings-panel__provider-card"
          padding="sm"
          radius="sm"
        >
          <div class="ai-settings-panel__provider-main">
            <div class="ai-settings-panel__provider-title-row">
              <h4>{{ provider.name }}</h4>
              <span class="ai-settings-panel__provider-kind">{{ provider.kind }}</span>
            </div>
            <p>{{ provider.models[0]?.displayName || provider.models[0]?.id || '未配置模型' }}</p>
            <span class="ai-settings-panel__provider-meta">
              {{ provider.baseUrl || '默认 Endpoint' }}
            </span>
          </div>
          <UiButton size="sm" variant="ghost" @click="openProviderDrawer(provider.id)">编辑</UiButton>
        </UiCard>
      </div>
    </section>

    <section class="ai-settings-panel__section">
      <UiPanelHeader title="问答参数" subtitle="默认提示词、历史长度与推理参数">
        <template #actions>
          <UiButton size="sm" variant="ghost" @click="saveChatSettings">保存</UiButton>
        </template>
      </UiPanelHeader>
      <UiTextarea v-model="form.systemPrompt" :rows="4" resize="vertical" placeholder="默认 System Prompt" />
      <div class="ai-settings-panel__grid">
        <UiInput v-model="form.temperature" size="sm" type="number" :min="0" :max="2" :step="0.1" placeholder="Temperature" />
        <UiInput v-model="form.maxHistoryMessages" size="sm" type="number" :min="1" :max="200" :step="1" placeholder="历史消息数" />
      </div>
      <UiCheckbox v-model="form.reasoningEnabled" size="sm">默认启用深度思考</UiCheckbox>
      <div class="ai-settings-panel__grid">
        <UiSelect v-model="form.reasoningEffort" :options="reasoningEffortOptions" size="sm" />
        <UiInput v-model="form.reasoningBudgetTokens" size="sm" type="number" :min="1" :step="512" placeholder="推理预算 tokens" />
      </div>
    </section>

    <section class="ai-settings-panel__section">
      <UiPanelHeader title="引用检索" subtitle="联网搜索、知识库与 Embedding">
        <template #actions>
          <UiButton size="sm" variant="ghost" @click="saveResearchSettings">保存</UiButton>
        </template>
      </UiPanelHeader>
      <UiCheckbox v-model="form.researchEnabled" size="sm">启用搜索/知识库引用</UiCheckbox>
      <UiInput v-model="form.maxSources" size="sm" type="number" :min="1" :max="200" :step="1" placeholder="最大来源数" />
      <UiInput v-model="form.webSearchEndpoint" size="sm" placeholder="Web Search Endpoint（POST JSON）" />
      <UiInput v-model="form.webSearchApiKey" size="sm" type="password" placeholder="Web Search API Key，留空不修改" />
      <UiInput v-model="form.defaultKnowledgeLibraryId" size="sm" placeholder="默认知识库 Library ID，可留空" />
      <UiInput v-model="form.defaultKnowledgeSpaceId" size="sm" placeholder="默认知识库 Space ID，可留空" />
      <UiSelect v-model="form.embeddingProviderId" :options="embeddingProviderOptions" size="sm" />
      <UiSelect v-model="form.embeddingModelId" :options="embeddingModelOptions" size="sm" />
      <UiInput v-model="form.embeddingBatchSize" size="sm" type="number" :min="1" :max="128" :step="1" placeholder="Embedding 批大小" />
      <div class="ai-settings-panel__actions">
        <UiButton size="sm" :disabled="embeddingLoading" @click="loadEmbeddingStats">统计</UiButton>
        <UiButton size="sm" variant="primary" :disabled="embeddingLoading" @click="rebuildEmbeddings">重建 Embedding</UiButton>
      </div>
      <p v-if="embeddingMessage" class="ai-settings-panel__message">{{ embeddingMessage }}</p>
    </section>

    <AiProviderDrawer
      v-model="providerDrawerVisible"
      v-model:provider-id="editingProviderId"
    />
  </aside>
</template>

<style lang="scss" scoped>
.ai-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  height: 100%;
  padding: 14px;
  border-left: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
  overflow: auto;
}

.ai-settings-panel__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-settings-panel__actions,
.ai-settings-panel__grid {
  display: flex;
  gap: 8px;
}

.ai-settings-panel__grid > * {
  min-width: 0;
  flex: 1;
}

.ai-settings-panel__provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-settings-panel__provider-card {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: var(--ui-surface-overlay);
}

.ai-settings-panel__provider-main {
  min-width: 0;
  flex: 1 1 auto;
}

.ai-settings-panel__provider-title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;

  h4 {
    margin: 0;
    overflow: hidden;
    color: var(--ui-text-primary);
    font-size: 0.9rem;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ai-settings-panel__provider-kind {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-xs);
  color: var(--ui-text-muted);
  font-size: 0.72rem;
  line-height: 1.2;
  white-space: nowrap;
}

.ai-settings-panel__provider-card p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--ui-text-secondary);
  font-size: 0.8rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-settings-panel__provider-meta {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-settings-panel__message {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
  word-break: break-word;
}

</style>
