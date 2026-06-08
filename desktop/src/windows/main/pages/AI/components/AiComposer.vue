<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AiReasoningEffort, AiSearchMode } from '@/contracts/ai';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import UiCheckbox from '@/windows/main/components/ui/UiCheckbox.vue';
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
}>(), {
  disabled: false,
  streaming: false,
  controlsDisabled: false,
});

const emit = defineEmits<{
  send: [content: string];
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

const canSubmit = computed(() => !props.disabled && content.value.trim().length > 0);
const optionControlsDisabled = computed(() => props.controlsDisabled || props.streaming);

function submit() {
  const trimmed = content.value.trim();
  if (!trimmed || props.disabled) {
    return;
  }
  emit('send', trimmed);
  content.value = '';
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
          <label class="ai-composer__select-field">
            <span>网页</span>
            <UiSelect
              :model-value="webSearchMode"
              size="sm"
              :options="searchModeOptions"
              :disabled="optionControlsDisabled"
              @update:modelValue="emit('update:webSearchMode', $event as AiSearchMode)"
            />
          </label>
          <label class="ai-composer__select-field">
            <span>知识库</span>
            <UiSelect
              :model-value="knowledgeSearchMode"
              size="sm"
              :options="searchModeOptions"
              :disabled="optionControlsDisabled"
              @update:modelValue="emit('update:knowledgeSearchMode', $event as AiSearchMode)"
            />
          </label>

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
        <UiIconButton size="sm" variant="ghost" title="清空输入" :disabled="!content || streaming" @click="clearInput">
          <IconRenderer icon="iconify:lucide:eraser" :size="15" />
        </UiIconButton>
        <UiIconButton size="sm" variant="ghost" :title="expanded ? '收起输入区' : '展开输入区'" @click="expanded = !expanded">
          <IconRenderer :icon="expanded ? 'iconify:lucide:minimize-2' : 'iconify:lucide:maximize-2'" :size="15" />
        </UiIconButton>
      </template>
    </UiToolbar>

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

.ai-composer__select-field {
  display: inline-grid;
  grid-template-columns: auto minmax(76px, 90px);
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--ui-text-muted);
  font-size: 0.78rem;

  > span {
    white-space: nowrap;
  }
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
