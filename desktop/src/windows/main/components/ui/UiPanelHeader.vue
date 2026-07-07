<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header class="ui-panel-header">
    <div class="ui-panel-header__text">
      <h3>{{ title }}</h3>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="ui-panel-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style lang="scss" scoped>
.ui-panel-header {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ui-panel-header__text {
  min-width: 0;

  h3 {
    margin: 0;
    color: var(--ui-text-primary);
    font-size: 0.96rem;
    font-weight: 750;
    line-height: 1.3;
  }

  p {
    margin: 4px 0 0;
    color: var(--ui-text-muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }
}

.ui-panel-header__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}
</style>
