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
  min-width: min(100%, 360px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.ui-state-card__icon:empty {
  display: none;
}

.ui-state-card__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ui-state-muted);
}

.ui-state-card__title {
  color: var(--ui-state-title);
  font-size: 1.05rem;
}

.ui-state-card__description {
  margin: 0;
  color: var(--ui-state-muted);
  line-height: 1.6;
}

.ui-state-card__actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.ui-state-card--loading .ui-state-card__title,
.ui-state-card--empty .ui-state-card__title,
.ui-state-card--info .ui-state-card__title {
  color: var(--ui-state-title);
}

.ui-state-card--error .ui-state-card__title {
  color: var(--ui-state-error);
}

.ui-state-card--compact {
  min-width: min(100%, 280px);
  padding-inline: 20px;
}
</style>
