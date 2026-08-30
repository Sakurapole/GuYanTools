<script setup lang="ts">
import { ensureGuYanElements } from '../register';
ensureGuYanElements();

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  valueText?: string;
  unit?: string;
}>(), { min: 0, max: 100, step: 1, disabled: false, label: '', ariaLabel: '', valueText: '', unit: '' });

const emit = defineEmits<{ 'update:modelValue': [value: number]; change: [value: number] }>();
function update(event: Event): void {
  const value = Number((event as CustomEvent<{ value: number }>).detail.value);
  emit('update:modelValue', value);
  emit('change', value);
}
</script>
<template>
  <gt-slider-field :value="props.modelValue" :min="props.min" :max="props.max" :step="props.step" :disabled="props.disabled" :label="props.label" :aria-label="props.ariaLabel || undefined" :value-text="props.valueText" :unit="props.unit" v-bind="$attrs" @gt-change="update" />
</template>
