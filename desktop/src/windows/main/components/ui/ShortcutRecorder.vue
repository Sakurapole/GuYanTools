<script lang="ts" setup>
import { computed, ref } from 'vue';
import { acceleratorFromKeyboardEvent, humanizeAccelerator } from '@/shared/shortcuts';

const props = withDefaults(defineProps<{
  modelValue: string;
  defaultValue?: string;
  placeholder?: string;
}>(), {
  defaultValue: '',
  placeholder: '未设置',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const captureButtonRef = ref<HTMLButtonElement | null>(null);
const capturing = ref(false);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

const displayValue = computed(() => {
  if (capturing.value) {
    return '按下快捷键...';
  }

  return humanizeAccelerator(props.modelValue, isMac) || props.placeholder;
});

function beginCapture() {
  capturing.value = true;
  captureButtonRef.value?.focus();
}

function stopCapture() {
  capturing.value = false;
}

function clearShortcut() {
  emit('update:modelValue', '');
  stopCapture();
}

function resetShortcut() {
  emit('update:modelValue', props.defaultValue);
  stopCapture();
}

function handleKeydown(event: KeyboardEvent) {
  if (!capturing.value) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    stopCapture();
    return;
  }

  const accelerator = acceleratorFromKeyboardEvent(event);
  if (!accelerator) {
    return;
  }

  emit('update:modelValue', accelerator);
  stopCapture();
}
</script>

<template>
  <div class="shortcut-recorder">
    <button
      ref="captureButtonRef"
      type="button"
      class="shortcut-recorder__display"
      :class="{ 'shortcut-recorder__display--capturing': capturing }"
      @click="beginCapture"
      @keydown="handleKeydown"
      @blur="stopCapture"
    >
      {{ displayValue }}
    </button>
    <button type="button" class="shortcut-recorder__action" @click="beginCapture">
      {{ capturing ? '录制中' : '录制' }}
    </button>
    <button
      type="button"
      class="shortcut-recorder__action"
      :disabled="!modelValue"
      @click="clearShortcut"
    >
      清空
    </button>
    <button
      type="button"
      class="shortcut-recorder__action"
      :disabled="modelValue === defaultValue"
      @click="resetShortcut"
    >
      默认
    </button>
  </div>
</template>

<style lang="scss" scoped>
.shortcut-recorder {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.shortcut-recorder__display {
  flex: 1;
  min-width: 0;
  min-height: var(--ui-control-height-md);
  padding: var(--ui-control-padding-y-md) var(--ui-control-padding-x-md);
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;

  &:focus {
    outline: none;
    border-color: var(--ui-input-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &--capturing {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 99 102 241), 0.14);
    color: var(--ui-text-primary);
  }
}

.shortcut-recorder__action {
  min-height: var(--ui-control-height-md);
  padding: 0 12px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-secondary);
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover:not(:disabled) {
    background: var(--ui-button-ghost-hover-bg);
    color: var(--ui-text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
