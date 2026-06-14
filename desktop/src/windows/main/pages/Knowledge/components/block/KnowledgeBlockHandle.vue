<script setup lang="ts">
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';

const emit = defineEmits<{
  (event: 'insert-after'): void;
  (event: 'menu', value: MouseEvent): void;
  (event: 'dragstart', value: DragEvent): void;
}>();
</script>

<template>
  <aside class="knowledge-block__actions" aria-label="块操作">
    <UiIconButton class="knowledge-block__action-button" type="button" title="在下方添加块" size="sm" @click="emit('insert-after')">
      <IconRenderer icon="iconify:lucide:plus" :size="14" />
    </UiIconButton>
    <button
      class="knowledge-block__drag-grip"
      type="button"
      title="拖拽移动块"
      draggable="true"
      aria-label="打开块菜单或拖拽移动块"
      @click="event => emit('menu', event)"
      @dragstart="event => emit('dragstart', event)"
    >
      <IconRenderer icon="iconify:lucide:grip-vertical" :size="15" />
    </button>
  </aside>
</template>

<style scoped lang="scss">
.knowledge-block__actions {
  position: absolute;
  top: 2px;
  left: -46px;
  display: flex;
  flex-direction: row;
  gap: 1px;
  align-self: start;
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity 0.14s ease,
    transform 0.14s ease,
    filter 0.14s ease;

  :deep(.ui-icon-button) {
    width: 21px;
    height: 24px;
    min-height: 24px;
    border-radius: 4px;
    color: color-mix(in srgb, var(--ui-text-muted) 86%, transparent);
    background: transparent;
    box-shadow: none;
    transform: none;

    &:hover,
    &:focus-visible {
      color: var(--ui-text-primary);
      background: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);
    }
  }
}

.knowledge-block__drag-grip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  color: color-mix(in srgb, var(--ui-text-muted) 86%, transparent);
  background: transparent;
  cursor: grab;

  &:hover,
  &:focus-visible {
    outline: none;
    color: var(--ui-text-primary);
    background: color-mix(in srgb, var(--ui-surface-panel-muted) 72%, transparent);
  }

  &:active {
    cursor: grabbing;
  }
}

:global(.knowledge-block:hover) .knowledge-block__actions,
:global(.knowledge-block:focus-within) .knowledge-block__actions {
  opacity: 1;
  transform: translateX(0);
}

@media (prefers-reduced-motion: reduce) {
  .knowledge-block__actions {
    transition: opacity 0.01ms linear;
  }
}

@media (max-width: 980px) {
  .knowledge-block__actions {
    position: static;
    grid-row: 1;
    margin-bottom: 2px;
    opacity: 1;
    transform: none;
  }
}
</style>
