<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}>(), {
  disabled: false,
  size: 'md',
  ariaLabel: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  change: [value: boolean];
}>();

function toggle() {
  if (props.disabled) {
    return;
  }
  const nextValue = !props.modelValue;
  emit('update:modelValue', nextValue);
  emit('change', nextValue);
}
</script>

<template>
  <button
    class="ui-switch"
    :class="[`ui-switch--${size}`, { 'is-on': modelValue }]"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="ariaLabel || undefined"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="ui-switch__thumb" />
  </button>
</template>

<style scoped lang="scss">
.ui-switch {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-surface-muted);
  box-shadow: inset 0 0 0 var(--ui-border-width-thin) var(--ui-border-subtle);
  cursor: pointer;
  transition: background-color 0.16s ease, opacity 0.16s ease;

  &--md {
    width: 42px;
    height: 24px;
  }

  &--sm {
    width: 34px;
    height: 20px;
  }

  &.is-on {
    background: var(--primary-color);
    box-shadow: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}

.ui-switch__thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ui-surface-base);
  box-shadow: var(--ui-shadow-sm);
  transform: translateX(0);
  transition: transform 0.16s ease;
}

.ui-switch--sm .ui-switch__thumb {
  width: 16px;
  height: 16px;
}

.ui-switch--md.is-on .ui-switch__thumb {
  transform: translateX(18px);
}

.ui-switch--sm.is-on .ui-switch__thumb {
  transform: translateX(14px);
}
</style>
