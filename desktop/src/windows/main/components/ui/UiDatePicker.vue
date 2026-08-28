<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

type PickerSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  size?: PickerSize;
  min?: string;
  max?: string;
  closeOnOutside?: boolean;
}>(), { placeholder: '选择日期', clearable: true, disabled: false, size: 'md', min: '', max: '', closeOnOutside: true });

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  clear: [];
}>();

function handleChange(event: Event): void {
  const value = (event as CustomEvent<{ value: string }>).detail.value;
  emit('update:modelValue', value);
  emit('change', value);
}

function handleClear(): void {
  emit('update:modelValue', '');
  emit('clear');
}
</script>

<template>
  <gt-date-picker :value="props.modelValue" :placeholder="props.placeholder" :clearable="props.clearable" :disabled="props.disabled" :size="props.size" :min="props.min" :max="props.max" :close-on-outside="props.closeOnOutside" v-bind="$attrs" @gt-change="handleChange" @gt-clear="handleClear" />
</template>
