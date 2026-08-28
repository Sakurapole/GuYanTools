<script lang="ts" setup>
import { defineCustomElements } from '@guyantools/ui-core';

defineOptions({ inheritAttrs: false });
defineCustomElements();

type PickerSize = 'sm' | 'md' | 'lg';
type PickerMode = 'date' | 'datetime';
type ValueFormat = 'date' | 'datetime-local' | 'sql' | 'timestamp';

const props = withDefaults(defineProps<{
  modelValue: string | number | undefined;
  placeholder?: string;
  datePlaceholder?: string;
  timePlaceholder?: string;
  disabled?: boolean;
  size?: PickerSize;
  mode?: PickerMode;
  valueFormat?: ValueFormat;
  valueType?: 'string' | 'timestamp';
  minuteStep?: number;
  clearable?: boolean;
  closeOnOutside?: boolean;
}>(), { placeholder: '选择日期和时间', datePlaceholder: '日期', timePlaceholder: '时间', disabled: false, size: 'md', mode: 'datetime', valueFormat: undefined, valueType: undefined, minuteStep: 5, clearable: true, closeOnOutside: true });

const emit = defineEmits<{
  'update:modelValue': [value: string | number | undefined];
  change: [value: string | number | undefined];
}>();

function handleChange(event: Event): void {
  const value = (event as CustomEvent<{ value: string | number | undefined }>).detail.value;
  emit('update:modelValue', value);
  emit('change', value);
}
</script>

<template>
  <gt-date-time-picker :value="props.modelValue" :placeholder="props.placeholder" :date-placeholder="props.datePlaceholder" :time-placeholder="props.timePlaceholder" :disabled="props.disabled" :size="props.size" :mode="props.mode" :value-format="props.valueFormat" :value-type="props.valueType" :minute-step="props.minuteStep" :clearable="props.clearable" :close-on-outside="props.closeOnOutside" v-bind="$attrs" @gt-change="handleChange" />
</template>
