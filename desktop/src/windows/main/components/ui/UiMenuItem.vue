<script lang="ts" setup>
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  danger?: boolean;
  disabled?: boolean;
}>(), {
  danger: false,
  disabled: false,
});

const itemClass = computed(() => [
  'ui-menu-item',
  {
    'ui-menu-item--danger': props.danger,
    'ui-menu-item--disabled': props.disabled,
  },
]);

function handleClick(event: MouseEvent) {
  if (props.disabled) {
    event.preventDefault();
    event.stopPropagation();
  }
}
</script>

<template>
  <button type="button" :class="itemClass" :disabled="disabled" @click="handleClick">
    <span v-if="$slots.icon" class="ui-menu-item__icon">
      <slot name="icon" />
    </span>
    <span class="ui-menu-item__text">
      <slot />
    </span>
    <span v-if="$slots.suffix" class="ui-menu-item__suffix">
      <slot name="suffix" />
    </span>
  </button>
</template>

<style lang="scss" scoped>
.ui-menu-item {
  appearance: none;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border: none;
  border-radius: var(--ui-radius-xs);
  background: transparent;
  color: var(--ui-menu-item-text);
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 13px;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--ui-menu-item-hover-bg);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled,
  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--danger {
    color: var(--ui-menu-danger-text);

    &:hover:not(:disabled) {
      background: var(--ui-menu-danger-hover-bg);
      color: var(--ui-menu-danger-text);
    }
  }
}

.ui-menu-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  font-size: 14px;
}

.ui-menu-item__text {
  flex: 1;
  font-weight: 500;
}

.ui-menu-item__suffix {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  flex: 0 0 auto;
}
</style>
