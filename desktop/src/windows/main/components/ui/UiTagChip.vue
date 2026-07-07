<script setup lang="ts">
import IconRenderer from './IconRenderer.vue';

withDefaults(defineProps<{
  label: string;
  color?: string;
  subtle?: boolean;
  removable?: boolean;
}>(), {
  color: 'var(--primary-color)',
  subtle: false,
  removable: false,
});

defineEmits<{
  remove: [];
}>();
</script>

<template>
  <span
    class="ui-tag-chip"
    :class="{ 'ui-tag-chip--subtle': subtle, 'ui-tag-chip--removable': removable }"
    :style="{ '--tag-chip-color': color }"
    :title="label"
  >
    <span class="ui-tag-chip__dot" />
    <span class="ui-tag-chip__label">{{ label }}</span>
    <button
      v-if="removable"
      class="ui-tag-chip__remove"
      type="button"
      :aria-label="`删除标签 ${label}`"
      @click.stop="$emit('remove')"
    >
      <IconRenderer icon="iconify:lucide:x" :size="11" />
    </button>
  </span>
</template>

<style scoped lang="scss">
.ui-tag-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-height: 22px;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--tag-chip-color) 38%, var(--ui-border-subtle));
  border-radius: 999px;
  background: color-mix(in srgb, var(--tag-chip-color) 14%, var(--ui-surface-panel));
  color: color-mix(in srgb, var(--ui-text-primary) 88%, var(--tag-chip-color));
  font-size: var(--ui-font-size-xs);
  font-weight: 650;
  line-height: 1;
  box-sizing: border-box;
}

.ui-tag-chip--removable {
  padding-right: 4px;
}

.ui-tag-chip--subtle {
  border-color: color-mix(in srgb, var(--tag-chip-color) 24%, transparent);
  background: color-mix(in srgb, var(--tag-chip-color) 10%, transparent);
}

.ui-tag-chip__dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tag-chip-color);
}

.ui-tag-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-tag-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: -2px;
  border: 0;
  border-radius: 50%;
  color: color-mix(in srgb, var(--ui-text-primary) 64%, transparent);
  background: transparent;
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.16s ease,
    background 0.16s ease,
    color 0.16s ease;
}

.ui-tag-chip:hover .ui-tag-chip__remove,
.ui-tag-chip__remove:focus-visible {
  opacity: 1;
}

.ui-tag-chip__remove:hover {
  color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--tag-chip-color) 18%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .ui-tag-chip__remove {
    transition: none;
  }
}
</style>
