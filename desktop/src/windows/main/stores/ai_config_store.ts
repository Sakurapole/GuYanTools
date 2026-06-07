import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AiAgentFeatureConfig,
  AiModelCapabilities,
  AiModelConfig,
  AiProviderConfig,
  AiProviderKind,
  AiSafeAgentFeatureConfig,
  RebuildKnowledgeEmbeddingsPayload,
  TestAiProviderPayload,
} from '@/contracts/ai';
import { createDefaultAiAgentFeatureConfig } from '@/contracts/app_config';
import { createDefaultAiModelCapabilities } from '@/contracts/ai';

function now() {
  return Date.now();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toSafeConfig(config: AiAgentFeatureConfig): AiSafeAgentFeatureConfig {
  const safeResearch = { ...config.research };
  delete safeResearch.webSearchApiKey;
  return {
    ...config,
    research: {
      ...safeResearch,
      hasWebSearchApiKey: Boolean(config.research.webSearchApiKey),
    },
    providers: config.providers.map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      name: provider.name,
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
      models: provider.models,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      hasApiKey: Boolean(provider.apiKey || provider.apiKeyRef),
    })),
  };
}

export function createAiProviderConfig(input: {
  id: string;
  kind: AiProviderKind;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  models: AiModelConfig[];
  enabled?: boolean;
}): AiProviderConfig {
  const timestamp = now();
  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    enabled: input.enabled ?? true,
    models: input.models,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createAiModelConfig(input: {
  id: string;
  displayName?: string;
  providerModelId?: string;
  capabilities?: Partial<AiModelCapabilities>;
}): AiModelConfig {
  return {
    id: input.id,
    displayName: input.displayName || input.id,
    providerModelId: input.providerModelId || input.id,
    capabilities: {
      ...createDefaultAiModelCapabilities(),
      ...(input.capabilities ?? {}),
    },
  };
}

export const useAiConfigStore = defineStore('ai-config', () => {
  const config = ref<AiSafeAgentFeatureConfig>(toSafeConfig(createDefaultAiAgentFeatureConfig()));
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');

  const enabledProviders = computed(() => config.value.providers.filter((provider) => provider.enabled));
  const defaultProvider = computed(() =>
    enabledProviders.value.find((provider) => provider.id === config.value.defaultProviderId)
    ?? enabledProviders.value[0],
  );
  const defaultModel = computed(() =>
    defaultProvider.value?.models.find((model) => model.id === config.value.defaultChatModelId)
    ?? defaultProvider.value?.models[0],
  );

  async function refresh() {
    if (!window.aiApi) {
      return config.value;
    }

    loading.value = true;
    error.value = '';
    try {
      config.value = await window.aiApi.getConfig();
      return config.value;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  async function updateConfig(patch: Partial<AiAgentFeatureConfig>) {
    if (!window.aiApi) {
      return config.value;
    }

    saving.value = true;
    error.value = '';
    try {
      config.value = await window.aiApi.updateConfig(clone(patch));
      return config.value;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      saving.value = false;
    }
  }

  async function saveProviders(providers: AiProviderConfig[], defaults?: { providerId?: string; modelId?: string }) {
    return updateConfig({
      enabled: providers.some((provider) => provider.enabled && provider.models.length > 0),
      defaultProviderId: defaults?.providerId,
      defaultChatModelId: defaults?.modelId,
      providers,
    });
  }

  async function testProvider(input: TestAiProviderPayload) {
    if (!window.aiApi) {
      return { ok: false, message: '当前运行环境不支持 AI API' };
    }

    return window.aiApi.testProvider(clone(input));
  }

  async function getKnowledgeEmbeddingStats(input?: RebuildKnowledgeEmbeddingsPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    return window.aiApi.getKnowledgeEmbeddingStats(input ? clone(input) : undefined);
  }

  async function rebuildKnowledgeEmbeddings(input?: RebuildKnowledgeEmbeddingsPayload) {
    if (!window.aiApi) {
      throw new Error('当前运行环境不支持 AI API');
    }

    return window.aiApi.rebuildKnowledgeEmbeddings(input ? clone(input) : undefined);
  }

  return {
    config,
    loading,
    saving,
    error,
    enabledProviders,
    defaultProvider,
    defaultModel,
    refresh,
    updateConfig,
    saveProviders,
    testProvider,
    getKnowledgeEmbeddingStats,
    rebuildKnowledgeEmbeddings,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAiConfigStore, import.meta.hot));
}
