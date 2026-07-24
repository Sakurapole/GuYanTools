<script lang="ts" setup>
import { computed, useSlots } from 'vue';

type CardVariant = 'default' | 'muted' | 'elevated' | 'interactive';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';
type CardRadius = 'sm' | 'md' | 'lg';

const props = withDefaults(defineProps<{
  variant?: CardVariant;
  padding?: CardPadding;
  radius?: CardRadius;
  bordered?: boolean;
  hoverable?: boolean;
}>(), {
  variant: 'default',
  padding: 'md',
  radius: 'md',
  bordered: true,
  hoverable: false,
});

const slots = useSlots();

const hasStructuredSlots = computed(() => Boolean(slots.header || slots.footer));

const cardClass = computed(() => [
  'ui-card',
  `ui-card--${props.variant}`,
  `ui-card--radius-${props.radius}`,
  {
    'ui-card--bordered': props.bordered,
    'ui-card--hoverable': props.hoverable || props.variant === 'interactive',
    'ui-card--interactive': props.variant === 'interactive',
  },
]);

const slotPaddingClass = computed(() => `ui-card__section--padding-${props.padding}`);
</script>

<template>
  <div :class="cardClass">
    <template v-if="hasStructuredSlots">
      <div v-if="$slots.header" :class="['ui-card__header', slotPaddingClass]">
        <slot name="header" />
      </div>
      <div :class="['ui-card__body', slotPaddingClass]">
        <slot />
      </div>
      <div v-if="$slots.footer" :class="['ui-card__footer', slotPaddingClass]">
        <slot name="footer" />
      </div>
    </template>
    <slot v-else />
  </div>
</template>

<style lang="scss" scoped>
.ui-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-card-bg);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-card-shadow);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;

  &--bordered {
    border: var(--ui-border-width-thin) solid var(--ui-card-border);
  }

  &--radius-sm {
    border-radius: var(--ui-radius-sm);
  }

  &--radius-md {
    border-radius: var(--ui-radius-md);
  }

  &--radius-lg {
    border-radius: var(--ui-radius-lg);
  }

  &--muted {
    background: var(--ui-surface-bg-muted);
    box-shadow: var(--ui-surface-shadow);
  }

  &--elevated {
    background: var(--ui-surface-bg);
    box-shadow: var(--ui-surface-shadow);
  }

  &--interactive {
    cursor: pointer;
  }

  &--hoverable:hover,
  &--interactive:hover {
    transform: translateY(-1px);
    box-shadow: var(--ui-card-shadow-hover);
  }

  &--interactive:focus-within {
    box-shadow: var(--ui-focus-ring), var(--ui-card-shadow-hover);
  }
}

.ui-card__header,
.ui-card__footer {
  flex: 0 0 auto;
}

.ui-card__header + .ui-card__body,
.ui-card__body + .ui-card__footer {
  border-top: var(--ui-border-width-thin) solid var(--ui-card-divider);
}

.ui-card__body {
  flex: 1 1 auto;
  min-height: 0;
}

.ui-card__section--padding-none {
  padding: 0;
}

.ui-card__section--padding-sm {
  padding: var(--ui-card-padding-sm);
}

.ui-card__section--padding-md {
  padding: var(--ui-card-padding-md);
}

.ui-card__section--padding-lg {
  padding: var(--ui-card-padding-lg);
}
</style>
