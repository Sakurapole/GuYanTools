<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import type { AiProviderConfig, AiProviderKind, AiSafeProviderConfig } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiDrawer from '@/windows/main/components/ui/UiDrawer.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiPanelHeader from '@/windows/main/components/ui/UiPanelHeader.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import { createAiModelConfig, createAiProviderConfig, useAiConfigStore } from '@/windows/main/stores/ai_config_store';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  providerId?: string;
}>(), {
  providerId: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:providerId': [value: string];
}>();

const aiConfigStore = useAiConfigStore();
const testMessage = ref('');
const testing = ref(false);

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
  modelId: '',
  modelName: '',
  modelEmbedding: false,
  modelReasoning: false,
});

const selectedProvider = computed(() =>
  aiConfigStore.config.providers.find((provider) => provider.id === props.providerId),
);

const drawerTitle = computed(() => props.providerId ? '编辑 Provider' : '新建 Provider');
const drawerSubtitle = computed(() =>
  props.providerId ? '更新模型接入、API Key 与能力标记' : '配置新的模型 Provider 与默认模型',
);

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

function hydrateProviderForm(provider?: AiSafeProviderConfig) {
  testMessage.value = '';
  if (!provider) {
    resetProviderForm();
    return;
  }

  const model = provider.models[0];
  providerForm.id = provider.id;
  providerForm.name = provider.name;
  providerForm.kind = provider.kind;
  providerForm.baseUrl = provider.baseUrl ?? '';
  providerForm.apiKey = '';
  providerForm.modelId = model?.providerModelId || model?.id || '';
  providerForm.modelName = model?.displayName || '';
  providerForm.modelEmbedding = model?.capabilities.embedding ?? false;
  providerForm.modelReasoning = model?.capabilities.reasoning ?? false;
}

function resetProviderForm() {
  providerForm.id = '';
  providerForm.name = '';
  providerForm.kind = 'openai-compatible';
  providerForm.baseUrl = '';
  providerForm.apiKey = '';
  providerForm.modelId = '';
  providerForm.modelName = '';
  providerForm.modelEmbedding = false;
  providerForm.modelReasoning = false;
}

function currentModelCapabilities(provider?: AiSafeProviderConfig) {
  return provider?.models[0]?.capabilities ?? {
    streaming: true,
    toolCalling: providerForm.kind !== 'ollama',
    structuredOutput: providerForm.kind !== 'ollama',
  };
}

function buildProvider(): AiProviderConfig {
  const id = providerForm.id.trim();
  const modelId = providerForm.modelId.trim();
  const current = selectedProvider.value;
  const model = createAiModelConfig({
    id: modelId,
    providerModelId: modelId,
    displayName: providerForm.modelName.trim() || modelId,
    capabilities: {
      ...currentModelCapabilities(current),
      embedding: providerForm.modelEmbedding,
      reasoning: providerForm.modelReasoning,
    },
  });

  return {
    ...createAiProviderConfig({
      id,
      kind: providerForm.kind,
      name: providerForm.name.trim() || id,
      baseUrl: providerForm.baseUrl.trim() || undefined,
      apiKey: providerForm.apiKey.trim() || undefined,
      models: [model],
      enabled: true,
    }),
    createdAt: current?.createdAt ?? Date.now(),
  };
}

function canSaveProvider() {
  return Boolean(providerForm.id.trim() && providerForm.modelId.trim());
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

  testing.value = true;
  testMessage.value = '';
  try {
    const result = await aiConfigStore.testProvider({
      provider: buildProvider(),
      modelId: providerForm.modelId.trim(),
    });
    testMessage.value = result.message;
  } catch (cause) {
    testMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <UiDrawer
    class="ai-provider-drawer"
    :model-value="modelValue"
    width="440px"
    teleport-to="#ai-chat-drawer-host"
    :fixed="false"
    :close-on-mask="false"
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
      <UiInput v-model="providerForm.modelId" size="sm" placeholder="模型 ID，例如 provider 原始模型名" />
      <UiInput v-model="providerForm.modelName" size="sm" placeholder="模型显示名，可留空" />

      <div class="ai-provider-drawer__checks">
        <UiCheckbox v-model="providerForm.modelEmbedding" size="sm">支持 Embedding</UiCheckbox>
        <UiCheckbox v-model="providerForm.modelReasoning" size="sm">支持推理</UiCheckbox>
      </div>

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
        <UiButton size="sm" :disabled="!canSaveProvider() || testing" @click="testProvider">测试</UiButton>
        <UiButton
          size="sm"
          variant="primary"
          :disabled="!canSaveProvider() || aiConfigStore.saving"
          @click="saveProvider"
        >
          保存
        </UiButton>
      </div>
    </template>
  </UiDrawer>
</template>

<style lang="scss" scoped>
.ai-provider-drawer__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
}

.ai-provider-drawer__checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
</style>
