<script setup lang="ts">
import { computed } from 'vue';
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiButton from '@/windows/main/components/ui/UiButton.vue';
import type { KnowledgeBlockV2Type } from '@/windows/main/utils/knowledge_blocks_v2';

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  query: string;
  options: Array<{ type: KnowledgeBlockV2Type; icon: string; label: string; keywords?: string[] }>;
}>();

const emit = defineEmits<{
  (event: 'select', type: KnowledgeBlockV2Type): void;
  (event: 'close'): void;
}>();

const menuStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));

const filteredOptions = computed(() => {
  const query = props.query.trim().toLowerCase();
  if (!query) return props.options;
  return props.options.filter((option) => [
    option.type,
    option.label,
    ...(option.keywords ?? []),
  ].some((value) => value.toLowerCase().includes(query)));
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="knowledge-slash-menu" :style="menuStyle" role="menu">
      <UiButton
        v-for="option in filteredOptions"
        :key="option.type"
        class="knowledge-slash-menu__item"
        type="button"
        variant="ghost"
        size="sm"
        role="menuitem"
        @click="emit('select', option.type)"
      >
        <template #prefix>
          <IconRenderer :icon="option.icon" :size="15" />
        </template>
        <span>{{ option.label }}</span>
      </UiButton>
      <div v-if="!filteredOptions.length" class="knowledge-slash-menu__empty">没有匹配块</div>
      <UiButton type="button" variant="ghost" size="sm" class="knowledge-slash-menu__close" @click="emit('close')">
        关闭
      </UiButton>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.knowledge-slash-menu {
  position: fixed;
  z-index: 4200;
  display: grid;
  gap: 2px;
  width: min(240px, calc(100vw - 24px));
  max-height: min(360px, calc(100vh - 24px));
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 8px;
  background: var(--ui-surface-panel);
  box-shadow: var(--ui-shadow-popover, 0 10px 28px rgb(15 23 42 / 18%));
}

.knowledge-slash-menu__item {
  justify-content: flex-start;
}

.knowledge-slash-menu__empty {
  padding: 8px 10px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-xs);
}

.knowledge-slash-menu__close {
  justify-self: stretch;
  color: var(--ui-text-muted);
}
</style>
