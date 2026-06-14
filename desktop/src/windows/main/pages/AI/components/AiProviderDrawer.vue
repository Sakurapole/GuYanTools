<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import type { AiModelCapabilities, AiProviderConfig, AiProviderKind, AiSafeProviderConfig } from '@/contracts/ai';
import {
  getModelCapabilityBadges,
  groupModelsByPrefix,
  inferModelCapabilities,
  isEmbeddingModelId,
  isFreeModelId,
  isRerankModelId,
  isWebSearchModelId,
} from '@/windows/main/pages/AI/ai_model_display';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiDrawer from '@/windows/main/components/ui/UiDrawer.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import { createAiModelConfig, createAiProviderConfig, useAiConfigStore } from '@/windows/main/stores/ai_config_store';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  providerId?: string;
  teleported?: boolean;
  teleportTo?: string;
  fixed?: boolean;
  overlay?: boolean;
  closeOnMask?: boolean;
}>(), {
  providerId: '',
  teleported: true,
  teleportTo: 'body',
  fixed: true,
  overlay: true,
  closeOnMask: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:providerId': [value: string];
}>();

type ProviderModelDraft = {
  uid: string;
  id: string;
  name: string;
  embedding: boolean;
  reasoning: boolean;
  vision: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  nativeWebSearch: boolean;
};

type ModelFilterKey = 'all' | 'reasoning' | 'vision' | 'web' | 'free' | 'embedding' | 'rerank' | 'tool';

const aiConfigStore = useAiConfigStore();
const testMessage = ref('');
const testing = ref(false);
const fetchingModels = ref(false);
const modelDrafts = ref<ProviderModelDraft[]>([]);
const fetchedModelDrafts = ref<ProviderModelDraft[]>([]);
const modelPickerVisible = ref(false);
const modelPickerSearch = ref('');
const modelPickerFilter = ref<ModelFilterKey>('all');
const expandedModelGroups = ref<Record<string, boolean>>({});

const providerKindOptions: { label: string; value: AiProviderKind }[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google Gemini', value: 'google' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
  { label: 'Ollama', value: 'ollama' },
  { label: 'Vercel AI Gateway', value: 'vercel-gateway' },
];

const providerForm = reactive({
  id: '',
  name: '',
  kind: 'openai-compatible' as AiProviderKind,
  baseUrl: '',
  apiKey: '',
});

const selectedProvider = computed(() =>
  aiConfigStore.config.providers.find((provider) => provider.id === props.providerId),
);

const validModelDrafts = computed(() => modelDrafts.value.filter((model) => model.id.trim()));
const drawerTitle = computed(() => props.providerId ? '编辑 Provider' : '新建 Provider');
const drawerSubtitle = computed(() =>
  props.providerId ? '更新接入口、API Key 与模型列表' : '配置新的模型接入口，可一次添加多个模型',
);
const modelPickerTitle = computed(() => `${providerForm.name.trim() || providerForm.id.trim() || 'Provider'} 模型`);
const existingModelIds = computed(() =>
  new Set(modelDrafts.value.map((model) => model.id.trim()).filter(Boolean)),
);
const groupedModelDrafts = computed(() => groupModelsByPrefix(modelDrafts.value));
const filteredFetchedModels = computed(() => fetchedModelDrafts.value.filter((model) => {
  const keyword = modelPickerSearch.value.trim().toLowerCase();
  const modelId = model.id.trim();
  if (keyword && !`${model.id} ${model.name}`.toLowerCase().includes(keyword)) {
    return false;
  }
  return matchesModelFilter(model, modelPickerFilter.value);
}));
const groupedFetchedModels = computed(() => groupModelsByPrefix(filteredFetchedModels.value));
const selectableFetchedCount = computed(() =>
  filteredFetchedModels.value.filter((model) => !existingModelIds.value.has(model.id.trim())).length,
);

const modelFilterOptions: { key: ModelFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'reasoning', label: '推理' },
  { key: 'vision', label: '视觉' },
  { key: 'web', label: '联网' },
  { key: 'free', label: '免费' },
  { key: 'embedding', label: '嵌入' },
  { key: 'rerank', label: '重排' },
  { key: 'tool', label: '工具' },
];

watch(
  () => [props.modelValue, props.providerId, selectedProvider.value] as const,
  ([visible]) => {
    if (!visible) {
      return;
    }
    hydrateProviderForm(selectedProvider.value);
  },
  { immediate: true },
);

watch(
  () => providerForm.kind,
  () => {
    if (!modelDrafts.value.length) {
      return;
    }
    modelDrafts.value = modelDrafts.value.map((model) => ({
      ...model,
      toolCalling: model.toolCalling && providerForm.kind !== 'ollama',
      structuredOutput: model.structuredOutput && providerForm.kind !== 'ollama',
    }));
  },
);

function createModelDraft(input: Partial<ProviderModelDraft> = {}): ProviderModelDraft {
  const timestamp = Date.now();
  return {
    uid: input.uid || `model-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    id: input.id ?? '',
    name: input.name ?? '',
    embedding: input.embedding ?? false,
    reasoning: input.reasoning ?? false,
    vision: input.vision ?? false,
    toolCalling: input.toolCalling ?? providerForm.kind !== 'ollama',
    structuredOutput: input.structuredOutput ?? providerForm.kind !== 'ollama',
    streaming: input.streaming ?? true,
    nativeWebSearch: input.nativeWebSearch ?? false,
  };
}

function hydrateProviderForm(provider?: AiSafeProviderConfig) {
  testMessage.value = '';
  if (!provider) {
    resetProviderForm();
    return;
  }

  providerForm.id = provider.id;
  providerForm.name = provider.name;
  providerForm.kind = provider.kind;
  providerForm.baseUrl = provider.baseUrl ?? '';
  providerForm.apiKey = '';
  modelDrafts.value = provider.models.length
    ? provider.models.map((model, index) => createModelDraft({
      uid: `${provider.id}-${index}-${model.id}-${Date.now()}`,
      id: model.providerModelId || model.id,
      name: model.displayName || '',
      embedding: model.capabilities.embedding,
      reasoning: model.capabilities.reasoning,
      vision: model.capabilities.vision,
      toolCalling: model.capabilities.toolCalling,
      structuredOutput: model.capabilities.structuredOutput,
      streaming: model.capabilities.streaming,
      nativeWebSearch: model.capabilities.nativeWebSearch,
    }))
    : [createModelDraft()];
}

function resetProviderForm() {
  providerForm.id = '';
  providerForm.name = '';
  providerForm.kind = 'openai-compatible';
  providerForm.baseUrl = '';
  providerForm.apiKey = '';
  modelDrafts.value = [createModelDraft()];
}

function currentModelCapabilities(modelId: string): Partial<AiModelCapabilities> {
  const currentModel = selectedProvider.value?.models.find((model) =>
    model.id === modelId || model.providerModelId === modelId,
  );
  return currentModel?.capabilities ?? {
    streaming: true,
    toolCalling: providerForm.kind !== 'ollama',
    structuredOutput: providerForm.kind !== 'ollama',
  };
}

function buildProvider(): AiProviderConfig {
  const id = providerForm.id.trim();
  const current = selectedProvider.value;
  const models = validModelDrafts.value.map((draft) => {
    const modelId = draft.id.trim();
    return createAiModelConfig({
      id: modelId,
      providerModelId: modelId,
      displayName: draft.name.trim() || modelId,
      capabilities: {
        ...currentModelCapabilities(modelId),
        embedding: draft.embedding,
        reasoning: draft.reasoning,
        vision: draft.vision,
        toolCalling: draft.toolCalling,
        structuredOutput: draft.structuredOutput,
        streaming: draft.streaming,
        nativeWebSearch: draft.nativeWebSearch,
      },
    });
  });

  return {
    ...createAiProviderConfig({
      id,
      kind: providerForm.kind,
      name: providerForm.name.trim() || id,
      baseUrl: providerForm.baseUrl.trim() || undefined,
      apiKey: providerForm.apiKey.trim() || undefined,
      models,
      enabled: true,
    }),
    createdAt: current?.createdAt ?? Date.now(),
  };
}

function canSaveProvider() {
  return Boolean(providerForm.id.trim() && validModelDrafts.value.length > 0);
}

function addModel() {
  modelDrafts.value = [...modelDrafts.value, createModelDraft()];
}

function removeModel(uid: string) {
  if (modelDrafts.value.length <= 1) {
    modelDrafts.value = [createModelDraft()];
    return;
  }
  modelDrafts.value = modelDrafts.value.filter((model) => model.uid !== uid);
}

function modelCapabilities(model: ProviderModelDraft): Partial<AiModelCapabilities> {
  return {
    streaming: model.streaming,
    reasoning: model.reasoning,
    embedding: model.embedding,
    vision: model.vision,
    toolCalling: model.toolCalling,
    structuredOutput: model.structuredOutput,
    nativeWebSearch: model.nativeWebSearch,
  };
}

function capabilityBadges(model: ProviderModelDraft) {
  return getModelCapabilityBadges(modelCapabilities(model));
}

function matchesModelFilter(model: ProviderModelDraft, filter: ModelFilterKey) {
  const id = model.id.trim();
  if (filter === 'all') return true;
  if (filter === 'reasoning') return model.reasoning;
  if (filter === 'vision') return model.vision;
  if (filter === 'web') return model.nativeWebSearch || isWebSearchModelId(id);
  if (filter === 'free') return isFreeModelId(id);
  if (filter === 'embedding') return model.embedding || isEmbeddingModelId(id);
  if (filter === 'rerank') return isRerankModelId(id);
  return model.toolCalling;
}

function createFetchedModelDraft(id: string) {
  const capabilities = inferModelCapabilities(id, providerForm.kind);
  return createModelDraft({
    id,
    name: id,
    streaming: capabilities.streaming,
    embedding: capabilities.embedding,
    reasoning: capabilities.reasoning,
    vision: capabilities.vision,
    toolCalling: capabilities.toolCalling,
    structuredOutput: capabilities.structuredOutput,
    nativeWebSearch: capabilities.nativeWebSearch,
  });
}

function isModelAdded(model: ProviderModelDraft) {
  return existingModelIds.value.has(model.id.trim());
}

function addFetchedModel(model: ProviderModelDraft) {
  const modelId = model.id.trim();
  if (!modelId || existingModelIds.value.has(modelId)) {
    return false;
  }

  const draft = createModelDraft({
    id: modelId,
    name: model.name.trim() || modelId,
    streaming: model.streaming,
    embedding: model.embedding,
    reasoning: model.reasoning,
    vision: model.vision,
    toolCalling: model.toolCalling,
    structuredOutput: model.structuredOutput,
    nativeWebSearch: model.nativeWebSearch,
  });
  const currentDrafts = modelDrafts.value.filter((item) => item.id.trim() || item.name.trim());
  modelDrafts.value = [...currentDrafts, draft];
  return true;
}

function addFetchedModels(models: ProviderModelDraft[]) {
  let added = 0;
  for (const model of models) {
    if (addFetchedModel(model)) {
      added += 1;
    }
  }
  testMessage.value = added ? `已添加 ${added} 个模型` : '没有可新增的模型';
}

function toggleModelGroup(prefix: string) {
  expandedModelGroups.value = {
    ...expandedModelGroups.value,
    [prefix]: !(expandedModelGroups.value[prefix] ?? true),
  };
}

function isModelGroupExpanded(prefix: string) {
  return expandedModelGroups.value[prefix] ?? true;
}

async function saveProvider() {
  if (!canSaveProvider()) {
    return;
  }

  const provider = buildProvider();
  const providers = [
    ...aiConfigStore.config.providers
      .filter((item) => item.id !== props.providerId && item.id !== provider.id)
      .map((item) => ({ ...item }) as AiProviderConfig),
    provider,
  ];
  await aiConfigStore.saveProviders(providers, {
    providerId: provider.id,
    modelId: provider.models[0]?.id,
  });
  emit('update:providerId', provider.id);
  emit('update:modelValue', false);
}

async function deleteProvider() {
  if (!props.providerId) {
    return;
  }

  const providers = aiConfigStore.config.providers
    .filter((provider) => provider.id !== props.providerId)
    .map((provider) => ({ ...provider }) as AiProviderConfig);
  await aiConfigStore.saveProviders(providers, {
    providerId: providers[0]?.id,
    modelId: providers[0]?.models[0]?.id,
  });
  emit('update:providerId', providers[0]?.id ?? '');
  emit('update:modelValue', false);
}

async function testProvider() {
  if (!canSaveProvider()) {
    return;
  }

  const firstModelId = validModelDrafts.value[0]?.id.trim();
  if (!firstModelId) {
    return;
  }

  testing.value = true;
  testMessage.value = '';
  try {
    const result = await aiConfigStore.testProvider({
      provider: buildProvider(),
      modelId: firstModelId,
    });
    testMessage.value = result.message;
  } catch (cause) {
    testMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    testing.value = false;
  }
}

async function fetchProviderModels() {
  fetchingModels.value = true;
  testMessage.value = '';
  try {
    const result = await aiConfigStore.fetchProviderModels({
      providerId: props.providerId || undefined,
      kind: providerForm.kind,
      baseUrl: providerForm.baseUrl.trim() || undefined,
      apiKey: providerForm.apiKey.trim() || undefined,
    });
    fetchedModelDrafts.value = result.models
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => createFetchedModelDraft(id));
    expandedModelGroups.value = Object.fromEntries(
      groupModelsByPrefix(fetchedModelDrafts.value).map((group) => [group.prefix, true]),
    );
    modelPickerSearch.value = '';
    modelPickerFilter.value = 'all';
    modelPickerVisible.value = true;
    testMessage.value = `已拉取 ${result.models.length} 个模型，请在弹窗中选择添加`;
  } catch (cause) {
    testMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    fetchingModels.value = false;
  }
}
</script>

<template>
  <UiDrawer
    class="ai-provider-drawer"
    :model-value="modelValue"
    width="560px"
    :teleported="teleported"
    :teleport-to="teleportTo"
    :fixed="fixed"
    :overlay="overlay"
    :close-on-mask="closeOnMask"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <template #header>
      <UiPanelHeader :title="drawerTitle" :subtitle="drawerSubtitle" />
    </template>

    <form class="ai-provider-drawer__form" @submit.prevent="saveProvider">
      <UiSelect v-model="providerForm.kind" :options="providerKindOptions" size="sm" />
      <UiInput v-model="providerForm.id" size="sm" placeholder="Provider ID，例如 openai-main" />
      <UiInput v-model="providerForm.name" size="sm" placeholder="显示名称" />
      <UiInput v-model="providerForm.baseUrl" size="sm" placeholder="Base URL，可留空" />
      <UiInput
        v-model="providerForm.apiKey"
        size="sm"
        type="password"
        :placeholder="selectedProvider?.hasApiKey ? '已保存，留空表示不修改' : 'API Key'"
      />

      <section class="ai-provider-drawer__models">
        <div class="ai-provider-drawer__models-head">
          <div>
            <h3>模型列表</h3>
            <p>同一个接入口可以配置多个聊天、推理或 Embedding 模型。</p>
          </div>
          <div class="ai-provider-drawer__model-actions">
            <UiButton size="sm" variant="ghost" :disabled="fetchingModels" @click.prevent="fetchProviderModels">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:download-cloud" :size="14" />
              </template>
              拉取模型
            </UiButton>
            <UiButton size="sm" variant="ghost" @click.prevent="addModel">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:plus" :size="14" />
              </template>
              添加模型
            </UiButton>
          </div>
        </div>

        <section
          v-for="group in groupedModelDrafts"
          :key="group.prefix"
          class="ai-provider-drawer__model-group"
        >
          <div class="ai-provider-drawer__model-group-head">
            <strong>{{ group.prefix }}</strong>
            <span>{{ group.items.length }}</span>
          </div>
          <article
            v-for="model in group.items"
            :key="model.uid"
            class="ai-provider-drawer__model-card"
          >
            <div class="ai-provider-drawer__model-title">
              <span>{{ model.id || '未命名模型' }}</span>
              <div class="ai-provider-drawer__model-title-actions">
                <div class="ai-model-capabilities" aria-label="模型能力">
                  <span
                    v-for="badge in capabilityBadges(model)"
                    :key="badge.key"
                    class="ai-model-capability"
                    :class="`ai-model-capability--${badge.key}`"
                    :title="badge.label"
                  >
                    <IconRenderer :icon="badge.icon" :size="12" />
                  </span>
                </div>
                <UiButton size="sm" variant="danger" @click.prevent="removeModel(model.uid)">移除</UiButton>
              </div>
            </div>
            <div class="ai-provider-drawer__model-fields">
              <UiInput v-model="model.id" size="sm" placeholder="模型 ID，例如 provider 原始模型名" />
              <UiInput v-model="model.name" size="sm" placeholder="显示名，可留空" />
            </div>
            <div class="ai-provider-drawer__checks">
              <UiCheckbox v-model="model.streaming" size="sm">流式输出</UiCheckbox>
              <UiCheckbox v-model="model.reasoning" size="sm">推理</UiCheckbox>
              <UiCheckbox v-model="model.embedding" size="sm">Embedding</UiCheckbox>
              <UiCheckbox v-model="model.vision" size="sm">视觉</UiCheckbox>
              <UiCheckbox v-model="model.nativeWebSearch" size="sm">联网</UiCheckbox>
              <UiCheckbox v-model="model.toolCalling" size="sm" :disabled="providerForm.kind === 'ollama'">工具调用</UiCheckbox>
              <UiCheckbox v-model="model.structuredOutput" size="sm" :disabled="providerForm.kind === 'ollama'">结构化输出</UiCheckbox>
            </div>
          </article>
        </section>
      </section>

      <p v-if="testMessage" class="ai-provider-drawer__message">{{ testMessage }}</p>
    </form>

    <template #footer>
      <div class="ai-provider-drawer__footer">
        <UiButton
          v-if="providerId"
          size="sm"
          variant="danger"
          @click="deleteProvider"
        >
          删除
        </UiButton>
        <div class="ai-provider-drawer__footer-spacer" />
        <UiButton size="sm" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton size="sm" :disabled="!canSaveProvider() || testing || fetchingModels" @click="testProvider">测试首个模型</UiButton>
        <UiButton
          size="sm"
          variant="primary"
          :disabled="!canSaveProvider() || aiConfigStore.saving || fetchingModels"
          @click="saveProvider"
        >
          保存
        </UiButton>
      </div>
    </template>
  </UiDrawer>

  <UiDialog
    class="ai-model-picker"
    :model-value="modelPickerVisible"
    width="980px"
    max-width="calc(100vw - 48px)"
    @update:modelValue="modelPickerVisible = $event"
  >
    <template #header>
      <div class="ai-model-picker__header">
        <UiPanelHeader :title="modelPickerTitle" subtitle="搜索并选择要添加到当前 Provider 的模型" />
        <button type="button" class="ai-model-picker__icon-button" title="关闭" @click="modelPickerVisible = false">
          <IconRenderer icon="iconify:lucide:x" :size="18" />
        </button>
      </div>
    </template>

    <div class="ai-model-picker__body">
      <div class="ai-model-picker__toolbar">
        <UiInput v-model="modelPickerSearch" size="sm" placeholder="搜索模型 ID 或名称" />
        <button
          type="button"
          class="ai-model-picker__icon-button ai-model-picker__icon-button--framed"
          title="添加筛选结果"
          :disabled="selectableFetchedCount === 0"
          @click="addFetchedModels(filteredFetchedModels)"
        >
          <IconRenderer icon="iconify:lucide:list-plus" :size="17" />
        </button>
        <button
          type="button"
          class="ai-model-picker__icon-button ai-model-picker__icon-button--framed"
          title="重新拉取"
          :disabled="fetchingModels"
          @click="fetchProviderModels"
        >
          <IconRenderer icon="iconify:lucide:refresh-cw" :size="17" />
        </button>
      </div>

      <div class="ai-model-picker__filters" role="tablist" aria-label="模型能力筛选">
        <button
          v-for="filter in modelFilterOptions"
          :key="filter.key"
          type="button"
          :class="{ 'is-active': modelPickerFilter === filter.key }"
          role="tab"
          :aria-selected="modelPickerFilter === filter.key"
          @click="modelPickerFilter = filter.key"
        >
          {{ filter.label }}
        </button>
      </div>

      <div v-if="groupedFetchedModels.length" class="ai-model-picker-list">
        <div
          v-for="group in groupedFetchedModels"
          :key="group.prefix"
          class="ai-model-picker-group"
        >
          <div class="ai-model-picker-group__head" @click="toggleModelGroup(group.prefix)">
            <div class="ai-model-picker-group__title">
              <IconRenderer
                :icon="isModelGroupExpanded(group.prefix) ? 'iconify:lucide:chevron-down' : 'iconify:lucide:chevron-right'"
                :size="15"
              />
              <span class="ai-model-picker-group__name">{{ group.prefix }}</span>
              <span class="ai-model-picker-group__count">{{ group.items.length }}</span>
            </div>
            <button
              type="button"
              class="ai-model-picker__icon-button ai-model-picker-group__add"
              title="添加本组"
              @click.stop="addFetchedModels(group.items)"
            >
              <IconRenderer icon="iconify:lucide:plus" :size="17" />
            </button>
          </div>
          <div v-if="isModelGroupExpanded(group.prefix)" class="ai-model-picker-group__body">
            <div
              v-for="model in group.items"
              :key="model.uid"
              class="ai-model-picker-row"
              :class="{ 'is-added': isModelAdded(model) }"
            >
              <span class="ai-model-picker__avatar" aria-hidden="true">
                {{ group.prefix.slice(0, 1).toUpperCase() }}
              </span>
              <span class="ai-model-picker-row__name" :title="model.name || model.id">{{ model.name || model.id }}</span>
              <div class="ai-model-picker-row__caps ai-model-capabilities" aria-label="模型能力">
                <span
                  v-for="badge in capabilityBadges(model)"
                  :key="badge.key"
                  class="ai-model-capability"
                  :class="`ai-model-capability--${badge.key}`"
                  :title="badge.label"
                >
                  <IconRenderer :icon="badge.icon" :size="12" />
                </span>
              </div>
              <button
                type="button"
                class="ai-model-picker__icon-button ai-model-picker-row__add"
                :title="isModelAdded(model) ? '已添加' : '添加模型'"
                :disabled="isModelAdded(model)"
                @click="addFetchedModel(model)"
              >
                <IconRenderer :icon="isModelAdded(model) ? 'iconify:lucide:check' : 'iconify:lucide:plus'" :size="18" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="ai-model-picker__empty">没有匹配的模型</p>
    </div>

    <template #footer>
      <div class="ai-model-picker__footer">
        <span>已拉取 {{ fetchedModelDrafts.length }} 个，可添加 {{ selectableFetchedCount }} 个，已配置 {{ validModelDrafts.length }} 个</span>
        <UiButton size="sm" variant="primary" @click="modelPickerVisible = false">完成</UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<style lang="scss" scoped>
.ai-provider-drawer__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
}

.ai-provider-drawer__models {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.ai-provider-drawer__models-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ai-provider-drawer__models-head h3 {
  margin: 0;
  color: var(--ui-text-primary);
  font-size: 0.92rem;
  font-weight: 740;
  line-height: 1.35;
}

.ai-provider-drawer__models-head p {
  margin: 3px 0 0;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.ai-provider-drawer__model-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.ai-provider-drawer__model-group {
  display: grid;
  gap: 8px;
}

.ai-provider-drawer__model-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 2px;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-xs);

  strong {
    color: var(--ui-text-primary);
    font-weight: 720;
  }

  span {
    display: inline-flex;
    min-width: 20px;
    min-height: 18px;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ui-primary-color, #4f9cff) 16%, transparent);
    color: var(--ui-primary-color, #4f9cff);
    font-size: 0.72rem;
    font-weight: 700;
  }
}

.ai-provider-drawer__model-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.ai-provider-drawer__model-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ui-text-secondary);
  font-size: 0.8rem;
  font-weight: 680;

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ai-provider-drawer__model-title-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.ai-provider-drawer__model-fields {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 8px;
}

.ai-provider-drawer__checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.ai-provider-drawer__message {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
  word-break: break-word;
}

.ai-provider-drawer__footer {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.ai-provider-drawer__footer-spacer {
  flex: 1 1 auto;
}

.ai-model-capabilities {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
}

.ai-model-capability {
  display: inline-flex;
  width: 28px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--ui-text-muted);
}

.ai-model-capability--vision {
  background: rgba(34, 197, 94, 0.14);
  color: #10b981;
}

.ai-model-capability--web {
  background: rgba(59, 130, 246, 0.14);
  color: #3b82f6;
}

.ai-model-capability--reasoning {
  background: rgba(99, 102, 241, 0.14);
  color: #6366f1;
}

.ai-model-capability--embedding,
.ai-model-capability--structured {
  background: rgba(100, 116, 139, 0.14);
  color: #64748b;
}

.ai-model-capability--tool {
  background: rgba(249, 115, 22, 0.14);
  color: #f97316;
}

.ai-model-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
}

.ai-model-picker__body {
  display: flex;
  min-height: 0;
  max-height: min(680px, calc(100vh - 210px));
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  overflow: hidden;
}

.ai-model-picker__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.ai-model-picker__icon-button {
  appearance: none;
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.ai-model-picker__icon-button--framed {
  width: 40px;
  height: 40px;
  border: 1px solid var(--ui-border-subtle);
  background: var(--ui-surface-overlay);
}

.ai-model-picker__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  border-bottom: 1px solid var(--ui-border-subtle);

  button {
    appearance: none;
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ui-text-secondary);
    font: inherit;
    font-size: var(--ui-font-size-sm);
    cursor: pointer;

    &.is-active {
      border-bottom-color: var(--ui-primary-color, #4f9cff);
      color: var(--ui-primary-color, #4f9cff);
      font-weight: 680;
    }
  }
}

.ai-model-picker-list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 8px 8px 4px 0;
}

.ai-model-picker-group {
  display: block;
  border: 1px solid var(--ui-border-subtle, rgba(120, 145, 165, 0.28));
  border-radius: var(--ui-radius-md, 8px);
  background: var(--ui-surface-base, #fff);
}

.ai-model-picker-group__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  min-height: 44px;
  padding: 0 8px 0 12px;
  background: var(--ui-input-bg, #f3f6f9);
  color: var(--ui-text-primary, #18364a);
  cursor: pointer;
}

.ai-model-picker-group__title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.ai-model-picker-group__name {
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary, #18364a);
  font-size: 0.88rem;
  font-weight: 760;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-model-picker-group__count {
  display: inline-flex;
  min-width: 22px;
  min-height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.16);
  color: #10b981;
  font-size: 0.72rem;
  font-weight: 760;
  line-height: 1;
}

.ai-model-picker-group__add {
  justify-self: end;
}

.ai-model-picker-group__body {
  display: block;
  background: var(--ui-surface-base, #fff);
}

.ai-model-picker-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) minmax(120px, auto) 36px;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 8px 10px 8px 12px;
  border-top: 1px solid var(--ui-border-subtle, rgba(120, 145, 165, 0.24));
  background: var(--ui-surface-base, #fff);
  color: var(--ui-text-primary, #18364a);

  &.is-added {
    background: color-mix(in srgb, var(--ui-surface-base, #fff) 86%, var(--ui-input-bg, #f3f6f9));
  }
}

.ai-model-picker-row__name {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary, #18364a);
  font-size: 0.9rem;
  font-weight: 620;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-model-picker-row__caps {
  justify-content: flex-end;
}

.ai-model-picker-row__add {
  justify-self: end;
}

.ai-model-picker__avatar {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-primary-color, #4f9cff) 18%, transparent);
  color: var(--ui-primary-color, #4f9cff);
  font-size: var(--ui-font-size-sm);
  font-weight: 800;
}

.ai-model-picker__empty {
  margin: 0;
  padding: 24px;
  border: 1px dashed var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
  text-align: center;
}

.ai-model-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;

  span {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-sm);
  }
}

@media (max-width: 720px) {
  .ai-provider-drawer__model-fields,
  .ai-provider-drawer__checks {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-model-picker__toolbar,
  .ai-model-picker-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-model-picker-row .ai-model-capabilities {
    justify-content: flex-start;
  }
}
</style>
