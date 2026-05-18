<script lang="ts" setup>
import { computed } from 'vue';

type IconButtonVariant = 'ghost' | 'secondary' | 'danger' | 'primary';
type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonShape = 'square' | 'circle';

const props = withDefaults(defineProps<{
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  shape?: IconButtonShape;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  /** 图标文字按钮模式：传入文字标签后切换为自适应宽度布局 */
  label?: string;
}>(), {
  variant: 'ghost',
  size: 'md',
  shape: 'square',
  disabled: false,
  active: false,
  title: '',
  type: 'button',
  label: '',
});

const hasLabel = computed(() => Boolean(props.label));

const buttonClass = computed(() => [
  'ui-icon-button',
  `ui-icon-button--${props.variant}`,
  `ui-icon-button--${props.size}`,
  `ui-icon-button--${props.shape}`,
  {
    'ui-icon-button--active': props.active,
    'ui-icon-button--labeled': hasLabel.value,
  },
]);
</script>

<template>
  <button :type="type" :class="buttonClass" :disabled="disabled" :title="title || label || undefined" :aria-label="title || label || undefined">
    <!-- 图标插槽 -->
    <span v-if="$slots.default" class="ui-icon-button__icon">
      <slot />
    </span>
    <!-- 文字标签（可选） -->
    <span v-if="hasLabel" class="ui-icon-button__label">{{ label }}</span>
  </button>
</template>

<style lang="scss" scoped>
.ui-icon-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: var(--ui-border-width-thin) solid transparent;
  background: transparent;
  color: var(--ui-icon-button-text);
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
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
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  :deep(svg) {
    fill: currentColor;
  }

  &--square {
    border-radius: var(--ui-radius-sm);
  }

  &--circle {
    border-radius: var(--ui-radius-full);
  }

  /* 纯图标模式：固定正方形尺寸 */
  &--sm:not(.ui-icon-button--labeled) {
    width: 28px;
    height: 28px;
  }

  &--md:not(.ui-icon-button--labeled) {
    width: 34px;
    height: 34px;
  }

  &--lg:not(.ui-icon-button--labeled) {
    width: 40px;
    height: 40px;
  }

  /* 图标+文字模式：自适应宽度 */
  &--labeled {
    gap: 6px;
    white-space: nowrap;
    font: inherit;
    font-weight: 600;
    user-select: none;

    &.ui-icon-button--sm {
      min-height: var(--ui-control-height-sm);
      padding: 4px var(--ui-control-padding-x-sm);
      font-size: 0.82rem;
    }

    &.ui-icon-button--md {
      min-height: var(--ui-control-height-md);
      padding: 7px var(--ui-control-padding-x-lg);
      font-size: 0.9rem;
    }

    &.ui-icon-button--lg {
      min-height: var(--ui-control-height-lg);
      padding: 9px 18px;
      font-size: 0.96rem;
    }
  }

  &--ghost {
    background: transparent;
    color: var(--ui-icon-button-text);

    &:hover:not(:disabled),
    &.ui-icon-button--active:not(:disabled) {
      background: var(--ui-icon-button-hover-bg);
      color: var(--ui-icon-button-hover-text);
    }
  }

  &--secondary {
    background: var(--ui-icon-button-secondary-bg);
    border-color: var(--ui-icon-button-secondary-border);
    color: var(--ui-icon-button-secondary-text);

    &:hover:not(:disabled),
    &.ui-icon-button--active:not(:disabled) {
      background: var(--ui-icon-button-secondary-hover-bg);
      border-color: var(--ui-icon-button-secondary-hover-border);
    }
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

  &--danger {
    background: transparent;
    color: var(--ui-icon-button-danger-text);

    &:hover:not(:disabled),
    &.ui-icon-button--active:not(:disabled) {
      background: var(--ui-icon-button-danger-hover-bg);
      color: var(--ui-icon-button-danger-hover-text);
    }
  }
}

.ui-icon-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.ui-icon-button__label {
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
