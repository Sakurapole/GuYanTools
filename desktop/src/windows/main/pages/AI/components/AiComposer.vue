<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AiChatAttachment, AiReasoningEffort, AiSearchMode } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
import UiField from '@/windows/main/components/ui/UiField.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiSelect, { type UiSelectOption } from '@/windows/main/components/ui/UiSelect.vue';
import UiTextarea from '@/windows/main/components/ui/UiTextarea.vue';
import UiToolbar from '@/windows/main/components/ui/UiToolbar.vue';

const props = withDefaults(defineProps<{
  disabled?: boolean;
  streaming?: boolean;
  controlsDisabled?: boolean;
  providerId: string;
  modelId: string;
  providerOptions: UiSelectOption[];
  modelOptions: UiSelectOption[];
  webSearchMode: AiSearchMode;
  knowledgeSearchMode: AiSearchMode;
  searchModeOptions: UiSelectOption[];
  reasoningEnabled: boolean;
  reasoningEffort: AiReasoningEffort;
  reasoningEffortOptions: UiSelectOption[];
  canvasEnabled: boolean;
  commonPhrases?: string[];
}>(), {
  disabled: false,
  streaming: false,
  controlsDisabled: false,
  commonPhrases: () => [],
});

const emit = defineEmits<{
  send: [content: string, attachments: AiChatAttachment[]];
  stop: [];
  'update:providerId': [value: string];
  'update:modelId': [value: string];
  'update:webSearchMode': [value: AiSearchMode];
  'update:knowledgeSearchMode': [value: AiSearchMode];
  'update:reasoningEnabled': [value: boolean];
  'update:reasoningEffort': [value: AiReasoningEffort];
  'update:canvasEnabled': [value: boolean];
}>();

const content = ref('');
const expanded = ref(false);
const attachments = ref<AiChatAttachment[]>([]);
const attachmentError = ref('');
const stagingAttachment = ref(false);

const canSubmit = computed(() =>
  !props.disabled && (content.value.trim().length > 0 || attachments.value.length > 0));
const optionControlsDisabled = computed(() => props.controlsDisabled || props.streaming);

function submit() {
  const trimmed = content.value.trim();
  if ((!trimmed && !attachments.value.length) || props.disabled) {
    return;
  }
  emit('send', trimmed || '请分析这些附件。', [...attachments.value]);
  content.value = '';
  attachments.value = [];
  attachmentError.value = '';
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

function clearInput() {
  if (props.streaming) {
    return;
  }
  content.value = '';
  attachments.value = [];
  attachmentError.value = '';
}

function insertPhrase(phrase: string) {
  if (props.streaming || props.disabled) {
    return;
  }
  const separator = content.value.trim().length ? '\n' : '';
  content.value = `${content.value}${separator}${phrase}`;
}

async function pickAttachment() {
  if (props.streaming || props.disabled || stagingAttachment.value) {
    return;
  }
  attachmentError.value = '';
  try {
    const selectedPath = await window.shellApi?.selectFile({
      title: '选择 AI 附件',
      filters: [
        {
          name: 'AI 可读文件',
          extensions: [
            'txt',
            'md',
            'markdown',
            'csv',
            'tsv',
            'json',
            'jsonl',
            'yaml',
            'yml',
            'xml',
            'html',
            'css',
            'scss',
            'js',
            'jsx',
            'ts',
            'tsx',
            'vue',
            'rs',
            'py',
            'java',
            'go',
            'sql',
            'log',
            'png',
            'jpg',
            'jpeg',
            'webp',
            'gif',
          ],
        },
      ],
    });
    if (!selectedPath) {
      return;
    }
    stagingAttachment.value = true;
    const result = await window.aiApi?.stageAttachment({ path: selectedPath });
    if (result?.attachment) {
      attachments.value = [...attachments.value, result.attachment];
    }
  } catch (error) {
    attachmentError.value = error instanceof Error ? error.message : String(error);
  } finally {
    stagingAttachment.value = false;
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id);
}

function formatAttachmentSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }
  if (size < 1_000_000) {
    return `${Math.round(size / 1_000)} KB`;
  }
  return `${(size / 1_000_000).toFixed(1)} MB`;
}
</script>

<template>
  <footer class="ai-composer" :class="{ 'ai-composer--expanded': expanded }">
    <UiToolbar class="ai-composer__toolbar" density="compact">
      <div class="ai-composer__toolbar-grid">
        <div class="ai-composer__model-group">
          <UiSelect
            :model-value="providerId"
            class="ai-composer__provider"
            size="sm"
            :options="providerOptions"
            :disabled="optionControlsDisabled"
            placeholder="Provider"
            @update:modelValue="emit('update:providerId', String($event))"
          />
          <UiSelect
            :model-value="modelId"
            class="ai-composer__model"
            size="sm"
            :options="modelOptions"
            :disabled="optionControlsDisabled || providerOptions.length === 0"
            placeholder="模型"
            @update:modelValue="emit('update:modelId', String($event))"
          />
        </div>

        <div class="ai-composer__option-group">
          <UiField class="ai-composer__select-field" label="网页" layout="horizontal">
            <UiSelect
              :model-value="webSearchMode"
              size="sm"
              :options="searchModeOptions"
              :disabled="optionControlsDisabled"
              @update:modelValue="emit('update:webSearchMode', $event as AiSearchMode)"
            />
          </UiField>
          <UiField class="ai-composer__select-field" label="知识库" layout="horizontal">
            <UiSelect
              :model-value="knowledgeSearchMode"
              size="sm"
              :options="searchModeOptions"
              :disabled="optionControlsDisabled"
              @update:modelValue="emit('update:knowledgeSearchMode', $event as AiSearchMode)"
            />
          </UiField>

          <UiCheckbox
            class="ai-composer__check"
            :model-value="reasoningEnabled"
            size="sm"
            :disabled="optionControlsDisabled"
            @update:modelValue="emit('update:reasoningEnabled', $event)"
          >
            深度思考
          </UiCheckbox>
          <UiSelect
            :model-value="reasoningEffort"
            class="ai-composer__effort"
            size="sm"
            :options="reasoningEffortOptions"
            :disabled="optionControlsDisabled || !reasoningEnabled"
            placeholder="推理强度"
            @update:modelValue="emit('update:reasoningEffort', $event as AiReasoningEffort)"
          />
          <UiCheckbox
            class="ai-composer__check"
            :model-value="canvasEnabled"
            size="sm"
            :disabled="optionControlsDisabled"
            @update:modelValue="emit('update:canvasEnabled', $event)"
          >
            Canvas
          </UiCheckbox>
        </div>
      </div>

      <template #trailing>
        <UiIconButton
          size="sm"
          variant="ghost"
          title="添加附件"
          :disabled="disabled || streaming || stagingAttachment"
          @click="pickAttachment"
        >
          <IconRenderer icon="iconify:lucide:paperclip" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" variant="ghost" title="清空输入" :disabled="(!content && !attachments.length) || streaming" @click="clearInput">
          <IconRenderer icon="iconify:lucide:eraser" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" variant="ghost" :title="expanded ? '收起输入区' : '展开输入区'" @click="expanded = !expanded">
          <IconRenderer :icon="expanded ? 'iconify:lucide:minimize-2' : 'iconify:lucide:maximize-2'" :size="15" />
        </UiIconButton>
      </template>
    </UiToolbar>

    <div v-if="commonPhrases.length" class="ai-composer__phrases" aria-label="常用短语">
      <UiButton
        v-for="phrase in commonPhrases"
        :key="phrase"
        size="sm"
        variant="secondary"
        :disabled="disabled || streaming"
        @click="insertPhrase(phrase)"
      >
        {{ phrase }}
      </UiButton>
    </div>

    <div v-if="attachments.length || attachmentError" class="ai-composer__attachments">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="ai-composer__attachment"
      >
        <IconRenderer :icon="attachment.kind === 'image' ? 'iconify:lucide:image' : 'iconify:lucide:file-text'" :size="14" />
        <span class="ai-composer__attachment-name">{{ attachment.name }}</span>
        <span class="ai-composer__attachment-meta">{{ formatAttachmentSize(attachment.size) }}</span>
        <UiIconButton
          size="xs"
          variant="ghost"
          title="移除附件"
          :disabled="streaming"
          @click="removeAttachment(attachment.id)"
        >
          <IconRenderer icon="iconify:lucide:x" :size="13" />
        </UiIconButton>
      </div>
      <p v-if="attachmentError" class="ai-composer__attachment-error">{{ attachmentError }}</p>
    </div>

    <div class="ai-composer__input-row">
      <UiTextarea
        v-model="content"
        class="ai-composer__input"
        :rows="expanded ? 7 : 3"
        resize="none"
        :disabled="disabled"
        placeholder="输入问题，Enter 发送，Shift+Enter 换行"
        @keydown="handleKeydown"
      />
      <div class="ai-composer__actions">
        <UiButton v-if="streaming" variant="danger" @click="emit('stop')">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:square" :size="14" />
          </template>
          停止
        </UiButton>
        <UiButton v-else variant="primary" :disabled="!canSubmit" @click="submit">
          <template #prefix>
            <IconRenderer icon="iconify:lucide:send" :size="14" />
          </template>
          发送
        </UiButton>
      </div>
    </div>
  </footer>
</template>

<style lang="scss" scoped>
.ai-composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 14px;
  border-top: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  background: var(--ui-surface-base);
}

.ai-composer__toolbar {
  min-height: 32px;
}

.ai-composer__toolbar-grid {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(230px, 360px) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.ai-composer__model-group {
  display: grid;
  grid-template-columns: minmax(104px, 148px) minmax(112px, 1fr);
  gap: 6px;
  min-width: 0;
}

.ai-composer__provider,
.ai-composer__model,
.ai-composer__effort {
  min-width: 0;
}

.ai-composer__option-group {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.ai-composer__select-field.ui-field {
  display: inline-grid;
  grid-template-columns: auto minmax(76px, 90px);
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 0.78rem;

  :deep(.ui-field__label) {
    color: var(--ui-text-muted);
    font-size: 0.78rem;
    font-weight: 500;
    white-space: nowrap;
  }

  :deep(.ui-field__control) {
    min-width: 0;
  }
}

.ai-composer__phrases {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.ai-composer__phrases::-webkit-scrollbar {
  display: none;
}

.ai-composer__phrases :deep(.ui-button) {
  max-width: 220px;
}

.ai-composer__attachments {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ai-composer__attachment {
  display: inline-grid;
  grid-template-columns: auto minmax(0, auto) auto auto;
  max-width: min(360px, 100%);
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 8px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-secondary);
  font-size: 0.78rem;
}

.ai-composer__attachment-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-composer__attachment-meta {
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.ai-composer__attachment-error {
  margin: 0;
  color: var(--ui-color-danger);
  font-size: 0.78rem;
}

.ai-composer__check {
  white-space: nowrap;
}

.ai-composer__effort {
  width: 92px;
}

.ai-composer__input-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.ai-composer__input {
  min-height: 74px;
}

.ai-composer--expanded .ai-composer__input {
  min-height: 168px;
}

.ai-composer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 1100px) {
  .ai-composer__toolbar-grid {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .ai-composer__option-group {
    justify-content: flex-start;
  }

  .ai-composer__input-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-composer__actions {
    justify-content: flex-end;
  }
}
</style>
