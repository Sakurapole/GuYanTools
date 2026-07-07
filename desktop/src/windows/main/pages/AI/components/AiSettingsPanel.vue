<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import type {
  AiModelConfig,
  AiMcpRuntimeServerStatus,
  AiMcpServerConfig,
  AiReasoningEffort,
  ModelScopeMcpServerSummary,
} from '@/contracts/ai';
import { getModelCapabilityBadges, groupModelsByPrefix } from '@/windows/main/pages/AI/ai_model_display';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiSelect from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import { useAiConfigStore } from '@/windows/main/stores/ai_config_store';

const aiConfigStore = useAiConfigStore();
const emit = defineEmits<{
  openProviderDrawer: [providerId?: string];
}>();
const embeddingMessage = ref('');
const embeddingLoading = ref(false);
const mcpMessage = ref('');
const mcpLoading = ref(false);
const mcpSearchQuery = ref('');
const mcpSearchResults = ref<ModelScopeMcpServerSummary[]>([]);
const mcpSearchTotal = ref(0);
const mcpStatuses = ref<AiMcpRuntimeServerStatus[]>([]);
const mcpJsonText = ref('');

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
  mcpEnabled: false,
  modelscopeApiToken: '',
});

onMounted(() => {
  void aiConfigStore.refresh();
  void refreshMcpStatuses();
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
    form.mcpEnabled = config.mcp.enabled;
    form.modelscopeApiToken = '';
  },
  { immediate: true },
);

const mcpStatusById = computed(() => new Map(mcpStatuses.value.map((status) => [status.id, status])));

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
  emit('openProviderDrawer', providerId);
}

function groupedProviderModels(models: AiModelConfig[]) {
  return groupModelsByPrefix(models);
}

function modelCapabilityBadges(model: AiModelConfig) {
  return getModelCapabilityBadges(model.capabilities);
}

function fullMcpServers(): AiMcpServerConfig[] {
  return aiConfigStore.config.mcp.servers.map((server) => ({
    ...server,
    env: server.env.map((env) => ({
      id: env.id,
      key: env.key,
      value: env.value ?? '',
      secret: env.secret,
    })),
  }));
}

async function saveMcpSettings(servers = fullMcpServers()) {
  await aiConfigStore.saveMcpSettings({
    enabled: form.mcpEnabled,
    modelscopeApiToken: form.modelscopeApiToken.trim() || undefined,
    servers,
  });
  await refreshMcpStatuses();
}

async function searchModelScopeMcp() {
  mcpLoading.value = true;
  mcpMessage.value = '';
  try {
    const result = await aiConfigStore.listModelScopeMcpServers({
      search: mcpSearchQuery.value.trim() || undefined,
      pageSize: 12,
      apiToken: form.modelscopeApiToken.trim() || undefined,
    });
    mcpSearchResults.value = result.servers;
    mcpSearchTotal.value = result.total;
  } catch (cause) {
    mcpMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    mcpLoading.value = false;
  }
}

async function importModelScopeMcp(serverId: string) {
  mcpLoading.value = true;
  mcpMessage.value = '';
  try {
    const detail = await aiConfigStore.getModelScopeMcpServer({
      id: serverId,
      apiToken: form.modelscopeApiToken.trim() || undefined,
    });
    if (!detail.importableServer) {
      mcpMessage.value = '该 MCP 没有可导入的本地配置 JSON';
      return;
    }
    const nextServer = {
      ...detail.importableServer,
      id: uniqueMcpServerId(detail.importableServer.id, fullMcpServers()),
    };
    const servers = [
      ...fullMcpServers().filter((server) => server.sourceId !== nextServer.sourceId && server.id !== nextServer.id),
      nextServer,
    ];
    form.mcpEnabled = true;
    await saveMcpSettings(servers);
    mcpMessage.value = `已导入 ${nextServer.name}`;
  } catch (cause) {
    mcpMessage.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    mcpLoading.value = false;
  }
}

async function importMcpJson() {
  mcpMessage.value = '';
  try {
    const imported = parseMcpJsonConfig(mcpJsonText.value);
    if (!imported.length) {
      mcpMessage.value = '没有找到可导入的 mcpServers 配置';
      return;
    }
    const existing = fullMcpServers();
    const servers = [...existing];
    for (const server of imported) {
      servers.push({
        ...server,
        id: uniqueMcpServerId(server.id, servers),
      });
    }
    form.mcpEnabled = true;
    await saveMcpSettings(servers);
    mcpJsonText.value = '';
    mcpMessage.value = `已导入 ${imported.length} 个 MCP 服务器`;
  } catch (cause) {
    mcpMessage.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function updateMcpServer(serverId: string, patch: Partial<AiMcpServerConfig>) {
  const servers = fullMcpServers().map((server) =>
    server.id === serverId
      ? { ...server, ...patch, updatedAt: Date.now() }
      : server,
  );
  await saveMcpSettings(servers);
}

async function deleteMcpServer(serverId: string) {
  await stopMcpServer(serverId);
  await saveMcpSettings(fullMcpServers().filter((server) => server.id !== serverId));
}

async function refreshMcpStatuses() {
  try {
    mcpStatuses.value = await aiConfigStore.getMcpServerStatuses();
  } catch {
    mcpStatuses.value = [];
  }
}

async function startMcpServer(serverId: string) {
  mcpMessage.value = '';
  try {
    await aiConfigStore.startMcpServer(serverId);
    await refreshMcpStatuses();
  } catch (cause) {
    mcpMessage.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function stopMcpServer(serverId: string) {
  try {
    await aiConfigStore.stopMcpServer(serverId);
    await refreshMcpStatuses();
  } catch (cause) {
    mcpMessage.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function uniqueMcpServerId(baseId: string, servers: AiMcpServerConfig[]) {
  let candidate = baseId;
  let index = 2;
  while (servers.some((server) => server.id === candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }
  return candidate;
}

function parseMcpJsonConfig(value: string): AiMcpServerConfig[] {
  const parsed = JSON.parse(value) as { mcpServers?: Record<string, unknown> };
  const mcpServers = parsed.mcpServers ?? parsed as Record<string, unknown>;
  return Object.entries(mcpServers).map(([name, raw]) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const timestamp = Date.now();
    const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : undefined;
    const command = typeof item.command === 'string' && item.command.trim() ? item.command.trim() : undefined;
    if (!url && !command) {
      throw new Error(`${name} 缺少 command 或 url`);
    }
    return {
      id: name.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase(),
      name,
      enabled: true,
      source: 'manual',
      transport: url ? (url.includes('/sse') ? 'sse' : 'http') : 'stdio',
      command,
      args: Array.isArray(item.args) ? item.args.map((arg) => String(arg)) : [],
      cwd: typeof item.cwd === 'string' && item.cwd.trim() ? item.cwd.trim() : undefined,
      url,
      env: normalizeMcpEnv(item.env),
      autoStart: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

function normalizeMcpEnv(value: unknown) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key.trim())
    .map(([key, rawValue]) => ({
      id: key,
      key,
      value: typeof rawValue === 'string' ? rawValue : String(rawValue ?? ''),
      secret: /key|token|secret|password/i.test(key),
    }));
}
</script>

<template>
  <div class="ai-settings-panel settings-form">
    <section class="settings-group">
      <h3>模型接入</h3>
      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>Provider 列表</span>
          <small>配置模型接入口、Base URL、API Key 和可用模型。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <div class="ai-provider-panel">
            <div class="ai-provider-panel__actions">
              <UiButton size="sm" variant="primary" @click="openProviderDrawer()">新建 Provider</UiButton>
            </div>

            <div v-if="aiConfigStore.config.providers.length" class="ai-provider-list">
              <article
                v-for="provider in aiConfigStore.config.providers"
                :key="provider.id"
                class="ai-provider-item"
              >
                <div class="ai-provider-item__body">
                  <div class="ai-provider-item__title">
                    <strong>{{ provider.name }}</strong>
                    <span>{{ provider.kind }}</span>
                  </div>
                  <small>{{ provider.baseUrl || '默认 Endpoint' }}</small>
                  <div v-if="provider.models.length" class="ai-provider-item__model-groups">
                    <section
                      v-for="group in groupedProviderModels(provider.models)"
                      :key="group.prefix"
                      class="ai-provider-model-group"
                    >
                      <div class="ai-provider-model-group__head">
                        <strong>{{ group.prefix }}</strong>
                        <span>{{ group.items.length }}</span>
                      </div>
                      <div class="ai-provider-model-group__items">
                        <article
                          v-for="model in group.items"
                          :key="model.id"
                          class="ai-provider-model-chip"
                        >
                          <span>{{ model.displayName || model.id }}</span>
                          <div class="ai-model-capabilities" aria-label="模型能力">
                            <span
                              v-for="badge in modelCapabilityBadges(model)"
                              :key="badge.key"
                              class="ai-model-capability"
                              :class="`ai-model-capability--${badge.key}`"
                              :title="badge.label"
                            >
                              <IconRenderer :icon="badge.icon" :size="11" />
                            </span>
                          </div>
                        </article>
                      </div>
                    </section>
                  </div>
                  <small v-else>未配置模型</small>
                </div>
                <UiButton size="sm" variant="ghost" @click="openProviderDrawer(provider.id)">编辑</UiButton>
              </article>
            </div>
            <p v-else class="ai-provider-panel__empty">暂无 Provider，添加后即可在 AI 问答区选择模型。</p>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h3>MCP 服务器</h3>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>启用 MCP</span>
          <small>统一管理本地 stdio MCP 和远程 SSE/HTTP MCP 配置。</small>
        </div>
        <div class="settings-row__control settings-row__control--switch">
          <UiCheckbox
            :model-value="form.mcpEnabled"
            size="sm"
            @update:modelValue="form.mcpEnabled = $event; saveMcpSettings()"
          />
        </div>
      </div>

      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>魔搭社区</span>
          <small>可选填写 ModelScope Token；公开 MCP 列表不填也能搜索。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <div class="ai-mcp-importer">
            <div class="ai-mcp-importer__token">
              <UiInput
                v-model="form.modelscopeApiToken"
                size="sm"
                type="password"
                placeholder="ModelScope API Token，留空则保留已保存 Token"
              />
              <UiButton size="sm" @click="saveMcpSettings()">保存 Token</UiButton>
            </div>
            <div class="ai-mcp-importer__search">
              <UiInput v-model="mcpSearchQuery" size="sm" placeholder="搜索魔搭 MCP，例如 fetch、amap、filesystem" />
              <UiButton size="sm" variant="primary" :disabled="mcpLoading" @click="searchModelScopeMcp">搜索</UiButton>
            </div>
            <div v-if="mcpSearchResults.length" class="ai-mcp-search-list">
              <article
                v-for="server in mcpSearchResults"
                :key="server.id"
                class="ai-mcp-search-item"
              >
                <div class="ai-mcp-search-item__body">
                  <strong>{{ server.name }}</strong>
                  <small>{{ server.description || server.id }}</small>
                  <div class="ai-mcp-search-item__tags">
                    <span v-for="category in server.categories.slice(0, 3)" :key="category">{{ category }}</span>
                    <span>{{ server.viewCount }} 次浏览</span>
                  </div>
                </div>
                <UiButton size="sm" :disabled="mcpLoading" @click="importModelScopeMcp(server.id)">导入</UiButton>
              </article>
              <p class="ai-mcp-panel__hint">共 {{ mcpSearchTotal }} 个匹配项，当前显示前 {{ mcpSearchResults.length }} 个。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>导入 MCP JSON</span>
          <small>支持 Claude/Cursor 风格的 mcpServers JSON，本地运行使用 command + args。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <div class="ai-mcp-json-import">
            <UiTextarea
              v-model="mcpJsonText"
              :rows="5"
              resize="vertical"
              placeholder='{"mcpServers":{"fetch":{"command":"uvx","args":["mcp-server-fetch"]}}}'
            />
            <UiButton size="sm" :disabled="!mcpJsonText.trim()" @click="importMcpJson">导入 JSON</UiButton>
          </div>
        </div>
      </div>

      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>服务器管理</span>
          <small>启用、启动、停止或删除本地 MCP 服务器。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <div v-if="aiConfigStore.config.mcp.servers.length" class="ai-mcp-server-list">
            <article
              v-for="server in aiConfigStore.config.mcp.servers"
              :key="server.id"
              class="ai-mcp-server-item"
            >
              <div class="ai-mcp-server-item__body">
                <div class="ai-mcp-server-item__title">
                  <strong>{{ server.name }}</strong>
                  <span>{{ mcpStatusById.get(server.id)?.status || 'stopped' }}</span>
                </div>
                <small v-if="server.transport === 'stdio'">{{ server.command }} {{ server.args.join(' ') }}</small>
                <small v-else>{{ server.url }}</small>
                <div class="ai-mcp-server-item__meta">
                  <span>{{ server.source === 'modelscope' ? '魔搭社区' : '手动配置' }}</span>
                  <span>{{ server.transport }}</span>
                  <span v-if="server.env.length">{{ server.env.length }} 个环境变量</span>
                </div>
                <small v-if="mcpStatusById.get(server.id)?.error" class="ai-mcp-server-item__error">
                  {{ mcpStatusById.get(server.id)?.error }}
                </small>
              </div>
              <div class="ai-mcp-server-item__actions">
                <UiCheckbox
                  :model-value="server.enabled"
                  size="sm"
                  @update:modelValue="updateMcpServer(server.id, { enabled: $event })"
                >
                  启用
                </UiCheckbox>
                <UiButton
                  v-if="mcpStatusById.get(server.id)?.status === 'running'"
                  size="sm"
                  variant="ghost"
                  @click="stopMcpServer(server.id)"
                >
                  停止
                </UiButton>
                <UiButton
                  v-else
                  size="sm"
                  variant="primary"
                  :disabled="!server.enabled"
                  @click="startMcpServer(server.id)"
                >
                  启动
                </UiButton>
                <UiButton size="sm" variant="danger" @click="deleteMcpServer(server.id)">删除</UiButton>
              </div>
            </article>
          </div>
          <p v-else class="ai-mcp-panel__empty">暂无 MCP 服务器，可以从魔搭社区搜索导入，或粘贴 mcpServers JSON。</p>
          <p v-if="mcpMessage" class="ai-mcp-panel__message">{{ mcpMessage }}</p>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h3>问答参数</h3>
      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>默认 System Prompt</span>
          <small>新会话默认使用的系统提示词。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <UiTextarea v-model="form.systemPrompt" :rows="4" resize="vertical" placeholder="默认 System Prompt" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>Temperature</span>
          <small>控制输出随机性，建议保持在 0 到 2 之间。</small>
        </div>
        <div class="settings-row__control settings-row__control--compact">
          <UiInput v-model="form.temperature" size="sm" type="number" :min="0" :max="2" :step="0.1" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>历史消息数</span>
          <small>发送给模型的最大上下文消息数量。</small>
        </div>
        <div class="settings-row__control settings-row__control--compact">
          <UiInput v-model="form.maxHistoryMessages" size="sm" type="number" :min="1" :max="200" :step="1" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>深度思考</span>
          <small>默认启用推理模型的 reasoning 参数。</small>
        </div>
        <div class="settings-row__control settings-row__control--switch">
          <UiCheckbox v-model="form.reasoningEnabled" size="sm" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>推理强度</span>
          <small>不同供应商会映射到各自支持的 reasoning effort。</small>
        </div>
        <div class="settings-row__control">
          <UiSelect v-model="form.reasoningEffort" :options="reasoningEffortOptions" size="sm" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>推理预算</span>
          <small>可选，限制推理 token 预算。</small>
        </div>
        <div class="settings-row__control settings-row__control--compact">
          <UiInput v-model="form.reasoningBudgetTokens" size="sm" type="number" :min="1" :step="512" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>保存问答参数</span>
          <small>写入默认问答配置。</small>
        </div>
        <div class="settings-row__control">
          <UiButton size="sm" variant="ghost" @click="saveChatSettings">保存</UiButton>
        </div>
      </div>
    </section>

    <section class="settings-group">
      <h3>引用检索</h3>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>启用引用</span>
          <small>允许 AI 使用联网搜索和知识库引用。</small>
        </div>
        <div class="settings-row__control settings-row__control--switch">
          <UiCheckbox v-model="form.researchEnabled" size="sm" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>最大来源数</span>
          <small>限制每次检索返回给模型的来源数量。</small>
        </div>
        <div class="settings-row__control settings-row__control--compact">
          <UiInput v-model="form.maxSources" size="sm" type="number" :min="1" :max="200" :step="1" />
        </div>
      </div>
      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>Web Search Endpoint</span>
          <small>POST JSON 的搜索服务地址，可留空。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <UiInput v-model="form.webSearchEndpoint" size="sm" placeholder="Web Search Endpoint（POST JSON）" />
        </div>
      </div>
      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>Web Search API Key</span>
          <small>留空表示不修改已保存的密钥。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <UiInput v-model="form.webSearchApiKey" size="sm" type="password" placeholder="留空不修改" />
        </div>
      </div>
      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>默认知识库</span>
          <small>可指定默认 Library ID 和 Space ID。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide ai-settings-panel__inline-controls">
          <UiInput v-model="form.defaultKnowledgeLibraryId" size="sm" placeholder="Library ID" />
          <UiInput v-model="form.defaultKnowledgeSpaceId" size="sm" placeholder="Space ID" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>Embedding Provider</span>
          <small>用于知识库向量化的接入口。</small>
        </div>
        <div class="settings-row__control">
          <UiSelect v-model="form.embeddingProviderId" :options="embeddingProviderOptions" size="sm" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>Embedding 模型</span>
          <small>留空时自动选择可用模型。</small>
        </div>
        <div class="settings-row__control">
          <UiSelect v-model="form.embeddingModelId" :options="embeddingModelOptions" size="sm" />
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>Embedding 批大小</span>
          <small>每批处理的 chunk 数量。</small>
        </div>
        <div class="settings-row__control settings-row__control--compact">
          <UiInput v-model="form.embeddingBatchSize" size="sm" type="number" :min="1" :max="128" :step="1" />
        </div>
      </div>
      <div class="settings-row settings-row--wide">
        <div class="settings-row__label">
          <span>Embedding 维护</span>
          <small>查看覆盖情况或重建知识库向量。</small>
        </div>
        <div class="settings-row__control settings-row__control--wide">
          <div class="ai-settings-panel__actions">
            <UiButton size="sm" :disabled="embeddingLoading" @click="loadEmbeddingStats">统计</UiButton>
            <UiButton size="sm" variant="primary" :disabled="embeddingLoading" @click="rebuildEmbeddings">重建 Embedding</UiButton>
          </div>
          <p v-if="embeddingMessage" class="ai-settings-panel__message">{{ embeddingMessage }}</p>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row__label">
          <span>保存引用设置</span>
          <small>写入搜索、知识库和 Embedding 配置。</small>
        </div>
        <div class="settings-row__control">
          <UiButton size="sm" variant="ghost" @click="saveResearchSettings">保存</UiButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.ai-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  max-width: 100%;
}

.settings-group {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 0 28px;
  padding: 16px 10px;
  border-bottom: 1px solid var(--ui-border-subtle);
  box-sizing: border-box;

  h3 {
    grid-row: 1 / span 20;
    align-self: start;
    margin: 0;
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-xl);
    font-weight: 700;
    line-height: 1.45;
    letter-spacing: 0;
  }
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(260px, 360px);
  align-items: center;
  gap: 18px;
  min-height: 46px;
  padding: 5px 0;
  box-sizing: border-box;
}

.settings-row--wide {
  grid-template-columns: minmax(180px, 260px) minmax(360px, 1fr);
}

.settings-row__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  span {
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-md);
    font-weight: 600;
    line-height: 1.4;
  }

  small {
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    line-height: 1.45;
  }
}

.settings-row__control {
  min-width: 0;
  width: 100%;
}

.settings-row__control--compact {
  max-width: 220px;
}

.settings-row__control--wide {
  max-width: 760px;
}

.settings-row__control--switch {
  display: flex;
  justify-content: flex-end;
  max-width: 360px;
}

.ai-provider-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-provider-panel__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.ai-provider-panel__empty {
  margin: 0;
  padding: 12px;
  border: 1px dashed var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: 1.5;
}

.ai-provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-provider-item {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
}

.ai-provider-item__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;

  small {
    overflow: hidden;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ai-provider-item__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;

  strong {
    overflow: hidden;
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-sm);
    font-weight: 650;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: 1px solid var(--ui-border-subtle);
    border-radius: 4px;
    color: var(--ui-text-muted);
    font-size: var(--ui-font-size-xs);
    line-height: 1.3;
  }
}

.ai-provider-item__model-groups {
  display: grid;
  gap: 7px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 4px;
}

.ai-provider-model-group {
  overflow: hidden;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
}

.ai-provider-model-group__head {
  display: flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));

  strong {
    overflow: hidden;
    color: var(--ui-text-primary);
    font-size: var(--ui-font-size-xs);
    font-weight: 740;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    display: inline-flex;
    min-width: 20px;
    min-height: 18px;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.16);
    color: #10b981;
    font-size: 0.7rem;
    font-weight: 760;
  }
}

.ai-provider-model-group__items {
  display: grid;
}

.ai-provider-model-chip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 5px 8px;
  border-top: 1px solid var(--ui-border-subtle);

  > span {
    overflow: hidden;
    color: var(--ui-text-secondary);
    font-size: var(--ui-font-size-xs);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ai-model-capabilities {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.ai-model-capability {
  display: inline-flex;
  width: 24px;
  height: 18px;
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

.ai-mcp-importer,
.ai-mcp-json-import,
.ai-mcp-server-list {
  display: grid;
  gap: 10px;
}

.ai-mcp-importer__token,
.ai-mcp-importer__search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.ai-mcp-search-list,
.ai-mcp-server-list {
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}

.ai-mcp-search-item,
.ai-mcp-server-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-md);
  background: var(--ui-input-bg, rgba(128, 128, 128, 0.06));
}

.ai-mcp-search-item + .ai-mcp-search-item,
.ai-mcp-server-item + .ai-mcp-server-item {
  margin-top: 8px;
}

.ai-mcp-search-item__body,
.ai-mcp-server-item__body {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.ai-mcp-search-item__body strong,
.ai-mcp-server-item__title strong {
  overflow: hidden;
  color: var(--ui-text-primary);
  font-size: var(--ui-font-size-sm);
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-mcp-search-item__body small,
.ai-mcp-server-item__body small {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ai-mcp-search-item__tags,
.ai-mcp-server-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ai-mcp-search-item__tags span,
.ai-mcp-server-item__meta span,
.ai-mcp-server-item__title span {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  padding: 0 7px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 4px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.3;
}

.ai-mcp-server-item__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.ai-mcp-server-item__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.ai-mcp-server-item__error {
  color: var(--ui-danger-color, #dc2626) !important;
}

.ai-mcp-panel__empty,
.ai-mcp-panel__hint,
.ai-mcp-panel__message {
  margin: 6px 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  line-height: 1.5;
}

.ai-mcp-panel__message {
  color: var(--ui-text-primary);
}

.ai-settings-panel__inline-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ai-settings-panel__actions {
  display: flex;
  gap: 8px;
}

.ai-settings-panel__message {
  margin: 8px 0 0;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
  word-break: break-word;
}

@media (max-width: 1080px) {
  .settings-group {
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 0 20px;
  }

  .settings-row,
  .settings-row--wide {
    grid-template-columns: minmax(150px, 220px) minmax(240px, 1fr);
  }
}

@media (max-width: 760px) {
  .settings-group {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 16px 0;
  }

  .settings-group h3 {
    grid-row: auto;
  }

  .settings-row,
  .settings-row--wide {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .settings-row__control,
  .settings-row__control--wide,
  .settings-row__control--compact {
    max-width: none;
  }

  .settings-row__control--switch {
    justify-content: flex-start;
  }

  .ai-settings-panel__inline-controls {
    grid-template-columns: 1fr;
  }

  .ai-mcp-importer__token,
  .ai-mcp-importer__search,
  .ai-mcp-search-item,
  .ai-mcp-server-item {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-mcp-server-item__actions {
    flex-wrap: wrap;
    white-space: normal;
  }
}
</style>
