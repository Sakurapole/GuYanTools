<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import type { AiAssistantConfig, AiAssistantKnowledgeMode, AiAssistantMcpMode, AiAssistantToolCallMode, AiSafeProviderConfig } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCard from '@/windows/main/components/ui/UiCard.vue';
import UiDialog from '@/windows/main/components/ui/UiDialog.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiInput from '@/windows/main/components/ui/UiInput.vue';
import UiRange from '@/windows/main/components/ui/UiRange.vue';
import UiSelect, { type UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import UiSettingRow from '@/windows/main/components/ui/UiSettingRow.vue';
import UiSwitch from '@/windows/main/components/ui/UiSwitch.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import { createAiAssistantConfig } from '@/windows/main/stores/ai_config_store';

const props = defineProps<{
  modelValue: boolean;
  assistant: AiAssistantConfig | null;
  providers: AiSafeProviderConfig[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [assistant: AiAssistantConfig];
  delete: [assistantId: string];
}>();

type SettingsTab = 'model' | 'prompt' | 'knowledge' | 'mcp' | 'phrases' | 'memory';

const activeTab = ref<SettingsTab>('model');
const phrasesText = ref('');
const form = reactive<AiAssistantConfig>(createAiAssistantConfig());

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'model', label: '模型设置' },
  { id: 'prompt', label: '提示词设置' },
  { id: 'knowledge', label: '知识库设置' },
  { id: 'mcp', label: 'MCP 服务器' },
  { id: 'phrases', label: '常用短语' },
  { id: 'memory', label: '全局记忆' },
];

const providerOptions = computed<UiSelectOption[]>(() => [
  { label: '使用全局默认 Provider', value: '' },
  ...props.providers.map((provider) => ({
    label: provider.name,
    value: provider.id,
  })),
]);

const selectedProvider = computed(() =>
  props.providers.find((provider) => provider.id === form.providerId) ?? props.providers[0],
);

const modelOptions = computed<UiSelectOption[]>(() => [
  { label: '使用 Provider 默认模型', value: '' },
  ...(selectedProvider.value?.models ?? []).map((model) => ({
    label: model.displayName || model.id,
    value: model.id,
  })),
]);

const knowledgeModeOptions: Array<{ label: string; value: AiAssistantKnowledgeMode }> = [
  { label: '强制检索', value: 'force' },
  { label: '意图识别', value: 'intent' },
];

const mcpModeOptions: Array<{ label: string; value: AiAssistantMcpMode }> = [
  { label: '禁用', value: 'disabled' },
  { label: '自动', value: 'auto' },
  { label: '手动', value: 'manual' },
];

const toolCallModeOptions: Array<{ label: string; value: AiAssistantToolCallMode }> = [
  { label: '函数', value: 'function' },
  { label: '自动', value: 'auto' },
  { label: '关闭', value: 'none' },
];

const promptTokenEstimate = computed(() => Math.ceil(form.systemPrompt.length / 4));

watch(
  () => [props.modelValue, props.assistant] as const,
  ([visible, assistant]) => {
    if (!visible) {
      return;
    }
    activeTab.value = 'model';
    Object.assign(form, createAiAssistantConfig(assistant ? { ...assistant } : {}));
    phrasesText.value = form.commonPhrases.join('\n');
  },
  { immediate: true },
);

watch(
  () => form.providerId,
  () => {
    if (!form.modelId) {
      return;
    }
    if (!selectedProvider.value?.models.some((model) => model.id === form.modelId)) {
      form.modelId = '';
    }
  },
);

function addCustomParameter() {
  form.customParameters = [
    ...form.customParameters,
    {
      id: `param-${Date.now()}`,
      key: '',
      value: '',
    },
  ];
}

function removeCustomParameter(parameterId: string) {
  form.customParameters = form.customParameters.filter((parameter) => parameter.id !== parameterId);
}

function chooseFirstModel() {
  const provider = selectedProvider.value;
  form.providerId = provider?.id;
  form.modelId = provider?.models[0]?.id;
}

function saveAssistant() {
  const timestamp = Date.now();
  emit('save', {
    ...form,
    name: form.name.trim() || '默认助手',
    emoji: form.emoji.trim() || '😀',
    providerId: form.providerId || undefined,
    modelId: form.modelId || undefined,
    knowledgeLibraryId: form.knowledgeLibraryId?.trim() || undefined,
    knowledgeSpaceId: form.knowledgeSpaceId?.trim() || undefined,
    commonPhrases: phrasesText.value
      .split('\n')
      .map((phrase) => phrase.trim())
      .filter(Boolean),
    customParameters: form.customParameters
      .map((parameter) => ({
        ...parameter,
        key: parameter.key.trim(),
      }))
      .filter((parameter) => parameter.key),
    updatedAt: timestamp,
  });
  emit('update:modelValue', false);
}
</script>

<template>
  <UiDialog
    class="ai-assistant-settings"
    :model-value="modelValue"
    width="1120px"
    max-width="calc(100vw - 36px)"
    :close-on-mask="false"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <template #header>
      <header class="ai-assistant-settings__header">
        <h2>{{ form.name || '默认助手' }}</h2>
        <UiButton size="sm" variant="ghost" @click="emit('update:modelValue', false)">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:x" :size="16" />
          </template>
          关闭
        </UiButton>
      </header>
    </template>

    <div class="ai-assistant-settings__body">
      <nav class="ai-assistant-settings__nav" aria-label="助手设置">
        <UiButton
          v-for="tab in tabs"
          :key="tab.id"
          variant="ghost"
          size="lg"
          block
          :class="{ 'is-active': activeTab === tab.id }"
          :active="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </UiButton>
      </nav>

      <main class="ai-assistant-settings__content">
        <section v-if="activeTab === 'model'" class="ai-assistant-settings__pane">
          <UiSettingRow label="默认模型">
            <UiButton size="sm" @click="chooseFirstModel">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:plus" :size="15" />
              </template>
              选择模型
            </UiButton>
          </UiSettingRow>
          <div class="ai-assistant-settings__grid">
            <UiSelect v-model="form.providerId" :options="providerOptions" size="sm" />
            <UiSelect v-model="form.modelId" :options="modelOptions" size="sm" />
          </div>

          <UiSettingRow>
            <template #label>模型温度 <small>?</small></template>
            <UiSwitch v-model="form.temperatureEnabled" aria-label="启用模型温度" />
          </UiSettingRow>
          <UiInput
            v-if="form.temperatureEnabled"
            :model-value="String(form.temperature)"
            type="number"
            :min="0"
            :max="2"
            :step="0.1"
            size="sm"
            @update:modelValue="form.temperature = Number($event)"
          />

          <UiSettingRow>
            <template #label><strong>Top-P</strong> <small>?</small></template>
            <UiSwitch v-model="form.topPEnabled" aria-label="启用 Top-P" />
          </UiSettingRow>
          <UiInput
            v-if="form.topPEnabled"
            :model-value="String(form.topP)"
            type="number"
            :min="0"
            :max="1"
            :step="0.05"
            size="sm"
            @update:modelValue="form.topP = Number($event)"
          />

          <UiSettingRow :value="form.contextMessages || '不限'">
            <template #label>上下文数 <small>?</small></template>
          </UiSettingRow>
          <UiRange v-model="form.contextMessages" :min="0" :max="100" :step="1" aria-label="上下文数" />
          <div class="ai-assistant-settings__scale">
            <span>0</span><span>25</span><span>50</span><span>75</span><span>不限</span>
          </div>

          <UiSettingRow>
            <template #label>最大 Token 数 <small>?</small></template>
            <UiSwitch v-model="form.maxOutputTokensEnabled" aria-label="启用最大 Token 数" />
          </UiSettingRow>
          <UiInput
            v-if="form.maxOutputTokensEnabled"
            :model-value="String(form.maxOutputTokens ?? '')"
            type="number"
            :min="1"
            :step="256"
            size="sm"
            @update:modelValue="form.maxOutputTokens = Number($event) || undefined"
          />

          <UiSettingRow label="流式输出">
            <UiSwitch v-model="form.streaming" aria-label="流式输出" />
          </UiSettingRow>

          <UiSettingRow label="工具调用方式">
            <UiSelect v-model="form.toolCallMode" :options="toolCallModeOptions" size="sm" />
          </UiSettingRow>

          <UiSettingRow>
            <template #label>最大工具调用次数 <small>?</small></template>
            <UiSwitch v-model="form.maxToolCallsEnabled" aria-label="启用最大工具调用次数" />
          </UiSettingRow>
          <UiInput
            v-if="form.maxToolCallsEnabled"
            :model-value="String(form.maxToolCalls)"
            type="number"
            :min="1"
            :max="64"
            :step="1"
            size="sm"
            @update:modelValue="form.maxToolCalls = Number($event)"
          />

          <UiSettingRow label="自定义参数">
            <UiButton size="sm" @click="addCustomParameter">
              <template #prefix>
                <IconRenderer icon="iconify:lucide:plus" :size="15" />
              </template>
              添加参数
            </UiButton>
          </UiSettingRow>
          <div v-for="parameter in form.customParameters" :key="parameter.id" class="ai-assistant-settings__param">
            <UiInput v-model="parameter.key" size="sm" placeholder="参数名" />
            <UiInput v-model="parameter.value" size="sm" placeholder="参数值" />
            <UiButton size="sm" variant="ghost" @click="removeCustomParameter(parameter.id)">删除</UiButton>
          </div>
        </section>

        <section v-else-if="activeTab === 'prompt'" class="ai-assistant-settings__pane ai-assistant-settings__pane--fill">
          <UiField label="名称">
            <div class="ai-assistant-settings__name-row">
              <UiInput v-model="form.emoji" class="ai-assistant-settings__emoji" size="sm" />
              <UiInput v-model="form.name" size="sm" placeholder="助手名称" />
            </div>
          </UiField>
          <UiField class="ai-assistant-settings__prompt-field">
            <template #label>提示词 <small>?</small></template>
            <UiTextarea v-model="form.systemPrompt" class="ai-assistant-settings__prompt" :rows="18" resize="vertical" />
          </UiField>
          <div class="ai-assistant-settings__footer-note">Tokens: {{ promptTokenEstimate }}</div>
        </section>

        <section v-else-if="activeTab === 'knowledge'" class="ai-assistant-settings__pane">
          <UiField label="知识库">
            <div class="ai-assistant-settings__grid">
              <UiInput v-model="form.knowledgeLibraryId" size="sm" placeholder="选择知识库" />
              <UiInput v-model="form.knowledgeSpaceId" size="sm" placeholder="知识库 Space，可留空" />
            </div>
          </UiField>
          <UiField label="调用知识库">
            <UiSelect v-model="form.knowledgeMode" :options="knowledgeModeOptions" size="sm" />
          </UiField>
        </section>

        <section v-else-if="activeTab === 'mcp'" class="ai-assistant-settings__pane">
          <h3>MCP 服务器 <small>i</small></h3>
          <UiButton
            v-for="option in mcpModeOptions"
            :key="option.value"
            variant="ghost"
            size="lg"
            block
            class="ai-assistant-settings__choice"
            :class="{ 'is-active': form.mcpMode === option.value }"
            :active="form.mcpMode === option.value"
            @click="form.mcpMode = option.value"
          >
            <strong>{{ option.label }}</strong>
            <span v-if="option.value === 'disabled'">不使用 MCP 工具</span>
            <span v-else-if="option.value === 'auto'">AI 自动发现和使用工具</span>
            <span v-else>选择特定的 MCP 服务器</span>
          </UiButton>
        </section>

        <section v-else-if="activeTab === 'phrases'" class="ai-assistant-settings__pane ai-assistant-settings__pane--fill">
          <UiField class="ai-assistant-settings__prompt-field" label="常用短语">
            <UiTextarea v-model="phrasesText" :rows="18" resize="vertical" placeholder="每行一个短语" />
          </UiField>
        </section>

        <section v-else class="ai-assistant-settings__pane">
          <UiSettingRow>
            <template #label>全局记忆 <small>i</small></template>
            <UiSwitch v-model="form.memoryEnabled" aria-label="启用全局记忆" />
          </UiSettingRow>
          <UiCard class="ai-assistant-settings__notice" padding="sm" radius="sm" :class="{ 'is-enabled': form.memoryEnabled }">
            <strong>{{ form.memoryEnabled ? '全局记忆已启用' : '全局记忆已禁用' }}</strong>
            <span>{{ form.memoryEnabled ? '助手会参考可用的长期记忆。' : '要使用记忆功能，请先在助手设置中启用全局记忆。' }}</span>
          </UiCard>
          <UiCard class="ai-assistant-settings__memory-count" padding="sm" radius="sm">已存储记忆: 0</UiCard>
        </section>
      </main>
    </div>

    <template #footer>
      <footer class="ai-assistant-settings__footer">
        <UiButton v-if="assistant" size="sm" variant="danger" @click="emit('delete', assistant.id)">删除角色</UiButton>
        <div class="ai-assistant-settings__footer-spacer" />
        <UiButton size="sm" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton size="sm" variant="primary" @click="saveAssistant">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:save" :size="15" />
          </template>
          保存
        </UiButton>
      </footer>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.ai-assistant-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;

  h2 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 1.05rem;
    font-weight: 780;
  }
}

.ai-assistant-settings__body {
  display: grid;
  grid-template-columns: 276px minmax(0, 1fr);
  min-height: 0;
  height: min(74vh, 760px);
}

.ai-assistant-settings__nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-right: var(--ui-border-width-thin) solid var(--ui-border-subtle);

  .ui-button {
    width: 100%;
    padding: 11px 18px;
    border: var(--ui-border-width-thin) solid transparent;
    border-radius: var(--ui-radius-sm);
    background: transparent;
    color: var(--ui-text-secondary);
    font-size: 0.94rem;
    text-align: left;
    box-shadow: none;

    &:hover,
    &.ui-button--active {
      border-color: var(--ui-border-subtle);
      background: var(--ui-surface-overlay);
      color: var(--ui-text-primary);
    }

    :deep(.ui-button__label) {
      justify-content: flex-start;
      width: 100%;
    }
  }
}

.ai-assistant-settings__content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.ai-assistant-settings__pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 820px;
  padding: 28px;

  h3 {
    margin: 0 0 10px;
    color: var(--ui-text-primary);
    font-size: 1rem;
    font-weight: 760;
  }
}

.ai-assistant-settings__pane--fill {
  height: 100%;
}

.ai-assistant-settings__grid,
.ai-assistant-settings__name-row,
.ai-assistant-settings__param {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.ai-assistant-settings__grid > *,
.ai-assistant-settings__name-row > *,
.ai-assistant-settings__param > * {
  min-width: 0;
  flex: 1 1 auto;
}

.ai-assistant-settings__emoji {
  flex: 0 0 48px;
}

.ai-assistant-settings__prompt-field {
  flex: 1 1 auto;
  min-height: 0;

  :deep(.ui-field__control) {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
  }

  :deep(.ui-field__label small) {
    color: var(--ui-text-muted);
    font-weight: 500;
  }
}

.ai-assistant-settings__scale {
  display: flex;
  justify-content: space-between;
  margin-top: -8px;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
}

.ai-assistant-settings__prompt {
  flex: 1 1 auto;
}

.ai-assistant-settings__footer-note {
  color: var(--ui-text-muted);
  font-size: 0.84rem;
}

.ai-assistant-settings__choice.ui-button {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 20px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-base);
  color: var(--ui-text-primary);
  text-align: left;
  box-shadow: none;

  :deep(.ui-button__label) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
  }

  :deep(span) {
    color: var(--ui-text-muted);
  }

  &.ui-button--active {
    border-color: var(--primary-color);
  }
}

.ai-assistant-settings__notice {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border: var(--ui-border-width-thin) solid color-mix(in srgb, var(--ui-warning-color) 55%, var(--ui-border-subtle));
  border-radius: var(--ui-radius-sm);
  background: color-mix(in srgb, var(--ui-warning-color) 10%, transparent);

  span {
    color: var(--ui-text-secondary);
  }

  &.is-enabled {
    border-color: color-mix(in srgb, var(--primary-color) 55%, var(--ui-border-subtle));
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }
}

.ai-assistant-settings__memory-count {
  padding: 16px;
  color: var(--ui-text-primary);
  font-weight: 720;
}

.ai-assistant-settings__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}

.ai-assistant-settings__footer-spacer {
  flex: 1 1 auto;
}
</style>
