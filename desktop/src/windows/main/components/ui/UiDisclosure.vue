<script lang="ts" setup>
withDefaults(defineProps<{
  title: string;
  open?: boolean;
}>(), {
  open: false,
});
</script>

<template>
  <details class="ui-disclosure" :open="open">
    <summary class="ui-disclosure__summary">{{ title }}</summary>
    <div class="ui-disclosure__body">
      <slot />
    </div>
  </details>
</template>

<style lang="scss" scoped>
.ui-disclosure {
  padding: 8px 10px;
  border: var(--ui-border-width-thin) solid var(--ui-border-subtle);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.ui-disclosure__summary {
  cursor: pointer;
  color: var(--ui-text-secondary);
  font-weight: 650;

  &:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-ring);
  }
}

.ui-disclosure__body {
  margin-top: 8px;
}
</style>
