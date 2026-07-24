<script setup lang="ts">
import IconRenderer from './IconRenderer.vue';

withDefaults(defineProps<{
  icon?: string;
  title?: string;
  description?: string;
  compact?: boolean;
}>(), {
  icon: '',
  title: '',
  description: '',
  compact: false,
});
</script>

<template>
  <section class="ui-empty-state" :class="{ 'ui-empty-state--compact': compact }">
    <div v-if="icon" class="ui-empty-state__icon" aria-hidden="true">
      <IconRenderer :icon="icon" :size="compact ? 18 : 24" />
    </div>
    <h3 v-if="title">{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="ui-empty-state__actions">
      <slot />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.ui-empty-state {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  color: var(--ui-text-muted);
  text-align: center;
}

.ui-empty-state--compact {
  gap: 5px;
  padding: 14px;
}

.ui-empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-overlay);
  color: var(--ui-text-secondary);
}

.ui-empty-state--compact .ui-empty-state__icon {
  width: 30px;
  height: 30px;
}

h3 {
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: 0.92rem;
  font-weight: 700;
}

p {
  max-width: 360px;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
}

.ui-empty-state__actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}
</style>
