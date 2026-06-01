<script setup lang="ts">
import IconRenderer from '@/windows/main/components/ui/IconRenderer.vue';
import UiIconButton from '@/windows/main/components/ui/UiIconButton.vue';

defineProps<{
  disabledUp?: boolean;
  disabledDown?: boolean;
}>();

const emit = defineEmits<{
  (event: 'move-up'): void;
  (event: 'move-down'): void;
  (event: 'indent'): void;
  (event: 'outdent'): void;
  (event: 'insert-after'): void;
  (event: 'duplicate'): void;
  (event: 'remove'): void;
}>();
</script>

<template>
  <aside class="knowledge-block__actions" aria-label="块操作">
    <UiIconButton type="button" title="上移" size="sm" :disabled="disabledUp" @click="emit('move-up')">
      <IconRenderer icon="iconify:lucide:arrow-up" :size="14" />
    </UiIconButton>
    <UiIconButton type="button" title="下移" size="sm" :disabled="disabledDown" @click="emit('move-down')">
      <IconRenderer icon="iconify:lucide:arrow-down" :size="14" />
    </UiIconButton>
    <UiIconButton type="button" title="在下方添加正文" size="sm" @click="emit('insert-after')">
      <IconRenderer icon="iconify:lucide:plus" :size="14" />
    </UiIconButton>
    <UiIconButton type="button" title="缩进为子块" size="sm" @click="emit('indent')">
      <IconRenderer icon="iconify:lucide:indent-increase" :size="14" />
    </UiIconButton>
    <UiIconButton type="button" title="减少缩进" size="sm" @click="emit('outdent')">
      <IconRenderer icon="iconify:lucide:indent-decrease" :size="14" />
    </UiIconButton>
    <UiIconButton type="button" title="复制块" size="sm" @click="emit('duplicate')">
      <IconRenderer icon="iconify:lucide:copy" :size="14" />
    </UiIconButton>
    <UiIconButton type="button" title="删除块" variant="danger" size="sm" @click="emit('remove')">
      <IconRenderer icon="iconify:lucide:trash-2" :size="14" />
    </UiIconButton>
  </aside>
</template>

<style scoped lang="scss">
.knowledge-block__actions {
  display: flex;
  gap: 4px;
  align-self: start;
}

@media (max-width: 980px) {
  .knowledge-block__actions {
    justify-content: flex-end;
  }
}
</style>
