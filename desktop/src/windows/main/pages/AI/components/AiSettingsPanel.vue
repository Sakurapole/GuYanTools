<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import type { AiProviderConfig, AiProviderKind, AiReasoningEffort, AiSafeProviderConfig } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { createAiModelConfig, createAiProviderConfig, useAiConfigStore } from '@/windows/main/stores/ai_config_store';

const aiConfigStore = useAiConfigStore();
const testMessage = ref('');
const testing = ref(false);
const embeddingMessage = ref('');
const embeddingLoading = ref(false);

const providerKindOptions: { label: string; value: AiProviderKind }[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google Gemini', value: 'google' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Vercel AI Gateway', value: 'vercel-gateway' },
];
const reasoningEffortOptions: { label: string; value: AiReasoningEffort }[] = [
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
  { label: '高', value: 'high' },
  { label: '最小', value: 'minimal' },
  { label: '极高', value: 'xhigh' },
];

const selectedProviderId = ref('');
const form = reactive({
  id: '',
  name: '',
  kind: 'openai-compatible' as AiProviderKind,
  baseUrl: '',
  apiKey: '',
  modelId: '',
  modelName: '',
  modelEmbedding: false,
  modelReasoning: false,
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

const providerOptions = computed(() => [
  { label: '新建 Provider', value: '' },
  ...aiConfigStore.config.providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  })),
]);

const selectedProvider = computed(() =>
  aiConfigStore.config.providers.find((provider) => provider.id === selectedProviderId.value),
);

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
    if (!selectedProviderId.value && config.providers[0]) {
      selectedProviderId.value = config.providers[0].id;
    }
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

watch(selectedProvider, (provider) => {
  if (!provider) {
    resetProviderForm();
    return;
  }

  const model = provider.models[0];
  form.id = provider.id;
  form.name = provider.name;
  form.kind = provider.kind;
  form.baseUrl = provider.baseUrl ?? '';
  form.apiKey = '';
  form.modelId = model?.providerModelId || model?.id || '';
  form.modelName = model?.displayName || '';
  form.modelEmbedding = model?.capabilities.embedding ?? false;
  form.modelReasoning = model?.capabilities.reasoning ?? false;
}, { immediate: true });

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

function resetProviderForm() {
  form.id = '';
  form.name = '';
  form.kind = 'openai-compatible';
  form.baseUrl = '';
  form.apiKey = '';
  form.modelId = '';
  form.modelName = '';
  form.modelEmbedding = false;
  form.modelReasoning = false;
}

function buildProvider(): AiProviderConfig {
  const id = form.id.trim();
  const modelId = form.modelId.trim();
  const current = selectedProvider.value;
  const model = createAiModelConfig({
    id: modelId,
    providerModelId: modelId,
    displayName: form.modelName.trim() || modelId,
    capabilities: {
      ...currentModelCapabilities(current),
      embedding: form.modelEmbedding,
      reasoning: form.modelReasoning,
    },
  });

  return {
    ...createAiProviderConfig({
      id,
      kind: form.kind,
      name: form.name.trim() || id,
      baseUrl: form.baseUrl.trim() || undefined,
      apiKey: form.apiKey.trim() || undefined,
      models: [model],
      enabled: true,
    }),
    createdAt: current?.createdAt ?? Date.now(),
  };
}

function currentModelCapabilities(provider?: AiSafeProviderConfig) {
  return provider?.models[0]?.capabilities ?? {
    streaming: true,
    toolCalling: form.kind !== 'ollama',
    structuredOutput: form.kind !== 'ollama',
  };
}

function canSaveProvider() {
  return Boolean(form.id.trim() && form.modelId.trim());
}

async function saveProvider() {
  if (!canSaveProvider()) {
    return;
  }

  const provider = buildProvider();
  const providers = [
    ...aiConfigStore.config.providers
      .filter((item) => item.id !== selectedProviderId.value && item.id !== provider.id)
      .map((item) => ({ ...item }) as AiProviderConfig),
    provider,
  ];
  await aiConfigStore.saveProviders(providers, {
    providerId: provider.id,
    modelId: provider.models[0]?.id,
  });
  selectedProviderId.value = provider.id;
}

async function deleteProvider() {
  if (!selectedProviderId.value) {
    return;
  }

  const providers = aiConfigStore.config.providers
    .filter((provider) => provider.id !== selectedProviderId.value)
    .map((provider) => ({ ...provider }) as AiProviderConfig);
  await aiConfigStore.saveProviders(providers, {
    providerId: providers[0]?.id,
    modelId: providers[0]?.models[0]?.id,
  });
  selectedProviderId.value = providers[0]?.id ?? '';
}

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

async function testProvider() {
  if (!canSaveProvider()) {
    return;
  }

  testing.value = true;
  testMessage.value = '';
  try {
    const result = await aiConfigStore.testProvider({
      provider: buildProvider(),
      modelId: form.modelId.trim(),
    });
    testMessage.value = result.message;
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <aside class="ai-settings-panel">
    <section class="ai-settings-panel__section">
      <UiPanelHeader title="模型接入" subtitle="Provider、模型与连接测试">
        <template #actions>
          <UiButton size="sm" variant="ghost" @click="selectedProviderId = ''">新建</UiButton>
        </template>
      </UiPanelHeader>

      <UiSelect v-model="selectedProviderId" :options="providerOptions" size="sm" />
      <UiSelect v-model="form.kind" :options="providerKindOptions" size="sm" />
      <UiInput v-model="form.id" size="sm" placeholder="Provider ID，例如 openai-main" />
      <UiInput v-model="form.name" size="sm" placeholder="显示名称" />
      <UiInput v-model="form.baseUrl" size="sm" placeholder="Base URL，可留空" />
      <UiInput v-model="form.apiKey" size="sm" type="password" :placeholder="selectedProvider?.hasApiKey ? '已保存，留空表示不修改' : 'API Key'" />
      <UiInput v-model="form.modelId" size="sm" placeholder="模型 ID，例如 provider 原始模型名" />
      <UiInput v-model="form.modelName" size="sm" placeholder="模型显示名，可留空" />
      <UiCheckbox v-model="form.modelEmbedding" size="sm">支持 Embedding</UiCheckbox>
      <UiCheckbox v-model="form.modelReasoning" size="sm">支持推理</UiCheckbox>

      <div class="ai-settings-panel__actions">
        <UiButton size="sm" variant="primary" :disabled="!canSaveProvider() || aiConfigStore.saving" @click="saveProvider">保存</UiButton>
        <UiButton size="sm" :disabled="!canSaveProvider() || testing" @click="testProvider">测试</UiButton>
        <UiButton v-if="selectedProviderId" size="sm" variant="danger" @click="deleteProvider">删除</UiButton>
      </div>
      <p v-if="testMessage" class="ai-settings-panel__message">{{ testMessage }}</p>
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

.ai-settings-panel__message {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
  word-break: break-word;
}

</style>
