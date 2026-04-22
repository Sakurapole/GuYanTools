<script lang="ts" setup>
import { computed } from 'vue';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  active?: boolean;
}>(), {
  variant: 'secondary',
  size: 'md',
  block: false,
  disabled: false,
  active: false,
});

const buttonClass = computed(() => [
  'ui-button',
  `ui-button--${props.variant}`,
  `ui-button--${props.size}`,
  {
    'ui-button--block': props.block,
    'ui-button--active': props.active,
  },
]);
</script>

<template>
  <button :class="buttonClass" :disabled="disabled">
    <span v-if="$slots.prefix" class="ui-button__prefix">
      <slot name="prefix" />
    </span>
    <span class="ui-button__label">
      <slot />
    </span>
    <span v-if="$slots.suffix" class="ui-button__suffix">
      <slot name="suffix" />
    </span>
  </button>
</template>

<style lang="scss" scoped>
.ui-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: var(--ui-border-width-thin) solid transparent;
  border-radius: var(--ui-radius-sm);
  font: inherit;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:active:not(:disabled),
  &--active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  &--block {
    width: 100%;
  }

  &--sm {
    min-height: var(--ui-control-height-sm);
    padding: 6px var(--ui-control-padding-x-sm);
    font-size: 0.82rem;
  }

  &--md {
    min-height: var(--ui-control-height-md);
    padding: 9px var(--ui-control-padding-x-lg);
    font-size: 0.9rem;
  }

  &--lg {
    min-height: var(--ui-control-height-lg);
    padding: 11px 18px;
    font-size: 0.96rem;
  }

  &--primary {
    background: var(--ui-button-primary-bg);
    color: var(--ui-button-primary-text);
    border-color: var(--ui-button-primary-border);
    box-shadow: var(--ui-button-primary-shadow);

    &:hover:not(:disabled) {
      background: var(--ui-button-primary-hover-bg);
    }
  }

  &--secondary {
    background: var(--ui-button-secondary-bg);
    color: var(--ui-button-secondary-text);
    border-color: var(--ui-button-secondary-border);
    box-shadow: var(--ui-button-secondary-shadow);

    &:hover:not(:disabled),
    &.ui-button--active:not(:disabled) {
      background: var(--ui-button-secondary-hover-bg);
      border-color: var(--ui-button-secondary-hover-border);
    }
  }

  &--ghost {
    background: transparent;
    color: var(--ui-button-ghost-text);
    border-color: transparent;
    box-shadow: none;

    &:hover:not(:disabled),
    &.ui-button--active:not(:disabled) {
      background: var(--ui-button-ghost-hover-bg);
      color: var(--ui-button-ghost-hover-text);
    }
  }

  &--danger {
    background: var(--ui-button-danger-bg);
    color: var(--ui-button-danger-text);
    border-color: var(--ui-button-danger-border);
    box-shadow: var(--ui-button-danger-shadow);

    &:hover:not(:disabled) {
      background: var(--ui-button-danger-hover-bg);
    }
  }
}

.ui-button__prefix,
.ui-button__suffix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.ui-button__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
</style>
