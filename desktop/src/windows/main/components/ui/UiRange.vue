<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  ariaLabel?: string;
}>(), {
  disabled: false,
  ariaLabel: '',
});

const rangeProgress = computed(() => {
  const total = props.max - props.min;
  if (total <= 0) return '0%';
  const clamped = Math.min(props.max, Math.max(props.min, props.modelValue));
  return `${((clamped - props.min) / total) * 100}%`;
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  change: [value: number];
}>();

function readValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function handleInput(event: Event) {
  emit('update:modelValue', readValue(event));
}

function handleChange(event: Event) {
  emit('change', readValue(event));
}
</script>

<template>
  <input
    class="ui-range"
    type="range"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    :style="{ '--ui-range-progress': rangeProgress }"
    @input="handleInput"
    @change="handleChange"
  >
</template>

<style scoped lang="scss">
.ui-range {
  --ui-range-track-height: 6px;
  --ui-range-thumb-size: 16px;
  --ui-range-track-bg: color-mix(in srgb, var(--ui-input-border) 48%, transparent);
  --ui-range-fill-bg: linear-gradient(90deg, var(--ui-button-primary-bg), var(--primary-color));

  appearance: none;
  width: 100%;
  height: var(--ui-control-height-sm);
  min-width: 0;
  margin: 0;
  border-radius: var(--ui-radius-full);
  background: transparent;
  cursor: pointer;
}

.ui-range::-webkit-slider-runnable-track {
  height: var(--ui-range-track-height);
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-radius: var(--ui-radius-full);
  background:
    linear-gradient(var(--ui-range-fill-bg) 0 0) 0 0 / var(--ui-range-progress) 100% no-repeat,
    var(--ui-range-track-bg);
  box-sizing: border-box;
}

.ui-range::-webkit-slider-thumb {
  appearance: none;
  width: var(--ui-range-thumb-size);
  height: var(--ui-range-thumb-size);
  margin-top: calc((var(--ui-range-track-height) - var(--ui-range-thumb-size)) / 2 - 1px);
  border: 2px solid var(--ui-panel-bg);
  border-radius: 50%;
  background: var(--ui-button-primary-bg);
  box-shadow: var(--ui-shadow-xs);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.ui-range::-moz-range-track {
  height: var(--ui-range-track-height);
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-radius: var(--ui-radius-full);
  background: var(--ui-range-track-bg);
  box-sizing: border-box;
}

.ui-range::-moz-range-progress {
  height: var(--ui-range-track-height);
  border-radius: var(--ui-radius-full);
  background: var(--ui-button-primary-bg);
}

.ui-range::-moz-range-thumb {
  width: var(--ui-range-thumb-size);
  height: var(--ui-range-thumb-size);
  border: 2px solid var(--ui-panel-bg);
  border-radius: 50%;
  background: var(--ui-button-primary-bg);
  box-shadow: var(--ui-shadow-xs);
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.ui-range:hover:not(:disabled)::-webkit-slider-thumb {
  transform: scale(1.08);
  box-shadow: var(--ui-shadow-sm);
}

.ui-range:hover:not(:disabled)::-moz-range-thumb {
  transform: scale(1.08);
  box-shadow: var(--ui-shadow-sm);
}

.ui-range:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.ui-range:focus-visible {
  outline: none;
  box-shadow: var(--ui-focus-ring);
}
</style>
