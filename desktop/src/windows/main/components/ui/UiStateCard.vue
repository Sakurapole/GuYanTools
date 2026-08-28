<script lang="ts" setup>
import { computed } from 'vue';
import UiCard from './UiCard.vue';

type StateCardState = 'loading' | 'empty' | 'error' | 'info';

const props = withDefaults(defineProps<{
  state?: StateCardState;
  title: string;
  description?: string;
  compact?: boolean;
}>(), {
  state: 'info',
  description: '',
  compact: false,
});

const cardClass = computed(() => [
  'ui-state-card',
  `ui-state-card--${props.state}`,
  {
    'ui-state-card--compact': props.compact,
  },
]);

const eyebrowText = computed(() => {
  switch (props.state) {
    case 'loading':
      return 'Loading';
    case 'empty':
      return 'Empty';
    case 'error':
      return 'Error';
    default:
      return 'Info';
  }
});
</script>

<template>
  <UiCard :class="cardClass" variant="default" padding="lg" radius="md">
    <div class="ui-state-card__icon">
      <slot name="icon" />
    </div>
    <span class="ui-state-card__eyebrow">{{ eyebrowText }}</span>
    <strong class="ui-state-card__title">{{ title }}</strong>
    <p v-if="description" class="ui-state-card__description">{{ description }}</p>
    <div v-if="$slots.actions" class="ui-state-card__actions">
      <slot name="actions" />
    </div>
  </UiCard>
</template>

<style lang="scss" scoped>
.ui-state-card {
  min-width: var(--gt-state-card-min-width, min(100%, 360px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gt-state-card-gap, 8px);
  padding: var(--gt-state-card-padding, 0);
  text-align: center;
  border: var(--ui-border-width-thin) solid var(--gt-state-card-border-color, var(--ui-card-border));
  border-radius: var(--gt-state-card-radius, var(--ui-radius-md));
  background: var(--gt-state-card-background, var(--ui-card-bg));
  box-shadow: var(--gt-state-card-shadow, var(--ui-card-shadow));
}

.ui-state-card__icon:empty {
  display: none;
}

.ui-state-card__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--gt-state-card-eyebrow-color, var(--ui-state-muted));
}

.ui-state-card__title {
  color: var(--gt-state-card-title-color, var(--ui-state-title));
  font-size: 1.05rem;
  font-weight: var(--gt-state-card-title-font-weight, bolder);
}

.ui-state-card__description {
  margin: 0;
  max-width: var(--gt-state-card-description-max-width, none);
  color: var(--gt-state-card-description-color, var(--ui-state-muted));
  line-height: 1.6;
}

.ui-state-card__actions {
  display: flex;
  gap: var(--gt-state-card-actions-gap, 12px);
  margin-top: 4px;
}

.ui-state-card--loading .ui-state-card__title,
.ui-state-card--empty .ui-state-card__title,
.ui-state-card--info .ui-state-card__title {
  color: var(--ui-state-title);
}

.ui-state-card--error .ui-state-card__title {
  color: var(--gt-state-card-error-title-color, var(--ui-state-error));
}

.ui-state-card--compact {
  min-width: var(--gt-state-card-compact-min-width, min(100%, 280px));
  padding-inline: var(--gt-state-card-compact-padding-inline, 20px);
}
</style>
