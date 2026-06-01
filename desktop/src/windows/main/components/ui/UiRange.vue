<script setup lang="ts">
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
    @input="handleInput"
    @change="handleChange"
  >
</template>

<style scoped lang="scss">
.ui-range {
  width: 100%;
  min-width: 0;
  accent-color: var(--ui-primary-color);
  cursor: pointer;
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
