<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

type PickerSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  disabled?: boolean;
  size?: PickerSize;
  minuteStep?: number;
  closeOnOutside?: boolean;
}>(), { placeholder: '选择时间', disabled: false, size: 'md', minuteStep: 5, closeOnOutside: true });

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
}>();

function handleChange(event: Event): void {
  const value = (event as CustomEvent<{ value: string }>).detail.value;
  emit('update:modelValue', value);
  emit('change', value);
}
</script>

<template>
  <gt-time-picker :value="props.modelValue" :placeholder="props.placeholder" :disabled="props.disabled" :size="props.size" :minute-step="props.minuteStep" :close-on-outside="props.closeOnOutside" v-bind="$attrs" @gt-change="handleChange" />
</template>
