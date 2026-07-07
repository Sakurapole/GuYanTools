<script setup lang="ts">
import { computed } from 'vue';
import UiRange from './UiRange.vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  valueText?: string;
  unit?: string;
}>(), {
  disabled: false,
  label: '',
  ariaLabel: '',
  valueText: '',
  unit: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  change: [value: number];
}>();

const displayValue = computed(() => {
  if (props.valueText) return props.valueText;
  return `${props.modelValue}${props.unit}`;
});

function handleUpdate(value: number) {
  emit('update:modelValue', value);
}

function handleChange(value: number) {
  emit('change', value);
}
</script>

<template>
  <label class="ui-slider-field" :class="{ 'ui-slider-field--disabled': disabled }">
    <span v-if="label" class="ui-slider-field__label">{{ label }}</span>
    <span class="ui-slider-field__control">
      <UiRange
        :model-value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :aria-label="ariaLabel || label || undefined"
        @update:modelValue="handleUpdate"
        @change="handleChange"
      />
      <span class="ui-slider-field__value">{{ displayValue }}</span>
    </span>
  </label>
</template>

<style scoped lang="scss">
.ui-slider-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  width: 100%;
  color: var(--ui-text-primary);
}

.ui-slider-field__label {
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-size-xs);
  font-weight: 600;
  line-height: 1.35;
}

.ui-slider-field__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(44px, auto);
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.ui-slider-field__value {
  justify-self: end;
  min-width: 44px;
  padding: 2px 6px;
  border-radius: var(--ui-radius-xs);
  background: color-mix(in srgb, var(--ui-input-bg) 86%, transparent);
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
  font-variant-numeric: tabular-nums;
  line-height: 1.45;
  text-align: right;
  box-sizing: border-box;
}

.ui-slider-field--disabled {
  opacity: 0.62;
}
</style>
