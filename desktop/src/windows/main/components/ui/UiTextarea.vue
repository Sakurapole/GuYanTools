<script lang="ts" setup>
import { computed, ref } from 'vue';

type TextareaResize = 'none' | 'vertical' | 'horizontal' | 'both';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  id?: string;
  rows?: number;
  spellcheck?: boolean | 'true' | 'false';
  autocorrect?: string;
  autocapitalize?: string;
  resize?: TextareaResize;
}>(), {
  placeholder: '',
  disabled: false,
  readonly: false,
  id: '',
  rows: undefined,
  spellcheck: undefined,
  autocorrect: undefined,
  autocapitalize: undefined,
  resize: 'vertical',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  keydown: [event: KeyboardEvent];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

const textareaClass = computed(() => [
  'ui-textarea',
  `ui-textarea--resize-${props.resize}`,
]);

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}

function handleChange(event: Event) {
  emit('change', (event.target as HTMLTextAreaElement).value);
}

function focus() {
  textareaRef.value?.focus();
}

function select() {
  textareaRef.value?.select();
}

defineExpose({
  focus,
  select,
});
</script>

<template>
  <textarea
    ref="textareaRef"
    :id="id || undefined"
    :class="textareaClass"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :rows="rows"
    :spellcheck="spellcheck"
    :autocorrect="autocorrect"
    :autocapitalize="autocapitalize"
    @input="handleInput"
    @change="handleChange"
    @focus="emit('focus', $event)"
    @blur="emit('blur', $event)"
    @keydown="emit('keydown', $event)"
  />
</template>

<style lang="scss" scoped>
.ui-textarea {
  width: 100%;
  min-width: 0;
  border: var(--ui-border-width-thin) solid var(--ui-input-border);
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-control-padding-y-md) var(--ui-control-padding-x-md);
  background: var(--ui-input-bg);
  color: var(--ui-input-text);
  box-sizing: border-box;
  font: inherit;
  line-height: 1.5;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  &:focus {
    outline: none;
    border-color: var(--ui-input-focus-border);
    box-shadow: var(--ui-focus-ring);
  }

  &:disabled,
  &:read-only {
    background: var(--ui-input-disabled-bg);
    color: var(--ui-input-disabled-text);
  }

  &::placeholder {
    color: var(--ui-input-placeholder);
  }

  &--resize-none {
    resize: none;
  }

  &--resize-vertical {
    resize: vertical;
  }

  &--resize-horizontal {
    resize: horizontal;
  }

  &--resize-both {
    resize: both;
  }
}
</style>
